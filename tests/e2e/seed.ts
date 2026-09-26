/**
 * v17 §9.1 — `pnpm e2e:seed`: build a fresh local PGlite file database with
 * the fixed E2E test identity and realistic demo data, so every authed page
 * has something to render and journeys have something to act on.
 *
 * Safety: this script ALWAYS targets the dedicated `.e2e/pglite` directory
 * (it overrides DATABASE_URL) and deletes/recreates only that directory. It
 * can never touch a developer's real database or a Postgres URL.
 */
import { rm, mkdir, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { E2E_DB_DIR, E2E_ENV } from './env'

const env = process.env as Record<string, string | undefined>
for (const [k, v] of Object.entries(E2E_ENV)) env[k] = v

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.now()
const ago = (days: number): Date => new Date(NOW - days * DAY)
const ahead = (days: number): Date => new Date(NOW + days * DAY)

/** 'YYYY-MM-DD' for day-of-month `dom` in the month `monthsBack` ago (clamped to today). */
function ymd(monthsBack: number, dom: number): string {
  const today = new Date(NOW)
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - monthsBack, 1))
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  const cap = monthsBack === 0 ? today.getUTCDate() : last
  d.setUTCDate(Math.min(dom, cap))
  return d.toISOString().slice(0, 10)
}

async function resetDatabaseDir(): Promise<void> {
  const dir = path.resolve(process.cwd(), E2E_DB_DIR)
  const root = path.resolve(process.cwd(), '.e2e')
  if (!dir.startsWith(root + path.sep)) throw new Error(`refusing to reset ${dir}`)
  await rm(dir, { recursive: true, force: true })
  await mkdir(path.dirname(dir), { recursive: true })
}

async function main(): Promise<void> {
  await resetDatabaseDir()

  // Import after env + directory are ready: the client opens the DB on load.
  const { db, pgliteClient, closeDb } = await import('@/lib/db/client')
  const s = await import('@/lib/db/schema')
  const { scoreCv } = await import('@/lib/cv-score/score')
  const { TEST_LOGIN_EMAIL, TEST_LOGIN_NAME } = await import('@/lib/auth/test-login')
  const data = await import('./seed-data')

  if (!pgliteClient) throw new Error('e2e seed requires PGlite')
  const folder = path.resolve(process.cwd(), 'lib/db/migrations')
  const files = (await readdir(folder)).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    const text = await readFile(path.join(folder, file), 'utf8')
    for (const stmt of text.split(/-->\s*statement-breakpoint\s*/g).map((x) => x.trim()).filter(Boolean)) {
      await pgliteClient.exec(stmt)
    }
  }

  const [user] = await db
    .insert(s.users)
    .values({ email: TEST_LOGIN_EMAIL, name: TEST_LOGIN_NAME })
    .returning()
  if (!user) throw new Error('failed to create test user')
  const userId = user.id

  await db.insert(s.userProfile).values({ userId, ...data.PROFILE })

  // Companies + contacts
  const companyIds = new Map<string, string>()
  for (const c of data.COMPANIES) {
    const [row] = await db.insert(s.companies).values({ userId, ...c }).returning()
    companyIds.set(c.name, row!.id)
  }
  const contactIds = new Map<string, string>()
  for (const c of data.CONTACTS) {
    const { company, ...rest } = c
    const [row] = await db
      .insert(s.contacts)
      .values({ userId, companyId: companyIds.get(company) ?? null, ...rest })
      .returning()
    contactIds.set(c.name, row!.id)
  }

  // Jobs + applications across every status, with a status-change trail.
  const appIds = new Map<string, string>()
  for (const a of data.APPLICATIONS) {
    const [job] = await db
      .insert(s.jobs)
      .values({
        userId,
        companyId: companyIds.get(a.company) ?? null,
        title: a.title,
        sourceUrl: a.url,
        location: a.location,
        remoteType: a.remoteType,
        employmentType: 'fulltime',
        salaryMin: a.salary?.[0] ?? null,
        salaryMax: a.salary?.[1] ?? null,
        salaryCurrency: a.salary ? 'INR' : null,
        descriptionMd: a.description,
        postedAt: ago(a.createdDaysAgo + 3),
        createdAt: ago(a.createdDaysAgo),
      })
      .returning()
    const [app] = await db
      .insert(s.applications)
      .values({
        userId,
        jobId: job!.id,
        status: a.status,
        source: a.source,
        interestLevel: a.interest,
        priority: a.priority,
        appliedAt: a.appliedDaysAgo !== undefined ? ago(a.appliedDaysAgo) : null,
        nextActionAt: a.nextActionDays !== undefined ? ahead(a.nextActionDays) : null,
        referredByContactId: a.referredBy ? contactIds.get(a.referredBy) ?? null : null,
        createdAt: ago(a.createdDaysAgo),
        updatedAt: ago(Math.max(0, (a.appliedDaysAgo ?? a.createdDaysAgo) - 2)),
      })
      .returning()
    appIds.set(a.key, app!.id)
    let prev: string | null = null
    for (const [i, to] of a.trail.entries()) {
      await db.insert(s.activities).values({
        userId,
        applicationId: app!.id,
        kind: 'status_change',
        payload: { from: prev, to },
        createdAt: ago(Math.max(0, a.createdDaysAgo - i * 4)),
      })
      prev = to
    }
    if (a.contactRole && a.referredBy) {
      await db.insert(s.applicationContacts).values({
        applicationId: app!.id,
        contactId: contactIds.get(a.referredBy)!,
        role: a.contactRole,
      })
    }
  }

  const stageIds = new Map<string, string>()
  for (const st of data.STAGES) {
    const [row] = await db
      .insert(s.interviewStages)
      .values({
        userId,
        applicationId: appIds.get(st.app)!,
        kind: st.kind,
        title: st.title,
        scheduledAt: st.inDays >= 0 ? ahead(st.inDays) : ago(-st.inDays),
        durationMinutes: st.duration,
        meetingUrl: st.meetingUrl ?? null,
        status: st.status,
        outcome: st.outcome ?? null,
        prepNotesMd: st.prep ?? null,
        debriefNotesMd: st.debrief ?? null,
      })
      .returning()
    stageIds.set(st.key, row!.id)
  }

  // Documents: master CV, a tailored CV, a cover letter and a LaTeX CV.
  const [master] = await db
    .insert(s.documents)
    .values({ userId, kind: 'master_cv', title: 'Master CV', content: data.MASTER_CV, createdAt: ago(40) })
    .returning()
  const interviewApp = appIds.get('postman')!
  const [tailored] = await db
    .insert(s.documents)
    .values({
      userId,
      applicationId: interviewApp,
      kind: 'tailored_cv',
      title: 'CV — Postman, Senior Backend Engineer',
      content: data.tailoredCv(interviewApp),
      createdAt: ago(12),
    })
    .returning()
  await db.insert(s.documents).values({
    userId,
    applicationId: appIds.get('razorpay')!,
    kind: 'cover_letter',
    title: 'Cover letter — Razorpay',
    content: data.coverLetter(appIds.get('razorpay')!),
    createdAt: ago(9),
  })
  await db.insert(s.documents).values({
    userId,
    kind: 'latex_cv',
    title: 'LaTeX CV (simple)',
    content: { source: data.LATEX_CV, templateId: 'cv-simple' },
    createdAt: ago(20),
  })

  // CV scores via the real deterministic scorer (no AI).
  await scoreCv({ userId, source: { documentId: master!.id }, ai: null, includeAi: false })
  for (const key of ['postman', 'razorpay', 'stripe']) {
    await scoreCv({
      userId,
      source: { documentId: key === 'postman' ? tailored!.id : master!.id },
      applicationId: appIds.get(key)!,
      ai: null,
      includeAi: false,
    })
  }

  for (const t of data.TODOS) {
    await db.insert(s.todos).values({
      userId,
      title: t.title,
      notesMd: t.notes ?? null,
      status: t.status,
      priority: t.priority,
      dueAt: t.dueDays === undefined ? null : t.dueDays >= 0 ? ahead(t.dueDays) : ago(-t.dueDays),
      completedAt: t.status === 'done' ? ago(1) : null,
      applicationId: t.app ? appIds.get(t.app) ?? null : null,
      stageId: t.stage ? stageIds.get(t.stage) ?? null : null,
      tags: t.tags,
    })
  }

  for (const e of data.EXPENSES) {
    await db.insert(s.expenses).values({
      userId,
      date: ymd(e.monthsBack, e.dom),
      amountCents: e.rupees * 100,
      currency: 'INR',
      category: e.category,
      subcategory: e.sub ?? null,
      vendor: e.vendor,
      description: e.description ?? null,
      recurring: e.recurring ?? false,
      recurringPeriod: e.recurring ? 'monthly' : null,
    })
  }
  for (const b of data.BUDGETS) {
    await db.insert(s.expenseBudgets).values({
      userId,
      category: b.category,
      monthlyCapCents: b.rupees * 100,
      currency: 'INR',
    })
  }

  // Discovery sources, job discoveries (mostly new) and company discoveries.
  const [hn] = await db
    .insert(s.sources)
    .values({ userId, name: 'HN Who is hiring', kind: 'hn', config: {}, lastPolledAt: ago(0.2) })
    .returning()
  const [gh] = await db
    .insert(s.sources)
    .values({
      userId,
      name: 'Greenhouse — Postman',
      kind: 'greenhouse',
      config: { board: 'postman' },
      lastPolledAt: ago(0.3),
    })
    .returning()
  await db.insert(s.sources).values({
    userId,
    name: 'YC directory',
    kind: 'yc',
    config: {},
    enabled: false,
    lastError: 'HTTP 503 from upstream',
    errorCount: 2,
  })
  for (const [i, d] of data.DISCOVERIES.entries()) {
    await db.insert(s.discoveries).values({
      userId,
      sourceId: i % 2 === 0 ? hn!.id : gh!.id,
      sourceJobId: `seed-${i}`,
      raw: {},
      normalized: { kind: 'job', raw: {}, ...d.job, postedAt: ago(i + 1).toISOString() },
      matchScore: d.score,
      benefitsScore: d.benefits,
      matchReasoning: d.reasoning,
      status: d.status,
      createdAt: ago(i * 0.5),
    })
  }
  for (const [i, c] of data.COMPANY_DISCOVERIES.entries()) {
    await db.insert(s.companyDiscoveries).values({
      userId,
      sourceId: hn!.id,
      sourceCompanyId: `seed-co-${i}`,
      raw: {},
      normalized: { kind: 'company', raw: {}, ...c.company },
      matchScore: c.score,
      matchReasoning: c.reasoning,
      status: 'new',
      createdAt: ago(i + 1),
    })
  }

  for (const [i, log] of data.AI_CALLS.entries()) {
    await db.insert(s.aiCallLogs).values({ userId, ...log, createdAt: ago(i % 20) })
  }

  await closeDb()
  console.log(`e2e seed: ${TEST_LOGIN_EMAIL} with ${data.APPLICATIONS.length} applications, ${data.EXPENSES.length} expenses, ${data.DISCOVERIES.length} discoveries`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
