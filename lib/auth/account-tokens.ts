import { and, eq, or, sql } from 'drizzle-orm'
import type { Adapter, AdapterAccount } from 'next-auth/adapters'
import { db, type DbClient } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'
import { decryptToken, encryptToken, isEncrypted } from '@/lib/crypto/token-vault'

/**
 * SERVER-ONLY. OAuth tokens in `accounts` (access/refresh/id token) are stored
 * encrypted with lib/crypto/token-vault.ts:
 *
 * - writes: the Auth.js adapter wrapper (`linkAccount`) and the sign-in
 *   re-consent patch (`encryptAccountTokenPatch`) encrypt;
 * - reads: lib/google/tokens.ts decrypts (the only reader of token values);
 * - legacy plaintext rows: re-encrypted on first read
 *   (`reencryptIfPlaintext`) and by the idempotent one-time migration
 *   `encryptPlaintextAccountTokens` (scripts/encrypt-oauth-tokens.ts).
 */

export const ACCOUNT_TOKEN_COLUMNS = ['access_token', 'refresh_token', 'id_token'] as const
type TokenColumn = (typeof ACCOUNT_TOKEN_COLUMNS)[number]
type TokenFields = Partial<Record<TokenColumn, string | null | undefined>>

function mapTokens<T extends TokenFields>(row: T, fn: (v: string | null | undefined) => string | null | undefined): T {
  const out: T = { ...row }
  for (const col of ACCOUNT_TOKEN_COLUMNS) {
    if (col in out) (out as TokenFields)[col] = fn(out[col])
  }
  return out
}

/** Copy of `patch` with its token columns encrypted (other fields untouched). */
export function encryptAccountTokenPatch<T extends TokenFields>(patch: T): T {
  return mapTokens(patch, (v) => encryptToken(v))
}

/** Copy of `row` with its token columns decrypted (legacy plaintext passes through). */
export function decryptAccountTokens<T extends TokenFields>(row: T): T {
  return mapTokens(row, (v) => decryptToken(v))
}

/** Wrap an Auth.js adapter so account tokens never reach the DB in plaintext. */
export function withEncryptedAccountTokens(base: Adapter): Adapter {
  const wrapped: Adapter = { ...base }
  if (base.linkAccount) {
    const link = base.linkAccount.bind(base)
    wrapped.linkAccount = (account: AdapterAccount) => link(encryptAccountTokenPatch(account))
  }
  if (base.getAccount) {
    const get = base.getAccount.bind(base)
    wrapped.getAccount = async (providerAccountId, provider) => {
      const acc = await get(providerAccountId, provider)
      return acc ? decryptAccountTokens(acc) : acc
    }
  }
  return wrapped
}

type AccountKey = { provider: string; providerAccountId: string }

/** True when any token column holds plaintext. */
export function hasPlaintextTokens(row: TokenFields): boolean {
  return ACCOUNT_TOKEN_COLUMNS.some((c) => {
    const v = row[c]
    return typeof v === 'string' && v.length > 0 && !isEncrypted(v)
  })
}

/**
 * Re-save a row's token columns encrypted when any is still plaintext.
 * Compare-and-set on the old values, so a concurrent refresh is never
 * overwritten with stale data. Returns true when it wrote.
 */
export async function reencryptIfPlaintext(
  row: AccountKey & TokenFields,
  client: DbClient = db,
): Promise<boolean> {
  if (!hasPlaintextTokens(row)) return false
  const patch: TokenFields = {}
  const same = []
  for (const col of ACCOUNT_TOKEN_COLUMNS) {
    const v = row[col]
    if (v === undefined) continue
    patch[col] = encryptToken(v)
    same.push(v === null ? sql`${accounts[col]} is null` : eq(accounts[col], v))
  }
  const updated = await client
    .update(accounts)
    .set(patch)
    .where(and(eq(accounts.provider, row.provider), eq(accounts.providerAccountId, row.providerAccountId), ...same))
    .returning()
  return updated.length > 0
}

/**
 * One-time migration: encrypt every plaintext token in `accounts`. Idempotent
 * (envelopes are detected and skipped), so it is safe to run twice or
 * concurrently with sign-ins.
 */
export async function encryptPlaintextAccountTokens(
  client: DbClient = db,
): Promise<{ scanned: number; updated: number }> {
  const notEnc = (col: TokenColumn) =>
    sql`(${accounts[col]} is not null and ${accounts[col]} <> '' and ${accounts[col]} not like 'enc:v1:%')`
  const rows = await client
    .select({
      provider: accounts.provider,
      providerAccountId: accounts.providerAccountId,
      access_token: accounts.access_token,
      refresh_token: accounts.refresh_token,
      id_token: accounts.id_token,
    })
    .from(accounts)
    .where(or(...ACCOUNT_TOKEN_COLUMNS.map(notEnc)))
  let updated = 0
  for (const row of rows) {
    if (await reencryptIfPlaintext(row, client)) updated++
  }
  return { scanned: rows.length, updated }
}
