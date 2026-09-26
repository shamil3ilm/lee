import { z } from 'zod'
import { fetchWithTimeout, NEON_API_TIMEOUT_MS } from '@/lib/net/timeout'

/**
 * SERVER-ONLY. Minimal Neon API client for the usage meter
 * (https://api-docs.neon.tech/reference/getting-started-with-neon-api).
 *
 * The consumption-history endpoints are paid-plan only (Launch / Scale /
 * Business / Enterprise — https://neon.com/docs/guides/consumption-metrics),
 * so a Free project is read through `GET /projects/{id}`, whose project
 * object carries the current billing period's usage:
 *   - compute_time_seconds  → CU-hours (÷ 3600)
 *   - data_transfer_bytes   → egress this period
 *   - synthetic_storage_size, consumption_period_start / _end
 * and `GET /projects/{id}/endpoints` for the compute state (idle/active).
 * Control-plane calls never wake a suspended compute.
 *
 * Errors are typed with a friendly message; nothing from the response body
 * or the key is ever put in an error.
 */

export const NEON_API_BASE = 'https://console.neon.tech/api/v2'

export type NeonErrorCode = 'rejected' | 'unreachable' | 'no_project' | 'multiple_projects' | 'bad_response'

const MESSAGES: Record<NeonErrorCode, string> = {
  rejected: 'Neon rejected the API key.',
  unreachable: 'Could not reach the Neon API.',
  no_project: 'The Neon key has no projects (or the project id is wrong).',
  multiple_projects: 'The Neon key sees several projects: set the project id on the Usage page.',
  bad_response: 'Neon answered in an unexpected format.',
}

export class NeonApiError extends Error {
  constructor(readonly code: NeonErrorCode) {
    super(MESSAGES[code])
    this.name = 'NeonApiError'
  }
}

export function neonErrorMessage(e: unknown): string {
  return e instanceof NeonApiError ? e.message : MESSAGES.unreachable
}

const projectsSchema = z.object({
  projects: z.array(z.object({ id: z.string().min(1) })),
})

const num = z.number().finite().nonnegative()

const projectSchema = z.object({
  project: z.object({
    id: z.string(),
    compute_time_seconds: num.optional(),
    active_time_seconds: num.optional(),
    data_transfer_bytes: num.optional(),
    synthetic_storage_size: num.optional(),
    consumption_period_start: z.string().optional(),
    consumption_period_end: z.string().optional(),
  }),
})

const endpointsSchema = z.object({
  endpoints: z.array(
    z.object({
      type: z.string().optional(),
      current_state: z.string().optional(),
    }),
  ),
})

export interface NeonUsage {
  projectId: string
  /** compute_time_seconds / 3600; null when Neon does not report it. */
  computeCuHours: number | null
  egressBytes: number | null
  storageBytes: number | null
  periodStart: string | null
  periodEnd: string | null
  /** Read-write compute state: 'idle' | 'active' | 'init' | null. */
  computeState: string | null
}

async function call(path: string, key: string): Promise<unknown> {
  const url = `${NEON_API_BASE}${path}`
  const init: RequestInit = {
    method: 'GET',
    redirect: 'manual',
    headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
  }
  let res: Response
  try {
    res = await fetchWithTimeout(url, init, { timeoutMs: NEON_API_TIMEOUT_MS, label: 'neon-api' })
  } catch {
    throw new NeonApiError('unreachable')
  }
  if (res.status === 401 || res.status === 403) throw new NeonApiError('rejected')
  if (res.status === 404) throw new NeonApiError('no_project')
  if (!res.ok) throw new NeonApiError('unreachable')
  try {
    return await res.json()
  } catch {
    throw new NeonApiError('bad_response')
  }
}

const PROJECT_ID = /^[a-z0-9-]{3,64}$/

export function isNeonProjectId(v: string): boolean {
  return PROJECT_ID.test(v)
}

/** The only project the key can see, or a typed error. */
export async function discoverNeonProject(key: string): Promise<string> {
  const parsed = projectsSchema.safeParse(await call('/projects?limit=2', key))
  if (!parsed.success) throw new NeonApiError('bad_response')
  const [first, second] = parsed.data.projects
  if (!first) throw new NeonApiError('no_project')
  if (second) throw new NeonApiError('multiple_projects')
  return first.id
}

/** Cheapest authenticated call: list at most one project. */
export async function checkNeonKey(key: string): Promise<void> {
  const parsed = projectsSchema.safeParse(await call('/projects?limit=1', key))
  if (!parsed.success) throw new NeonApiError('bad_response')
}

/** Current-period usage of one project (discovered when no id is given). */
export async function fetchNeonUsage(args: {
  key: string
  projectId?: string | null
}): Promise<NeonUsage> {
  const projectId =
    args.projectId && isNeonProjectId(args.projectId)
      ? args.projectId
      : await discoverNeonProject(args.key)
  const id = encodeURIComponent(projectId)
  const [projectRaw, endpointsRaw] = await Promise.all([
    call(`/projects/${id}`, args.key),
    call(`/projects/${id}/endpoints`, args.key).catch(() => null),
  ])
  const project = projectSchema.safeParse(projectRaw)
  if (!project.success) throw new NeonApiError('bad_response')
  const p = project.data.project
  const endpoints = endpointsSchema.safeParse(endpointsRaw)
  const rw = endpoints.success
    ? (endpoints.data.endpoints.find((e) => e.type === 'read_write') ?? endpoints.data.endpoints[0])
    : undefined
  return {
    projectId,
    computeCuHours: p.compute_time_seconds === undefined ? null : p.compute_time_seconds / 3600,
    egressBytes: p.data_transfer_bytes ?? null,
    storageBytes: p.synthetic_storage_size ?? null,
    periodStart: p.consumption_period_start ?? null,
    periodEnd: p.consumption_period_end ?? null,
    computeState: rw?.current_state ?? null,
  }
}
