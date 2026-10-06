import { describe, expect, it } from 'vitest'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import type { TailorCVInput } from '@/lib/ai/prompts/tailor-cv'
import * as documentsQ from '@/lib/db/queries/documents'
import * as profileQ from '@/lib/db/queries/profile'
import * as applicationsQ from '@/lib/db/queries/applications'
import * as variantsQ from '@/lib/db/queries/resumeVariants'
import { getMasterCV, saveMasterCV } from '@/lib/documents/master'
import { generateTailoredCV } from '@/lib/documents/tailor'
import { masterCvSchema, type MasterCV } from '@/lib/documents/types'
import { getResumeProfile, ResumeValidationError, saveResumeProfile } from '@/lib/resume/service'
import { chooseVariantForApplication, createVariant, loadVariant, saveRecipe, VariantError } from '@/lib/variants/service'
import { ensureVariantDocument, scoreVariant } from '@/lib/variants/outputs'
import { syntheticProfile } from '@/tests/fixtures/resume/profile'
import { makeApplication, makeCompany, makeJob, makeUser } from '@/tests/factories'

const LEGACY: MasterCV = masterCvSchema.parse({
  basics: { name: 'Asha Menon', headline: 'Backend Engineer', email: 'asha.menon@example.com' },
  summary: 'Builds payment systems.',
  experience: [{ company: 'PayFlow', role: 'Backend Engineer', start: '2021-04', end: 'present', bullets: ['Cut settlement latency by 40%.'] }],
  skills: { primary: ['Go'] },
})

describe('master profile service', () => {
  it('migrates a legacy master CV once, and the MasterCV is derived from the profile from then on', async () => {
    const me = await makeUser()
    await documentsQ.create(me.id, { applicationId: null, kind: 'master_cv', version: 1, title: 'Master CV v1', content: LEGACY })
    const first = await getResumeProfile(me.id)
    expect(first.stored).toBe(true)
    expect(first.profile.work[0]!.highlights[0]!.text).toBe('Cut settlement latency by 40%.')
    expect((await profileQ.get(me.id))?.resume).toBeTruthy()
    const again = await getResumeProfile(me.id)
    expect(again.profile.work[0]!.id).toBe(first.profile.work[0]!.id)

    // Editing the profile refreshes the derived master_cv snapshot.
    const edited = { ...first.profile, basics: { ...first.profile.basics, label: 'Payments Engineer' } }
    const saved = await saveResumeProfile(me.id, edited)
    expect(saved.masterDocument?.version).toBe(2)
    expect((await getMasterCV(me.id))?.basics.headline).toBe('Payments Engineer')
    // Saving the same facts again writes no new snapshot.
    expect((await saveResumeProfile(me.id, edited)).masterDocument).toBeNull()
  })

  it('seeds an unsaved profile from settings when there is nothing to migrate', async () => {
    const me = await makeUser()
    await profileQ.upsert(me.id, { headline: 'Backend Engineer', skills: ['Go', 'PHP'] })
    const { profile, stored } = await getResumeProfile(me.id)
    expect(stored).toBe(false)
    expect(profile.basics.label).toBe('Backend Engineer')
    expect(profile.skills[0]!.skills.map((s) => s.name)).toEqual(['Go', 'PHP'])
  })

  it('refuses duplicate ids and dangling case studies', async () => {
    const me = await makeUser()
    const p = syntheticProfile()
    await expect(saveResumeProfile(me.id, { ...p, projects: [{ ...p.projects[0]!, id: 'w-payflow' }] })).rejects.toBeInstanceOf(ResumeValidationError)
    await expect(
      saveResumeProfile(me.id, { ...p, work: p.work.map((w) => ({ ...w, highlights: w.highlights.filter((h) => h.id !== 'h-payouts') })) }),
    ).rejects.toThrow(/Case study/)
  })

  it('CV Score autofix edits (saveMasterCV) land on the profile, keeping ids', async () => {
    const me = await makeUser()
    await saveResumeProfile(me.id, syntheticProfile())
    const cv = (await getMasterCV(me.id))!
    const edited: MasterCV = { ...cv, skills: { ...cv.skills, secondary: ['Kafka'] } }
    const doc = await saveMasterCV(me.id, edited)
    expect(doc.kind).toBe('master_cv')
    const { profile } = await getResumeProfile(me.id)
    expect(profile.skills.at(-1)).toMatchObject({ name: 'Other' })
    expect(profile.work[0]!.id).toBe('w-payflow')
  })
})

describe('fact lock on save', () => {
  it('rejects a new wording with a number its highlight lacks; keeps a stale existing one', async () => {
    const me = await makeUser()
    const p = syntheticProfile()
    const withWording = (text: string) => ({
      ...p,
      work: p.work.map((w, i) =>
        i === 0 ? { ...w, highlights: w.highlights.map((h, j) => (j === 0 ? { ...h, alternates: [{ id: 'w-1', text, source: 'user' as const }] } : h)) } : w,
      ),
    })
    await expect(saveResumeProfile(me.id, withWording('Payouts API at 3M requests a day'))).rejects.toThrow('Numbers not in the original: 3m')
    const ok = await saveResumeProfile(me.id, withWording('Payouts API at 2M+ requests a day'))
    // Editing the master fact later does not block the save.
    const edited = {
      ...ok.profile,
      work: ok.profile.work.map((w, i) =>
        i === 0 ? { ...w, highlights: w.highlights.map((h, j) => (j === 0 ? { ...h, text: 'Payouts API handling 1M requests a day.' } : h)) } : w,
      ),
    }
    await expect(saveResumeProfile(me.id, edited)).resolves.toBeTruthy()
  })
})

describe('variant outputs', () => {
  it('one LaTeX document per variant version, reused, and scored through CV Score', async () => {
    const me = await makeUser()
    await saveResumeProfile(me.id, syntheticProfile())
    const v = await createVariant(me.id, { region: 'remote', roleFamily: 'backend' })
    const doc = await ensureVariantDocument(me.id, v.id)
    expect(doc).toMatchObject({ kind: 'latex_cv', title: 'Résumé — Remote · Backend v1' })
    expect((await ensureVariantDocument(me.id, v.id)).id).toBe(doc.id)
    const score = await scoreVariant(me.id, v.id, { ai: null })
    expect(score.source).toMatchObject({ kind: 'latex_cv', documentId: doc.id })
    expect(score.total.score).toBeGreaterThan(0)
  })
})

describe('variants', () => {
  async function userWithProfile() {
    const me = await makeUser()
    await saveResumeProfile(me.id, syntheticProfile())
    return me.id
  }

  it('creates on demand from presets and versions only real changes', async () => {
    const userId = await userWithProfile()
    const v = await createVariant(userId, { region: 'gcc', roleFamily: 'payments' })
    expect(v).toMatchObject({ name: 'GCC · Payments / Fintech Backend Engineer', currentVersion: 1, publishToPortfolio: false })
    const loaded = await loadVariant(userId, v.id)
    expect(loaded.recipe.fields.nationality).toBe(true)

    expect((await saveRecipe(userId, v.id, loaded.recipe)).changed).toBe(false)
    const second = await saveRecipe(userId, v.id, { ...loaded.recipe, headline: 'Payments Backend Engineer' })
    expect(second).toMatchObject({ changed: true, variant: { currentVersion: 2 } })
    expect((await loadVariant(userId, v.id, 1)).recipe.headline).toBe('Backend Engineer')
    expect((await loadVariant(userId, v.id)).recipe.headline).toBe('Payments Backend Engineer')
    expect((await variantsQ.listVersions(userId, v.id)).map((x) => x.version)).toEqual([1, 2])
    await expect(saveRecipe(userId, v.id, { region: 'mars' })).rejects.toBeInstanceOf(VariantError)
  })

  it("never shows another user's variant", async () => {
    const userId = await userWithProfile()
    const other = await makeUser()
    const v = await createVariant(userId, { region: 'india', roleFamily: null })
    await expect(loadVariant(other.id, v.id)).rejects.toBeInstanceOf(VariantError)
  })

  it('records the variant + version on the application, and tailoring starts from that version', async () => {
    const userId = await userWithProfile()
    const company = await makeCompany(userId)
    const job = await makeJob(userId, company.id, { title: 'Payments Engineer', descriptionMd: 'Go, PostgreSQL, payouts.' })
    const app = await makeApplication(userId, job.id)
    const v = await createVariant(userId, { region: 'gcc', roleFamily: 'payments' })
    const v1 = await loadVariant(userId, v.id)
    await saveRecipe(userId, v.id, { ...v1.recipe, headline: 'Payments Backend Engineer' })

    expect(await chooseVariantForApplication(userId, app.id, v.id)).toEqual({ variantId: v.id, version: 2 })
    const stored = await applicationsQ.getById(userId, app.id)
    expect(stored).toMatchObject({ resumeVariantId: v.id, resumeVariantVersion: 2 })

    // A later edit to the variant does not change what this application used.
    await saveRecipe(userId, v.id, { ...v1.recipe, headline: 'Something else' })

    let seen: TailorCVInput | null = null
    const ai = new FixtureAIProvider({
      tailorCV: (input) => {
        seen = input
        return { ...input.master, _tailoring: { applicationId: app.id, reasoning: 'ok', highlighted_skills: [], reordered_experience_indices: [], summary_rewrite: false } }
      },
    })
    const doc = await generateTailoredCV({ userId, applicationId: app.id, ai })
    expect(seen!.variant).toMatchObject({ name: v.name, version: 2 })
    expect(seen!.master.basics.headline).toBe('Payments Backend Engineer')
    expect(doc.aiGenerationMeta).toMatchObject({ resumeVariantId: v.id, resumeVariantVersion: 2 })

    await chooseVariantForApplication(userId, app.id, null)
    expect(await applicationsQ.getById(userId, app.id)).toMatchObject({ resumeVariantId: null, resumeVariantVersion: null })
  })
})
