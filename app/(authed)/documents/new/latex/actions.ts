'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import * as documentsQ from '@/lib/db/queries/documents'
import { getMasterCV } from '@/lib/documents/master'
import { fillTemplate, getTemplate } from '@/lib/latex/templates'
import { getAIProviderForUser } from '@/lib/ai'
import { logger } from '@/lib/logger'

export type CreateLatexResult = { documentId: string } | { error: string }

type LatexDocKind = 'latex_cv' | 'latex_cover_letter'

async function nextTitle(
  userId: string,
  kind: LatexDocKind,
): Promise<{ title: string; version: number }> {
  const version = await documentsQ.nextVersion(userId, null, kind)
  const prefix = kind === 'latex_cv' ? 'LaTeX CV' : 'LaTeX Letter'
  return { title: `${prefix} v${version}`, version }
}

function isRedirectError(err: unknown): boolean {
  return (
    err instanceof Error &&
    'digest' in err &&
    typeof (err as { digest?: string }).digest === 'string' &&
    (err as { digest: string }).digest.startsWith('NEXT_REDIRECT')
  )
}

/**
 * Seed a new LaTeX document from a template, pre-filled with the user's
 * master CV content (if one exists — otherwise falls back to placeholder
 * content). The template's `kind` determines whether the new document is a
 * `latex_cv` or a `latex_cover_letter`.
 */
export async function createFromTemplate(templateId: string): Promise<CreateLatexResult> {
  try {
    const userId = await requireUserId()
    const template = getTemplate(templateId)
    if (!template) return { error: `Unknown template: ${templateId}` }

    const master = await getMasterCV(userId)
    const docKind: LatexDocKind =
      template.kind === 'cover_letter' ? 'latex_cover_letter' : 'latex_cv'

    let source: string
    if (template.kind === 'cover_letter') {
      // Blank-letter path: fill placeholders. If the user has a master CV we
      // pre-fill sender_name / sender_contact_line from it; otherwise the
      // template renders bracketed [Your Name] / [email · phone · location].
      source = fillTemplate(templateId, master, {
        dateLine: new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
      })
    } else if (master) {
      source = fillTemplate(templateId, master)
    } else {
      // No master CV yet — use a placeholder shape so the editor still opens
      // with something compilable. User replaces content inline.
      source = fillTemplate(templateId, {
        basics: { name: 'Your Name', headline: 'Your Headline' },
        summary: 'Your professional summary goes here.',
        experience: [],
        skills: { primary: [] },
      })
    }

    const { title, version } = await nextTitle(userId, docKind)
    const doc = await documentsQ.create(userId, {
      applicationId: null,
      kind: docKind,
      version,
      title,
      content: { source, templateId },
    })
    revalidatePath('/documents')
    redirect(`/documents/${doc.id}/edit`)
  } catch (err) {
    // redirect() throws internally; let Next handle it.
    if (isRedirectError(err)) throw err
    logger.error('createFromTemplate failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not create LaTeX document.' }
  }
}

/**
 * Blank CV document — minimal compilable stub the user can rewrite from
 * scratch.
 */
export async function createBlank(): Promise<CreateLatexResult> {
  try {
    const userId = await requireUserId()
    const source = `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\begin{document}

\\section*{Your Name}

Start writing your CV here.

\\end{document}
`
    const { title, version } = await nextTitle(userId, 'latex_cv')
    const doc = await documentsQ.create(userId, {
      applicationId: null,
      kind: 'latex_cv',
      version,
      title,
      content: { source },
    })
    revalidatePath('/documents')
    redirect(`/documents/${doc.id}/edit`)
  } catch (err) {
    if (isRedirectError(err)) throw err
    logger.error('createBlank failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not create blank LaTeX document.' }
  }
}

/**
 * Blank cover letter document — minimal compilable stub with the standard
 * letter scaffolding so the user can just fill in body paragraphs.
 */
export async function createBlankCoverLetter(): Promise<CreateLatexResult> {
  try {
    const userId = await requireUserId()
    const source = `\\documentclass[11pt,a4paper]{article}
\\usepackage[margin=1.0in]{geometry}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[hidelinks]{hyperref}
\\pagestyle{empty}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{6pt}
\\begin{document}

\\begin{flushright}
  \\textbf{Your Name}\\\\
  {\\small email  ·  phone  ·  location}
\\end{flushright}

[Date]

[Hiring Manager]\\\\
[Company Name]

Dear Hiring Manager,

Write your first paragraph here.

Write your second paragraph here.

Sincerely,\\\\[24pt]
Your Name

\\end{document}
`
    const { title, version } = await nextTitle(userId, 'latex_cover_letter')
    const doc = await documentsQ.create(userId, {
      applicationId: null,
      kind: 'latex_cover_letter',
      version,
      title,
      content: { source },
    })
    revalidatePath('/documents')
    redirect(`/documents/${doc.id}/edit`)
  } catch (err) {
    if (isRedirectError(err)) throw err
    logger.error('createBlankCoverLetter failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not create blank cover letter.' }
  }
}

/**
 * Ask the AI to generate a full .tex source from the user's master CV, in the
 * style of the requested template. Retries once if the response does not
 * start with \documentclass (the AI provider throws in that case).
 *
 * Only applies to CV templates — cover-letter templates use the
 * template-fill path via `createFromTemplate`.
 */
export async function createFromMasterCV(templateId: string): Promise<CreateLatexResult> {
  try {
    const userId = await requireUserId()
    const template = getTemplate(templateId)
    if (!template) return { error: `Unknown template: ${templateId}` }
    if (template.kind !== 'cv') {
      return { error: 'AI generation is only available for CV templates.' }
    }
    const master = await getMasterCV(userId)
    if (!master) return { error: 'You need to save a master CV first (Settings → CV).' }

    const ai = await getAIProviderForUser(userId)
    let source: string
    try {
      const r = await ai.generateLatexCV({ master, templateId })
      source = r.source
    } catch (firstErr) {
      logger.error('generateLatexCV first attempt failed, retrying', {
        err: firstErr instanceof Error ? firstErr.message : String(firstErr),
      })
      const r = await ai.generateLatexCV({ master, templateId })
      source = r.source
    }

    const { title, version } = await nextTitle(userId, 'latex_cv')
    const doc = await documentsQ.create(userId, {
      applicationId: null,
      kind: 'latex_cv',
      version,
      title,
      content: { source, templateId },
    })
    revalidatePath('/documents')
    redirect(`/documents/${doc.id}/edit`)
  } catch (err) {
    if (isRedirectError(err)) throw err
    logger.error('createFromMasterCV failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not generate LaTeX from your master CV.' }
  }
}
