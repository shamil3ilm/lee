/**
 * One-time data migration: encrypt every plaintext OAuth token in `accounts`
 * (access_token, refresh_token, id_token) with lib/crypto/token-vault.ts.
 *
 * Idempotent: already-encrypted values are detected and skipped, so it is
 * safe to run twice (or while users sign in). Rows it misses are also
 * re-encrypted on their first read (lib/google/tokens.ts).
 *
 * Usage: DATABASE_URL=… AUTH_SECRET=… pnpm tsx scripts/encrypt-oauth-tokens.ts
 * (AUTH_SECRET must be the deployment's: it derives the encryption key.)
 */
import { encryptPlaintextAccountTokens } from '@/lib/auth/account-tokens'

async function main(): Promise<void> {
  const { scanned, updated } = await encryptPlaintextAccountTokens()
  process.stdout.write(`accounts with plaintext tokens: ${scanned}; encrypted now: ${updated}\n`)
  process.exit(0)
}

main().catch((error: unknown) => {
  process.stderr.write(`encrypt-oauth-tokens failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
