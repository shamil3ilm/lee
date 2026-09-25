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

async function nextTitle(userId: string): Promise<{ title: string; version: number }> {
  const version = await documentsQ.nextVersion(userId, null, 'latex_cv')
  return { title: `LaTeX CV v${version}`, version }
}

/**
 * Seed a new LaTeX CV document from a template pre-filled with the user's
 * master CV content (if one exists — otherwise falls back to the raw
 * template with placeholder-friendly defaults so the user can edit inline).
 */
export async function createFromTemplate(templateId: string): Promise<CreateLatexResult> {
  try {
    const userId = await requireUserId()
    const template = getTemplate(templateId)
    if (!template) return { error: `Unknown template: ${templateId}` }

    const master = await getMasterCV(userId)
    let source: string
    if (master) {
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

    const { title, version } = await nextTitle(userId)
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
    // redirect() throws internally; let Next handle it.
    if (
      err instanceof Error &&
      'digest' in err &&
      typeof (err as { digest?: string }).digest === 'string' &&
      (err as { digest: string }).digest.startsWith('NEXT_REDIRECT')
    ) {
      throw err
    }
    logger.error('createFromTemplate failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not create LaTeX document.' }
  }
}

/**
 * Blank document — minimal compilable stub the user can rewrite from scratch.
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
    const { title, version } = await nextTitle(userId)
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
    if (
      err instanceof Error &&
      'digest' in err &&
      typeof (err as { digest?: string }).digest === 'string' &&
      (err as { digest: string }).digest.startsWith('NEXT_REDIRECT')
    ) {
      throw err
    }
    logger.error('createBlank failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not create blank LaTeX document.' }
  }
}

/**
 * Ask the AI to generate a full .tex source from the user's master CV, in the
 * style of the requested template. Retries once if the response does not
 * start with \documentclass (the AI provider throws in that case).
 */
export async function createFromMasterCV(templateId: string): Promise<CreateLatexResult> {
  try {
    const userId = await requireUserId()
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

    const { title, version } = await nextTitle(userId)
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
    if (
      err instanceof Error &&
      'digest' in err &&
      typeof (err as { digest?: string }).digest === 'string' &&
      (err as { digest: string }).digest.startsWith('NEXT_REDIRECT')
    ) {
      throw err
    }
    logger.error('createFromMasterCV failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not generate LaTeX from your master CV.' }
  }
}
