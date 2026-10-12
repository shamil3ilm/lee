import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

interface VercelConfig {
  regions: string[]
  crons: Array<{ path: string; schedule: string }>
  git?: { deploymentEnabled?: boolean | Record<string, boolean> }
  buildCommand: string
}

const cfg = JSON.parse(readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8')) as VercelConfig

/** Minimatch-style branch glob: `**` spans slashes, `*` stays within one segment. */
function globToRegExp(glob: string): RegExp {
  const src = glob
    .split('**')
    .map((part) =>
      part
        .split('*')
        .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('[^/]*'),
    )
    .join('.*')
  return new RegExp(`^${src}$`)
}

/** Vercel deploys a branch unless it matches only `false` rules (any `true` match wins). */
function deploys(branch: string): boolean {
  const rules = cfg.git?.deploymentEnabled
  if (rules === undefined) return true
  if (typeof rules === 'boolean') return rules
  const matched = Object.entries(rules).filter(([glob]) => globToRegExp(glob).test(branch))
  if (matched.length === 0) return true
  return matched.some(([, on]) => on)
}

describe('vercel.json', () => {
  it('keeps main (production) deployments on', () => {
    expect(deploys('main')).toBe(true)
  })

  it('skips previews for CI staging and Dependabot branches (CI already covers them)', () => {
    expect(deploys('ci/staging')).toBe(false)
    expect(deploys('ci/deps-batch')).toBe(false)
    expect(deploys('dependabot/npm_and_yarn/typescript-6.0.3')).toBe(false)
    expect(deploys('dependabot/npm_and_yarn/types/node-26.6.4')).toBe(false)
    expect(deploys('dependabot/github_actions/actions/checkout-7')).toBe(false)
  })

  it('still deploys other branches', () => {
    expect(deploys('fix/sign-out')).toBe(true)
  })

  it('leaves the cron schedule, region and build command unchanged', () => {
    expect(cfg.crons).toEqual([
      { path: '/api/cron/schedule', schedule: '0 9 * * *' },
      { path: '/api/cron/drain', schedule: '0 12 * * *' },
      { path: '/api/cron/drain', schedule: '0 16 * * *' },
      { path: '/api/cron/drain', schedule: '0 21 * * *' },
      { path: '/api/cron/retention', schedule: '30 3 * * *' },
    ])
    expect(cfg.regions).toEqual(['sin1'])
    expect(cfg.buildCommand).toBe('pnpm db:migrate && pnpm build')
  })
})
