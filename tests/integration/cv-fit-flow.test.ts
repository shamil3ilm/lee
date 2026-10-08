import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { applications, cvTailorings, discoveries, documents } from '@/lib/db/schema'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import type { CoverLetterTailoring } from '@/lib/ai/prompts/cover-letter'
import * as appsQ from '@/lib/db/queries/applications'
import * as prepsQ from '@/lib/db/queries/applicationPreps'
import * as profileQ from '@/lib/db/queries/profile'
import { confirmVariant, coverStep, startPrepare } from '@/lib/apply/prepare'
import { bestCvForApplication, bestCvStale, ensureBestCv, rescoreBestCv } from '@/lib/cv-fit/service'
import { toBestCv } from '@/lib/cv-fit/types'
import { addGapToStudyList, saveTailoredCopy } from '@/lib/cv-fit/tailor/save'
import { loadTailorView, previewTailor } from '@/lib/cv-fit/tailor/service'
import { photoViewForApplication } from '@/lib/cv-fit/photo/service'
import { getResumeProfile, saveResumeProfile } from '@/lib/resume/service'
import { studyList } from '@/lib/resume/study'
import { createStarterVariants, loadVariant, saveRecipe } from '@/lib/variants/service'
import { makeDiscovery, makeSource, makeUser } from '@/tests/factories'
import { tailorProfile, TAILOR_JD } from '@/tests/fixtures/resume/tailor'

async function setup() {
  const u = await makeUser()
  await profileQ.upsert(u.id, { timezone: 'UTC', roleTypes: ['payments', 'data_analyst'] })
  await saveResumeProfile(u.id, tailorProfile())
  const created = await createStarterVariants(u.id, [
    { roleId: 'payments-backend', region: 'gcc' },
    { roleId: 'payments-backend', region: 'remote' },
    { roleId: 'data-bi', region: 'gcc' },
    // Not offered (no accepted family) and a duplicate: both skipped.
    { roleId: 'fullstack-ts', region: 'gcc' },
    { roleId: 'payments-backend', region: 'gcc' },
  ])
  const src = await makeSource(u.id, { kind: 'greenhouse' })
  const disc = await makeDiscovery(u.id, src.id, {
    status: 'new',
    regions: ['ae', 'gcc'],
    normalized: {
      kind: 'job',
      title: TAILOR_JD.title,
      companyName: 'Payco Gulf',
      location: TAILOR_JD.location,
      remoteType: 'onsite',
      descriptionMd: TAILOR_JD.descriptionMd,
      applyUrl: 'https://boards.greenhouse.io/paycogulf/jobs/7',
      techStack: [],
    },
  })
  return { u, created, disc }
}

describe('best CV → Prepare → tailored copy → cover letter → study list', () => {
  it('runs end to end with the deterministic engine and the fixture AI', async () => {
    const { u, created, disc } = await setup()
    expect(created.map((v) => v.name)).toEqual(['Payments / Backend · GCC', 'Payments / Backend · Remote', 'Data Analyst / BI · GCC'])
    const gccPayments = created[0]!

    // 1. Best CV for the discovery, computed by the backfill, idempotent.
    const first = await rescoreBestCv(u.id)
    expect(first.computed).toBe(1)
    expect((await rescoreBestCv(u.id)).computed).toBe(0)
    const [row] = await db.select().from(discoveries).where(eq(discoveries.id, disc.id))
    const best = toBestCv(row!.bestCv)!
    // This small profile shows the same items in every variant: the GCC
    // ones tie on fit, and the one built for the posting's role family wins.
    expect(best.best.variantId).toBe(gccPayments.id)
    expect(best.runnerUp?.name).toBe('Data Analyst / BI · GCC')
    expect(best.best.fit).toBe(best.runnerUp!.fit)
    expect(best.best.reasons).toContain('GCC variant for a GCC job')
    expect(best.best.reasons).toContain('Tie on fit; built for this kind of role')
    expect(best.compared).toBe(3)

    // A variant change moves the key; the next pass recomputes.
    const loaded = await loadVariant(u.id, created[2]!.id)
    await saveRecipe(u.id, created[2]!.id, { ...loaded.recipe, headline: 'Data Analyst' })
    expect(await bestCvStale(u.id)).toBe(true)
    expect((await ensureBestCv(u.id, [disc.id])).size).toBe(1)
    expect(await bestCvStale(u.id)).toBe(false)

    // 2. Prepare uses it: the application computes the same pick for its JD.
    const { applicationId } = await startPrepare(u.id, { discoveryId: disc.id })
    const app = (await appsQ.getById(u.id, applicationId))!
    const appBest = await bestCvForApplication(u.id, app)
    expect(appBest?.best.variantId).toBe(gccPayments.id)
    const [stored] = await db.select().from(applications).where(eq(applications.id, applicationId))
    expect(stored?.bestCvKey).toBeTruthy()
    await confirmVariant(u.id, applicationId, appBest!.best.variantId)
    const photo = await photoViewForApplication(u.id, (await appsQ.getById(u.id, applicationId))!)
    expect(photo.advice.advice).toBe('optional')
    expect(photo.hasPhoto).toBe(false)

    // 3. Tailor: checklist, suggestions, preview, save.
    const view = await loadTailorView(u.id, applicationId)
    expect(view.base).toMatchObject({ variantId: gccPayments.id, version: 1 })
    expect(view.checklist.find((c) => c.text.includes('Kubernetes'))?.status).toBe('missing')
    const accepted = view.suggestions.filter((s) => s.kind !== 'trim').map((s) => s.id)
    const preview = await previewTailor(u.id, applicationId, accepted)
    expect(preview.after.met + preview.after.partial).toBeGreaterThanOrEqual(preview.before.met + preview.before.partial)
    const kafka = view.gaps.find((g) => g.studyLabel === 'Kafka')!
    const k8s = view.gaps.find((g) => g.studyLabel === 'Kubernetes')!
    const saved = await saveTailoredCopy(u.id, applicationId, {
      accepted,
      gaps: [
        { requirementId: kafka.requirementId, action: 'cover' },
        // No adjacent evidence: "cover" is refused and dropped.
        { requirementId: k8s.requirementId, action: 'cover' },
      ],
    })
    const [doc] = await db.select().from(documents).where(eq(documents.id, saved.documentId))
    expect(doc?.kind).toBe('tailored_cv')
    expect(doc?.applicationId).toBe(applicationId)
    const text = JSON.stringify(doc?.content)
    expect(text).not.toMatch(/Kubernetes|Kafka/)
    const [tailoring] = await db.select().from(cvTailorings).where(eq(cvTailorings.documentId, saved.documentId))
    expect(tailoring).toMatchObject({ applicationId, baseVariantId: gccPayments.id, baseVersion: 1 })
    expect(tailoring!.jdHash).toMatch(/^[0-9a-f]{8}$/)
    expect((tailoring!.accepted as Array<{ id: string }>).map((a) => a.id).sort()).toEqual([...accepted].sort())
    expect(tailoring!.gaps).toEqual([{ requirementId: kafka.requirementId, action: 'cover', text: kafka.text, evidence: kafka.adjacent!.text }])
    expect((await prepsQ.get(u.id, applicationId))?.progress.tailor).toMatchObject({ status: 'done', documentId: saved.documentId })

    // 4. The cover letter reads the same requirements and the adjacent evidence.
    let seen: CoverLetterTailoring | undefined
    const ai = new FixtureAIProvider({
      draftCoverLetter: (input) => {
        seen = input.tailoring
        return { applicationId, greeting: 'Dear Hiring Manager,', paragraphs: ['One.', 'Two.', 'Three.'], closing: 'Sincerely,', senderName: 'Rae Example' }
      },
    })
    await coverStep(u.id, applicationId, ai, [])
    expect(seen?.requirements.find((r) => r.text.includes('Laravel'))).toMatchObject({ status: 'met' })
    expect(seen?.requirements.find((r) => r.text.includes('Kubernetes'))).toMatchObject({ status: 'missing' })
    expect(seen?.adjacent).toEqual([{ requirement: kafka.text, evidence: kafka.adjacent!.text }])

    // 5. A gap → the study list (a learning skill, never on a CV).
    const study = await addGapToStudyList(u.id, applicationId, kafka.requirementId)
    expect(study).toEqual({ label: 'Kafka', created: true })
    const { profile } = await getResumeProfile(u.id)
    expect(studyList(profile).find((s) => s.label === 'Kafka')).toMatchObject({ depth: 'learning', interviewReady: false })
    expect(await addGapToStudyList(u.id, applicationId, kafka.requirementId)).toEqual({ label: 'Kafka', created: false })
  })
})
