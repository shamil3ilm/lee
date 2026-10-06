import type { RepoTarget } from './config'
import { getFile, getRepo, GitHubError, probeWrite } from './github'

/**
 * Settings › Profile › Publish › Test: does this token have Contents read
 * and write on exactly the configured repository — and nothing broader?
 *
 *   1. fine-grained token (github_pat_…): classic tokens reach every repo
 *   2. repository readable (metadata)
 *   3. profile.json readable on the branch (or not there yet)
 *   4. write access, via a PUT that cannot write (wrong sha → 409)
 */

export interface TokenCheckStep {
  label: string
  ok: boolean
  detail: string
}

export interface TokenCheckResult {
  ok: boolean
  steps: TokenCheckStep[]
}

function safeMessage(err: unknown): string {
  return err instanceof GitHubError ? err.message : 'Could not reach GitHub.'
}

export async function checkPortfolioToken(target: RepoTarget, token: string): Promise<TokenCheckResult> {
  const repoName = `${target.owner}/${target.repo}`
  const steps: TokenCheckStep[] = []
  const fineGrained = token.startsWith('github_pat_')
  steps.push({
    label: 'Fine-grained token',
    ok: fineGrained,
    detail: fineGrained
      ? 'Scoped token.'
      : `This looks like a classic token, which can reach all your repositories. Create a fine-grained token for ${repoName} only.`,
  })
  try {
    await getRepo(target, token)
    steps.push({ label: 'Repository access', ok: true, detail: `${repoName} is reachable.` })
  } catch (err) {
    steps.push({ label: 'Repository access', ok: false, detail: safeMessage(err) })
    return { ok: false, steps }
  }
  let current: string | null = null
  try {
    const file = await getFile(target, token)
    current = file.exists ? file.text : null
    steps.push({
      label: 'Contents: read',
      ok: true,
      detail: file.exists ? `${target.path} on ${target.branch} is readable.` : `${target.path} is not on ${target.branch} yet; Publish creates it.`,
    })
  } catch (err) {
    steps.push({ label: 'Contents: read', ok: false, detail: safeMessage(err) })
    return { ok: false, steps }
  }
  if (current === null) {
    steps.push({ label: 'Contents: write', ok: true, detail: 'Confirmed on the first publish (nothing to test against yet).' })
  } else {
    try {
      const canWrite = await probeWrite(target, token, current)
      steps.push({
        label: 'Contents: write',
        ok: canWrite,
        detail: canWrite ? 'Write access confirmed (nothing was committed).' : 'The token can read but not write. Give it Contents: Read and write.',
      })
    } catch (err) {
      steps.push({ label: 'Contents: write', ok: false, detail: safeMessage(err) })
    }
  }
  return { ok: steps.every((s) => s.ok), steps }
}
