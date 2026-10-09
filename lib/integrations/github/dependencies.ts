import { catalogIdForRepo, githubProjectId } from '@/lib/radar/new/projects'

/**
 * Client-safe, pure. Which Radar release projects a repo depends on, from
 * its package.json (npm) or composer.json (Composer). Only packages that
 * map to a known project are followed; the rest are ignored (lee does not
 * guess a package's GitHub repository).
 */

const NPM: Readonly<Record<string, string>> = {
  next: 'nextjs',
  react: 'react',
  'react-dom': 'react',
  vue: 'vue',
  '@angular/core': 'angular',
  typescript: 'typescript',
  tailwindcss: 'tailwind',
  vite: 'vite',
  '@playwright/test': 'playwright',
  playwright: 'playwright',
  'drizzle-orm': 'drizzle',
  supabase: 'supabase',
  pg: 'postgresql',
  postgres: 'postgresql',
  mysql2: 'mysql',
  mongodb: 'mongodb',
  mongoose: 'mongodb',
  redis: 'redis',
  ioredis: 'redis',
}

const COMPOSER: Readonly<Record<string, string>> = {
  php: 'php',
  'laravel/framework': 'laravel',
  'livewire/livewire': 'livewire',
  'filament/filament': 'filament',
  'symfony/framework-bundle': 'symfony',
  'symfony/http-kernel': 'symfony',
  'predis/predis': 'redis',
  'mongodb/laravel-mongodb': 'mongodb',
}

function record(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function parse(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text) as unknown
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function projectsFromPackageJson(text: string): string[] {
  const doc = parse(text)
  if (!doc) return []
  const names = [...Object.keys(record(doc.dependencies)), ...Object.keys(record(doc.devDependencies))]
  const ids = names.map((n) => NPM[n]).filter((id): id is string => Boolean(id))
  if (record(doc.engines).node !== undefined) ids.push('nodejs')
  return [...new Set(ids)]
}

export function projectsFromComposerJson(text: string): string[] {
  const doc = parse(text)
  if (!doc) return []
  const names = [...Object.keys(record(doc.require)), ...Object.keys(record(doc['require-dev']))]
  return [...new Set(names.map((n) => COMPOSER[n.toLowerCase()]).filter((id): id is string => Boolean(id)))]
}

/** Starred repos → catalog ids where the catalog has the repo, else "gh:owner/repo". */
export function projectsFromStarred(fullNames: readonly string[]): string[] {
  return [...new Set(fullNames.map((n) => catalogIdForRepo(n) ?? githubProjectId(n)).filter((id): id is string => Boolean(id)))]
}
