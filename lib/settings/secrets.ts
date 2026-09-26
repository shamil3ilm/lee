import * as keysQ from '@/lib/db/queries/labProviderKeys'
import * as profileQ from '@/lib/db/queries/profile'
import { resolveKey } from '@/lib/lab/providers/registry'
import { DEFAULT_LAYA_ENDPOINT } from '@/lib/decisions/laya-http'
import { fetchWithTimeout } from '@/lib/net/timeout'
import { assertSafeUrl } from '@/lib/ingest/ssrf'
import {
  SERVICE_SECRETS,
  getServiceSecretInfo,
  type SecretSource,
  type ServiceSecretId,
  type ServiceSecretStatus,
} from './service-secrets'

/**
 * SERVER-ONLY. Per-user secrets with env fallback — "the UI value wins when
 * set, the env value is the default". Decrypted keys never leave the server;
 * only `last4` is ever returned to a client.
 */

export interface ResolvedSecret {
  key: string | null
  source: SecretSource
}

/** Saved key (decrypted) → env var → none. */
export async function resolveServiceSecret(
  userId: string,
  id: ServiceSecretId,
): Promise<ResolvedSecret> {
  const stored = await keysQ.getDecrypted(userId, id)
  if (stored) return { key: stored, source: 'db' }
  const envVal = process.env[getServiceSecretInfo(id).envKey]
  if (envVal) return { key: envVal, source: 'env' }
  return { key: null, source: 'none' }
}

/** Key for the app's own AI calls: the Settings › AI key for that provider, else env. */
export async function resolveAiKey(userId: string, provider: 'gemini' | 'groq'): Promise<string | null> {
  const { key } = await resolveKey(userId, provider === 'gemini' ? 'google' : 'groq')
  return key
}

/** Masked status for the settings page (one query; no decryption). */
export async function listServiceSecretStatuses(userId: string): Promise<ServiceSecretStatus[]> {
  const masked = await keysQ.listMasked(userId)
  const byId = new Map(masked.map((m) => [m.provider, m]))
  return SERVICE_SECRETS.map((info) => {
    const m = byId.get(info.id)
    const source: SecretSource = m ? 'db' : process.env[info.envKey] ? 'env' : 'none'
    return { info, source, last4: m?.last4 ?? null }
  })
}

export interface CheckResult {
  ok: boolean
  /** Friendly, safe to show. */
  error: string | null
  /** True when the service answered that the key is wrong (401/403). */
  rejected: boolean
}

const CHECK_TIMEOUT_MS = 8_000

/**
 * The cheapest authenticated call each service offers:
 *   - Firecrawl: GET /v1/team/credit-usage (no credits spent)
 *   - Laya: GET {endpoint}/config (Gradio app config) with the bearer token
 */
export async function checkServiceKey(
  id: ServiceSecretId,
  key: string,
  opts: { layaEndpoint?: string | null; fetchImpl?: typeof fetch } = {},
): Promise<CheckResult> {
  const url =
    id === 'firecrawl'
      ? 'https://api.firecrawl.dev/v1/team/credit-usage'
      : `${(opts.layaEndpoint || DEFAULT_LAYA_ENDPOINT).replace(/\/$/, '')}/config`
  const label = getServiceSecretInfo(id).label
  // The Laya endpoint is user-supplied: only public https hosts may be
  // called (no localhost / private / link-local IPs), and redirects are not
  // followed, so the check can't be used to probe internal addresses.
  try {
    assertSafeUrl(url)
  } catch {
    return { ok: false, error: `${label} endpoint must be a public https URL.`, rejected: false }
  }
  try {
    const init: RequestInit = {
      method: 'GET',
      redirect: 'manual',
      headers: { authorization: `Bearer ${key}` },
    }
    const res = opts.fetchImpl
      ? await opts.fetchImpl(url, init)
      : await fetchWithTimeout(url, init, { timeoutMs: CHECK_TIMEOUT_MS, label: `${id}-check` })
    if (res.ok) return { ok: true, error: null, rejected: false }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: `${label} rejected this key.`, rejected: true }
    }
    return { ok: false, error: `${label} did not accept the check.`, rejected: false }
  } catch {
    return { ok: false, error: `Could not reach ${label}.`, rejected: false }
  }
}

/** "Test" button: check whichever key is in effect (saved or env). */
export async function testServiceSecret(
  userId: string,
  id: ServiceSecretId,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<CheckResult> {
  const { key } = await resolveServiceSecret(userId, id)
  if (!key) return { ok: false, error: 'No key configured.', rejected: false }
  const layaEndpoint =
    id === 'laya'
      ? ((await profileQ.get(userId))?.layaEndpoint ?? process.env.LAYA_ENDPOINT ?? null)
      : null
  return checkServiceKey(id, key, { layaEndpoint, fetchImpl: opts.fetchImpl })
}
