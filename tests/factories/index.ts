import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db/client'
import * as s from '@/lib/db/schema'
import { DEFAULTS_VERSION } from '@/lib/defaults/catalog'

/**
 * A test user as an established account: the starter defaults count as
 * already applied, so schedulers and Run now don't add the default job
 * boards (or poll them over the network) in unrelated tests. Use
 * `makeFreshUser` to test the defaults themselves.
 */
export async function makeUser(email = `test-${randomUUID()}@example.com`) {
  const u = await makeFreshUser(email)
  await db.insert(s.userDefaults).values({ userId: u.id, version: DEFAULTS_VERSION })
  return u
}

/** A brand-new account that hasn't received the starter defaults yet. */
export async function makeFreshUser(email = `test-${randomUUID()}@example.com`) {
  const [u] = await db.insert(s.users).values({ email, name: 'Test' }).returning()
  if (!u) throw new Error('failed to create user')
  return u
}

export async function makeCompany(
  userId: string,
  overrides: Partial<typeof s.companies.$inferInsert> = {},
) {
  const [c] = await db
    .insert(s.companies)
    .values({ userId, name: 'Acme', domain: `acme-${randomUUID()}.com`, ...overrides })
    .returning()
  if (!c) throw new Error('failed to create company')
  return c
}

export async function makeContact(
  userId: string,
  overrides: Partial<typeof s.contacts.$inferInsert> = {},
) {
  const [row] = await db
    .insert(s.contacts)
    .values({ userId, name: 'Contact', ...overrides })
    .returning()
  if (!row) throw new Error('failed to create contact')
  return row
}

export async function makeJob(
  userId: string,
  companyId: string | null,
  overrides: Partial<typeof s.jobs.$inferInsert> = {},
) {
  const [j] = await db
    .insert(s.jobs)
    .values({
      userId,
      companyId: companyId ?? undefined,
      title: 'Senior Engineer',
      sourceUrl: `https://acme.com/jobs/${randomUUID()}`,
      ...overrides,
    })
    .returning()
  if (!j) throw new Error('failed to create job')
  return j
}

export async function makeApplication(
  userId: string,
  jobId: string,
  overrides: Partial<typeof s.applications.$inferInsert> = {},
) {
  const [a] = await db
    .insert(s.applications)
    .values({ userId, jobId, ...overrides })
    .returning()
  if (!a) throw new Error('failed to create application')
  return a
}

export async function makeSource(
  userId: string,
  overrides: Partial<typeof s.sources.$inferInsert> = {},
) {
  const [row] = await db
    .insert(s.sources)
    .values({ userId, name: 'HN', kind: 'hn', config: {}, ...overrides })
    .returning()
  if (!row) throw new Error('failed to create source')
  return row
}

export async function makeDiscovery(
  userId: string,
  sourceId: string,
  overrides: Partial<typeof s.discoveries.$inferInsert> = {},
) {
  const [row] = await db
    .insert(s.discoveries)
    .values({
      userId,
      sourceId,
      sourceJobId: randomUUID(),
      raw: {},
      normalized: { title: 'Engineer', companyName: 'Acme' },
      ...overrides,
    })
    .returning()
  if (!row) throw new Error('failed to create discovery')
  return row
}

/** Google OAuth scopes the owner holds after "Connect Gmail & Calendar". */
export const OWNER_GOOGLE_SCOPE = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ')

/** A Google `accounts` row for the user with the given scope string (no real tokens). */
export async function makeGoogleAccount(userId: string, scope = OWNER_GOOGLE_SCOPE) {
  const [row] = await db
    .insert(s.accounts)
    .values({ userId, type: 'oauth', provider: 'google', providerAccountId: `g-${randomUUID()}`, scope })
    .returning()
  if (!row) throw new Error('failed to create account')
  return row
}

/**
 * The deployment owner (ALLOWED_EMAIL, `test@example.com` in tests), with
 * Gmail connected unless `gmail: false`: the only account Gmail jobs run
 * for in the invite beta.
 */
export async function makeOwner(opts: { gmail?: boolean } = {}) {
  const u = await makeUser(process.env.ALLOWED_EMAIL ?? 'test@example.com')
  if (opts.gmail !== false) await makeGoogleAccount(u.id)
  return u
}
