import { describe, expect, it } from 'vitest'
import * as documentsQ from '@/lib/db/queries/documents'
import * as cvScoresQ from '@/lib/db/queries/cvScores'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import { scoreCv } from '@/lib/cv-score/score'
import { batchScoreMaster, compareCvs } from '@/lib/cv-score/compare'
import { applyAutofix, previewAutofix } from '@/lib/cv-score/autofix'
import { CvScoreError } from '@/lib/cv-score/errors'
import { saveMasterCV } from '@/lib/documents/master'
import { makeApplication, makeCompany, makeJob, makeUser } from '@/tests/factories'
import { NOW, strongCv, weakCv } from '@/tests/fixtures/cv-score/cvs'

const PARSED_META = {
  seniority: 'senior',
  tech_stack: ['TypeScript', 'Postgres', 'Kafka', 'AWS'],
  requirements: [
    '5+ years of backend engineering experience',
    'Strong experience with PostgreSQL and event-driven systems',
    'Experience mentoring engineers',
  ],
  responsibilities: ['Design and build payment ledger services', 'Mentor engineers and review code'],
}

async function seed(status = 'applied') {
  const user = await makeUser()
  const company = await makeCompany(user.id, { name: 'FinPay' })
  const job = await makeJob(user.id, company.id, {
    title: 'Senior Backend Engineer',
    parsedMeta: PARSED_META,
    descriptionMd: 'FinPay builds payments infrastructure for banks.',
  })
  const app = await makeApplication(user.id, job.id, { status })
  return { user, app }
}

describe('scoreCv (integration)', () => {
  it('scores a stored master CV against a job and persists the run', async () => {
    const { user, app } = await seed()
    const master = await saveMasterCV(user.id, weakCv())
    const r = await scoreCv({
      userId: user.id,
      source: { documentId: master.id },
      applicationId: app.id,
      ai: new FixtureAIProvider(),
      now: NOW,
    })
    expect(r.id).toBeTruthy()
    expect(r.mode).toBe('jd')
    expect(r.total.label).toBe('Total Match')
    expect(r.scores.roleMatch.score).not.toBeNull()
    expect(r.dimensions.requirementFit && 'skipped' in r.dimensions.requirementFit).toBe(false)
    expect(r.aiCallId).toBeTruthy()

    const row = await cvScoresQ.getById(user.id, r.id!)
    expect(row).toMatchObject({
      documentId: master.id,
      applicationId: app.id,
      sourceKind: 'master_cv',
      overall: r.total.score,
      grade: r.total.grade,
      mode: 'jd',
      scorerVersion: '1.0.0',
      aiCallId: r.aiCallId,
    })
    const scores = row!.scores as Record<string, { score: number | null }>
    expect(Object.keys(scores).sort()).toEqual(
      ['ats', 'experienceMatch', 'impact', 'readability', 'roleMatch', 'skillsMatch', 'structure', 'total'],
    )
    expect(scores.total!.score).toBe(r.total.score)
    expect(await cvScoresQ.latestForApplication(user.id, app.id)).toMatchObject({ id: r.id })
  })

  it('general (no JD) score and user scoping', async () => {
    const { user } = await seed()
    const other = await makeUser()
    const master = await saveMasterCV(user.id, strongCv())
    const r = await scoreCv({ userId: user.id, source: { documentId: master.id }, ai: null, now: NOW })
    expect(r.mode).toBe('general')
    expect(r.total.label).toBe('CV Quality')
    expect(r.scores.skillsMatch.reason).toBe('Pick a job to see match')
    await expect(scoreCv({ userId: other.id, source: { documentId: master.id }, ai: null })).rejects.toMatchObject({
      code: 'document_not_found',
      status: 404,
    })
    expect(await cvScoresQ.listByDocument(other.id, master.id)).toEqual([])
    expect(await cvScoresQ.listByDocument(user.id, master.id)).toHaveLength(1)
  })

  it('scores an uploaded text file and a LaTeX document', async () => {
    const { user } = await seed()
    const upload = await scoreCv({
      userId: user.id,
      source: { upload: { name: 'cv.md', bytes: new TextEncoder().encode('# Me\nme@example.com\n\nExperience\nEngineer, Acme, 2020 - Present\n- Built billing APIs serving 10k users\n') } },
      ai: null,
      now: NOW,
    })
    expect(upload.source).toEqual({ kind: 'upload', documentId: null, label: 'cv.md' })
    expect((await cvScoresQ.getById(user.id, upload.id!))!.documentId).toBeNull()

    const latex = await documentsQ.create(user.id, {
      applicationId: null,
      kind: 'latex_cv',
      version: 1,
      title: 'LaTeX CV',
      content: { source: '\\begin{document}\\section{Experience}\nEngineer, Acme, 2020 -- Present\n\\begin{itemize}\\item Built X for 5 teams\\end{itemize}\\end{document}' },
    })
    const lr = await scoreCv({ userId: user.id, source: { documentId: latex.id }, ai: null, now: NOW })
    expect(lr.source.kind).toBe('latex_cv')

    const letter = await documentsQ.create(user.id, { applicationId: null, kind: 'cover_letter', version: 1, title: 'CL', content: {} })
    await expect(scoreCv({ userId: user.id, source: { documentId: letter.id }, ai: null })).rejects.toMatchObject({ code: 'unsupported_document' })
  })

  it('AI dimension is signal-gated but the score still completes', async () => {
    const user = await makeUser()
    const job = await makeJob(user.id, null, { title: 'Engineer', parsedMeta: { tech_stack: ['Go'] } })
    const app = await makeApplication(user.id, job.id)
    const master = await saveMasterCV(user.id, strongCv())
    const r = await scoreCv({ userId: user.id, source: { documentId: master.id }, applicationId: app.id, ai: new FixtureAIProvider(), now: NOW })
    expect(r.dimensions.requirementFit).toMatchObject({ skipped: true, code: 'cv_score_no_requirements' })
    expect(r.skipped.map((s) => s.key)).toContain('requirementFit')
    expect(r.total.score).not.toBeNull()
  })

  it('rejects an unknown application', async () => {
    const { user } = await seed()
    const master = await saveMasterCV(user.id, strongCv())
    await expect(
      scoreCv({ userId: user.id, source: { documentId: master.id }, applicationId: '00000000-0000-4000-8000-000000000000', ai: null }),
    ).rejects.toBeInstanceOf(CvScoreError)
  })
})

describe('compareCvs / batchScoreMaster (integration)', () => {
  it('reports the tailoring delta per headline score', async () => {
    const { user, app } = await seed()
    const master = await saveMasterCV(user.id, weakCv())
    const tailored = await documentsQ.create(user.id, {
      applicationId: app.id,
      kind: 'tailored_cv',
      version: 1,
      title: 'Tailored CV',
      content: { ...strongCv(), _tailoring: { applicationId: app.id } },
    })
    const c = await compareCvs({ userId: user.id, documentIdA: master.id, documentIdB: tailored.id, applicationId: app.id, ai: null, now: NOW })
    expect(c.deltas[0]!.key).toBe('total')
    expect(c.deltas[0]!.delta).toBeGreaterThan(0)
    expect(c.summary).toMatch(/^Tailored CV raises your Total Match from \d+ → \d+/)
    expect(c.deltas.map((d) => d.key)).toEqual(['total', 'roleMatch', 'skillsMatch', 'experienceMatch', 'ats', 'impact', 'readability', 'structure'])
    await expect(compareCvs({ userId: user.id, documentIdA: master.id, documentIdB: master.id, ai: null })).rejects.toMatchObject({ code: 'same_document' })
  })

  it('batch-scores the latest master against active applications only', async () => {
    const { user, app } = await seed('interview')
    const job2 = await makeJob(user.id, null, { title: 'Frontend Engineer', parsedMeta: { tech_stack: ['React', 'CSS'] } })
    const app2 = await makeApplication(user.id, job2.id, { status: 'saved' })
    const job3 = await makeJob(user.id, null, { title: 'Old', parsedMeta: { tech_stack: ['Go'] } })
    await makeApplication(user.id, job3.id, { status: 'rejected' })
    await expect(batchScoreMaster({ userId: user.id, ai: null })).rejects.toMatchObject({ code: 'no_master_cv' })
    await saveMasterCV(user.id, weakCv())
    await saveMasterCV(user.id, strongCv())
    const b = await batchScoreMaster({ userId: user.id, ai: null, now: NOW })
    expect(b.masterLabel).toBe('Master CV v2')
    expect(b.includeAi).toBe(false)
    expect(b.rows.map((r) => r.applicationId).sort()).toEqual([app.id, app2.id].sort())
    expect(b.rows[0]!.total).toBeGreaterThanOrEqual(b.rows[1]!.total!)
    expect(b.rows.find((r) => r.applicationId === app.id)!.scores.skillsMatch).not.toBeNull()
    expect(b.rows.find((r) => r.applicationId === app2.id)!.missingSkills).toEqual(['css', 'react'])
    expect(await cvScoresQ.listByApplication(user.id, app.id)).toHaveLength(1)
  })
})

describe('autofix (integration)', () => {
  it('previews safe fixes, rejects unsafe rewrites, applies as a new master version', async () => {
    const { user, app } = await seed()
    const cv = weakCv()
    const master = await saveMasterCV(user.id, {
      ...cv,
      experience: [
        { ...cv.experience[0]!, bullets: [...cv.experience[0]!.bullets, 'Built REST services on Kafka for the payments team'] },
        cv.experience[1]!,
      ],
    })
    const ai = new FixtureAIProvider({
      rewriteCvBullets: (input) => ({
        rewrites: input.bullets.map((b) =>
          b.text.startsWith('Worked on')
            ? { id: b.id, text: 'Fixed 25 production bugs across the website' } // invents a number
            : { id: b.id, text: b.text.replace(/^(Responsible for|Helped|Involved in)\s+/i, 'Delivered ') },
        ),
      }),
    })
    const preview = await previewAutofix({ userId: user.id, applicationId: app.id, ai, now: NOW })
    expect(preview.baseDocumentId).toBe(master.id)
    const kinds = preview.changes.map((c) => c.kind)
    expect(kinds).toContain('rewrite_bullet')
    expect(kinds).toContain('add_skill')
    expect(preview.rejected.map((r) => r.reason)).toContain('rewrite adds numbers not in the original (25)')
    const added = preview.changes.filter((c) => c.kind === 'add_skill').map((c) => (c as { term: string }).term)
    expect(added).toEqual(['kafka', 'payments'])
    expect(preview.proposed.skills.secondary).toEqual(['kafka', 'payments'])

    // Nothing saved yet.
    expect((await documentsQ.list(user.id, { kind: 'master_cv' }))).toHaveLength(1)

    const applied = await applyAutofix({ userId: user.id, baseDocumentId: master.id, changes: preview.changes })
    expect(applied.version).toBe(2)
    const saved = await documentsQ.getById(user.id, applied.documentId)
    expect((saved!.content as { skills: { secondary: string[] } }).skills.secondary).toEqual(['kafka', 'payments'])

    // Stale base is refused.
    await expect(applyAutofix({ userId: user.id, baseDocumentId: master.id, changes: preview.changes })).rejects.toMatchObject({
      code: 'stale_base',
      status: 409,
    })
  })

  it('apply re-validates: tampered rewrites and unevidenced skills are refused', async () => {
    const user = await makeUser()
    const master = await saveMasterCV(user.id, weakCv())
    await expect(applyAutofix({
      userId: user.id,
      baseDocumentId: master.id,
      changes: [{ kind: 'rewrite_bullet', findingId: 'x', path: 'experience[0].bullets[0]', roleIndex: 0, bulletIndex: 0, before: 'Responsible for maintaining the website.', after: 'Maintained the website for 2M users' }],
    })).rejects.toMatchObject({ code: 'unsafe_change' })
    await expect(applyAutofix({
      userId: user.id,
      baseDocumentId: master.id,
      changes: [{ kind: 'add_skill', findingId: 'y', path: 'skills.secondary', term: 'Rust', before: null, after: 'Rust' }],
    })).rejects.toMatchObject({ code: 'unsafe_change' })
  })
})
