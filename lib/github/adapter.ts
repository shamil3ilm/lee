import type { GitHubRepo } from '@/lib/documents/types'
import { fetchWithTimeout, GITHUB_TIMEOUT_MS } from '@/lib/net/timeout'

/**
 * Fetches public repos for a GitHub user. Unauthenticated requests get 60/hr;
 * pass a token for 5000/hr. We sort by recent update and cap at 30 — the
 * distill prompt only needs the top candidates.
 */
export async function fetchPublicRepos(
  username: string,
  token?: string,
): Promise<GitHubRepo[]> {
  const headers: Record<string, string> = {
    'user-agent': 'employ-app/0.1',
    accept: 'application/vnd.github+json',
  }
  if (token) headers.authorization = `Bearer ${token}`
  const url = `https://api.github.com/users/${encodeURIComponent(username)}/repos?type=public&sort=updated&per_page=30`
  const res = await fetchWithTimeout(url, { headers }, { timeoutMs: GITHUB_TIMEOUT_MS, label: 'github' })
  if (!res.ok) {
    // Surface rate-limit and not-found errors distinctly so callers can toast
    // a meaningful message.
    if (res.status === 404) throw new Error(`github user ${username} not found`)
    if (res.status === 403) throw new Error('github rate limit exceeded — try again later or set GITHUB_TOKEN')
    throw new Error(`github ${res.status}`)
  }
  const raw = (await res.json()) as Array<Record<string, unknown>>
  return raw.map((r) => ({
    name: String(r.name ?? ''),
    description: (r.description as string | null) ?? null,
    url: String(r.html_url ?? ''),
    primaryLanguage: (r.language as string | null) ?? null,
    stargazers: Number(r.stargazers_count ?? 0),
    updatedAt: String(r.updated_at ?? ''),
  }))
}
