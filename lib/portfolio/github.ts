import { fetchWithTimeout, GITHUB_TIMEOUT_MS } from '@/lib/net/timeout'
import type { RepoTarget } from './config'

/**
 * GitHub contents API, just the calls Publish needs (GET, PUT, DELETE). The token is
 * only ever placed in the Authorization header — never logged, never in an
 * error message. `GITHUB_API_URL` (server config) points the client at a
 * stub in e2e runs; it defaults to api.github.com.
 */

export type GitHubErrorCode = 'unauthorized' | 'forbidden' | 'not_found' | 'rate_limited' | 'network' | 'unexpected'

const MESSAGES: Readonly<Record<GitHubErrorCode, string>> = {
  unauthorized: 'GitHub rejected the token (expired or revoked?).',
  forbidden: 'The token has no access to this repository. Check its repository and Contents permission.',
  not_found: 'Repository or branch not found (or the token cannot see it).',
  rate_limited: 'GitHub rate limit reached. Try again in a few minutes.',
  network: 'Could not reach GitHub.',
  unexpected: 'GitHub returned an unexpected answer.',
}

export class GitHubError extends Error {
  constructor(
    readonly code: GitHubErrorCode,
    readonly status: number | null = null,
  ) {
    super(MESSAGES[code])
    this.name = 'GitHubError'
  }
}

export function apiBase(): string {
  return (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '')
}

function headers(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'lee-portfolio-sync',
  }
}

function enc(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

export function contentsUrl(t: RepoTarget): string {
  return `${apiBase()}/repos/${encodeURIComponent(t.owner)}/${encodeURIComponent(t.repo)}/contents/${enc(t.path)}`
}

async function call(url: string, init: RequestInit, token: string): Promise<Response> {
  try {
    return await fetchWithTimeout(
      url,
      { ...init, headers: { ...headers(token), ...(init.headers as Record<string, string> | undefined) }, redirect: 'manual' },
      { timeoutMs: GITHUB_TIMEOUT_MS, label: 'github' },
    )
  } catch {
    throw new GitHubError('network')
  }
}

function failure(res: Response): GitHubError {
  if (res.status === 401) return new GitHubError('unauthorized', 401)
  if (res.status === 403 || res.status === 429) {
    return res.headers.get('x-ratelimit-remaining') === '0' || res.status === 429
      ? new GitHubError('rate_limited', res.status)
      : new GitHubError('forbidden', res.status)
  }
  if (res.status === 404) return new GitHubError('not_found', 404)
  return new GitHubError('unexpected', res.status)
}

export type RemoteFile = { exists: true; sha: string; text: string } | { exists: false }

/** GET the file on the branch; `{ exists: false }` when it is not there yet. */
export async function getFile(t: RepoTarget, token: string): Promise<RemoteFile> {
  const res = await call(`${contentsUrl(t)}?ref=${encodeURIComponent(t.branch)}`, { method: 'GET' }, token)
  if (res.status === 404) return { exists: false }
  if (!res.ok) throw failure(res)
  const body = (await res.json()) as { sha?: unknown; content?: unknown; encoding?: unknown; type?: unknown }
  if (body.type !== 'file' || typeof body.sha !== 'string' || typeof body.content !== 'string') {
    throw new GitHubError('unexpected', res.status)
  }
  const text = Buffer.from(body.content.replace(/\s/g, ''), 'base64').toString('utf8')
  return { exists: true, sha: body.sha, text }
}

export type PutResult =
  | { ok: true; contentSha: string; commitSha: string; commitUrl: string | null }
  | { ok: false; conflict: true }

/**
 * PUT the file. `sha` is the blob sha being replaced (omit to create): a
 * 409 / 422 means someone changed the file in between — optimistic
 * concurrency — and the caller re-fetches.
 */
export async function putFile(
  t: RepoTarget,
  token: string,
  input: { text: string; message: string; sha: string | null },
): Promise<PutResult> {
  const body = {
    message: input.message,
    content: Buffer.from(input.text, 'utf8').toString('base64'),
    branch: t.branch,
    ...(input.sha ? { sha: input.sha } : {}),
  }
  const res = await call(contentsUrl(t), { method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }, token)
  if (res.status === 409 || res.status === 422) return { ok: false, conflict: true }
  if (!res.ok) throw failure(res)
  const json = (await res.json()) as { content?: { sha?: unknown }; commit?: { sha?: unknown; html_url?: unknown } }
  const contentSha = json.content?.sha
  const commitSha = json.commit?.sha
  if (typeof contentSha !== 'string' || typeof commitSha !== 'string') throw new GitHubError('unexpected', res.status)
  return { ok: true, contentSha, commitSha, commitUrl: typeof json.commit?.html_url === 'string' ? json.commit.html_url : null }
}

export type DeleteResult = { ok: true; commitUrl: string | null } | { ok: false; conflict: true }

/**
 * DELETE the file. `sha` is the blob sha being deleted: a 409 / 422 means
 * it changed in between (the caller re-fetches). A 404 means it is already
 * gone, which is what the caller wanted.
 */
export async function deleteFile(t: RepoTarget, token: string, input: { message: string; sha: string }): Promise<DeleteResult> {
  const body = { message: input.message, sha: input.sha, branch: t.branch }
  const res = await call(contentsUrl(t), { method: 'DELETE', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }, token)
  if (res.status === 409 || res.status === 422) return { ok: false, conflict: true }
  if (res.status === 404) return { ok: true, commitUrl: null }
  if (!res.ok) throw failure(res)
  const json = (await res.json().catch(() => ({}))) as { commit?: { html_url?: unknown } }
  return { ok: true, commitUrl: typeof json.commit?.html_url === 'string' ? json.commit.html_url : null }
}

/** GET the repository (metadata read access). */
export async function getRepo(t: RepoTarget, token: string): Promise<{ defaultBranch: string | null }> {
  const res = await call(`${apiBase()}/repos/${encodeURIComponent(t.owner)}/${encodeURIComponent(t.repo)}`, { method: 'GET' }, token)
  if (!res.ok) throw failure(res)
  const json = (await res.json()) as { default_branch?: unknown }
  return { defaultBranch: typeof json.default_branch === 'string' ? json.default_branch : null }
}

/**
 * Write-access probe that can never write: PUT the file's CURRENT content
 * with a deliberately wrong sha. With contents:write GitHub answers 409
 * (sha mismatch); without it, 403/404. Only called when the file exists.
 */
export async function probeWrite(t: RepoTarget, token: string, currentText: string): Promise<boolean> {
  const res = await call(
    contentsUrl(t),
    {
      method: 'PUT',
      body: JSON.stringify({
        message: 'lee write-access check (never committed)',
        content: Buffer.from(currentText, 'utf8').toString('base64'),
        branch: t.branch,
        sha: '0000000000000000000000000000000000000000',
      }),
      headers: { 'content-type': 'application/json' },
    },
    token,
  )
  if (res.status === 409 || res.status === 422) return true
  if (res.status === 403 || res.status === 404) return false
  throw failure(res)
}
