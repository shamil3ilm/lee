/**
 * Per-user service secrets managed in Settings › AI. Client-safe catalogue
 * (no I/O). Values live encrypted in the v14 key store (`lab_provider_keys`,
 * AES-256-GCM) under these ids, next to the model-provider keys; the env var
 * named by `envKey` is only the fallback default when the user has not
 * saved their own.
 */
export const SERVICE_SECRET_IDS = [
  'firecrawl',
  'laya',
  'neon',
  'google_places',
  'adzuna',
  'github_portfolio',
  'github_search',
  'huggingface',
] as const

export type ServiceSecretId = (typeof SERVICE_SECRET_IDS)[number]

export interface ServiceSecretInfo {
  id: ServiceSecretId
  label: string
  description: string
  envKey:
    | 'FIRECRAWL_API_KEY'
    | 'LAYA_API_KEY'
    | 'NEON_API_KEY'
    | 'GOOGLE_PLACES_API_KEY'
    | 'ADZUNA_KEY'
    | 'GITHUB_PORTFOLIO_TOKEN'
    | 'GITHUB_TOKEN'
    | 'HF_TOKEN'
  keyUrl?: string
  /** True when a cheap authenticated call can verify the key. */
  testable: boolean
  /** Managed on its own settings page instead of Settings › AI. */
  managedIn?: string
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
  {
    id: 'neon',
    label: 'Neon',
    description:
      'Optional, read-only use: lets Settings › Usage show compute (CU-hours), egress and compute state for your Neon project. Without it, only database size is measured.',
    envKey: 'NEON_API_KEY',
    keyUrl: 'https://neon.com/docs/manage/api-keys',
    testable: true,
  },
  {
    id: 'google_places',
    label: 'Google Places',
    description:
      "Optional: shows a company's Google rating and reviews on its Reputation panel. Stays off until you enable it in Settings › Integrations, where lee caps its own calls per month below Google's free tier.",
    envKey: 'GOOGLE_PLACES_API_KEY',
    keyUrl: 'https://console.cloud.google.com/google/maps-apis/credentials',
    testable: true,
  },
  {
    id: 'adzuna',
    label: 'Adzuna',
    description:
      'Job search for India (Adzuna covers no GCC country). Free developer key: paste it as APP_ID:APP_KEY. Used by the "Jobs by Adzuna" source in Settings › Sources; the free tier allows 250 searches a day and lee makes at most 4.',
    envKey: 'ADZUNA_KEY',
    keyUrl: 'https://developer.adzuna.com/signup',
    testable: true,
  },
  {
    id: 'github_portfolio',
    label: 'GitHub (portfolio)',
    description:
      'Fine-grained token that lets lee commit profile.json to your portfolio repository: Contents read and write on that one repository only.',
    envKey: 'GITHUB_PORTFOLIO_TOKEN',
    keyUrl: 'https://github.com/settings/personal-access-tokens/new',
    testable: true,
    managedIn: '/settings/profile/publish',
  },
  {
    id: 'github_search',
    label: 'GitHub (AI Radar)',
    description:
      'Optional read-only token (no scopes needed) for the AI Radar repo search: it raises GitHub search from 10 to 30 requests a minute. Without it the radar still runs, more slowly.',
    envKey: 'GITHUB_TOKEN',
    keyUrl: 'https://github.com/settings/personal-access-tokens/new',
    testable: true,
  },
  {
    id: 'huggingface',
    label: 'Hugging Face (AI Radar)',
    description:
      'Optional read token for the AI Radar Hugging Face lists. Without it the public API is used (500 requests per 5 minutes, far more than lee needs).',
    envKey: 'HF_TOKEN',
    keyUrl: 'https://huggingface.co/settings/tokens',
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
