/**
 * Per-user service secrets managed in Settings › AI. Client-safe catalogue
 * (no I/O). Values live encrypted in the v14 key store (`lab_provider_keys`,
 * AES-256-GCM) under these ids, next to the model-provider keys; the env var
 * named by `envKey` is only the fallback default when the user has not
 * saved their own.
 */
export const SERVICE_SECRET_IDS = ['firecrawl', 'laya'] as const

export type ServiceSecretId = (typeof SERVICE_SECRET_IDS)[number]

export interface ServiceSecretInfo {
  id: ServiceSecretId
  label: string
  description: string
  envKey: 'FIRECRAWL_API_KEY' | 'LAYA_API_KEY'
  keyUrl?: string
  /** True when a cheap authenticated call can verify the key. */
  testable: boolean
}

export const SERVICE_SECRETS: readonly ServiceSecretInfo[] = [
  {
    id: 'firecrawl',
    label: 'Firecrawl',
    description:
      'Renders JavaScript-heavy job pages when you add an application from a URL. Optional: without it the plain page text is used.',
    envKey: 'FIRECRAWL_API_KEY',
    keyUrl: 'https://www.firecrawl.dev/app/api-keys',
    testable: true,
  },
  {
    id: 'laya',
    label: 'Laya',
    description:
      'Bearer token for a private Laya endpoint (decision engine). Not needed for the public demo Space.',
    envKey: 'LAYA_API_KEY',
    testable: true,
  },
]

export function isServiceSecretId(v: unknown): v is ServiceSecretId {
  return typeof v === 'string' && (SERVICE_SECRET_IDS as readonly string[]).includes(v)
}

export function getServiceSecretInfo(id: ServiceSecretId): ServiceSecretInfo {
  const info = SERVICE_SECRETS.find((s) => s.id === id)
  if (!info) throw new Error(`Unknown service secret: ${id}`)
  return info
}

export type SecretSource = 'db' | 'env' | 'none'

export interface ServiceSecretStatus {
  info: ServiceSecretInfo
  source: SecretSource
  last4: string | null
}
