import { normalizeName } from '../text'

/**
 * Projects whose releases "What's new" follows. Version and end-of-life
 * facts come from endoflife.date where it covers the project (release
 * cycles); minor releases come from the project's GitHub releases where
 * they are meaningful. Each user's list is derived from the master
 * profile (ready skills, study list, role families) until they edit it in
 * Radar › Sources. Client-safe, pure.
 */

export interface ReleaseProject {
  id: string
  label: string
  /** endoflife.date product slug (release cycles + EOL dates). */
  eol?: string
  /** GitHub "owner/repo": its non-prerelease x.y.0 releases. */
  github?: string
  /** Skill names that select it (compared letters-and-digits only, lower case). */
  aliases: readonly string[]
}

// Every eol slug was checked against https://endoflife.date/api/v1/products/<slug> on Oct 8, 2026.
export const RELEASE_PROJECTS: readonly ReleaseProject[] = [
  { id: 'laravel', label: 'Laravel', eol: 'laravel', aliases: ['laravel'] },
  { id: 'php', label: 'PHP', eol: 'php', aliases: ['php'] },
  { id: 'symfony', label: 'Symfony', eol: 'symfony', aliases: ['symfony'] },
  { id: 'livewire', label: 'Livewire', github: 'livewire/livewire', aliases: ['livewire'] },
  { id: 'filament', label: 'Filament', github: 'filamentphp/filament', aliases: ['filament'] },
  { id: 'nextjs', label: 'Next.js', eol: 'nextjs', github: 'vercel/next.js', aliases: ['next.js', 'nextjs', 'next'] },
  { id: 'react', label: 'React', eol: 'react', github: 'facebook/react', aliases: ['react', 'react.js', 'reactjs'] },
  { id: 'vue', label: 'Vue', eol: 'vue', aliases: ['vue', 'vue.js', 'vuejs'] },
  { id: 'angular', label: 'Angular', eol: 'angular', aliases: ['angular'] },
  { id: 'typescript', label: 'TypeScript', github: 'microsoft/TypeScript', aliases: ['typescript', 'ts'] },
  { id: 'nodejs', label: 'Node.js', eol: 'nodejs', aliases: ['node.js', 'nodejs', 'node'] },
  { id: 'tailwind', label: 'Tailwind CSS', eol: 'tailwind-css', aliases: ['tailwind', 'tailwind css', 'tailwindcss'] },
  { id: 'vite', label: 'Vite', github: 'vitejs/vite', aliases: ['vite'] },
  { id: 'playwright', label: 'Playwright', github: 'microsoft/playwright', aliases: ['playwright'] },
  { id: 'drizzle', label: 'Drizzle ORM', github: 'drizzle-team/drizzle-orm', aliases: ['drizzle', 'drizzle orm'] },
  { id: 'supabase', label: 'Supabase CLI', github: 'supabase/cli', aliases: ['supabase'] },
  { id: 'postgresql', label: 'PostgreSQL', eol: 'postgresql', aliases: ['postgresql', 'postgres', 'psql'] },
  { id: 'mysql', label: 'MySQL', eol: 'mysql', aliases: ['mysql'] },
  { id: 'mariadb', label: 'MariaDB', eol: 'mariadb', aliases: ['mariadb'] },
  { id: 'redis', label: 'Redis', eol: 'redis', aliases: ['redis'] },
  { id: 'mongodb', label: 'MongoDB', eol: 'mongodb', aliases: ['mongodb', 'mongo'] },
  { id: 'python', label: 'Python', eol: 'python', aliases: ['python'] },
  { id: 'django', label: 'Django', eol: 'django', aliases: ['django'] },
  { id: 'go', label: 'Go', eol: 'go', aliases: ['go', 'golang'] },
  { id: 'rust', label: 'Rust', eol: 'rust', aliases: ['rust'] },
  { id: 'dotnet', label: '.NET', eol: 'dotnet', aliases: ['.net', 'dotnet', 'c#', 'asp.net'] },
  { id: 'java', label: 'Java (Temurin)', eol: 'eclipse-temurin', aliases: ['java'] },
  { id: 'spring-boot', label: 'Spring Boot', eol: 'spring-boot', aliases: ['spring boot', 'spring'] },
  { id: 'docker', label: 'Docker Engine', eol: 'docker-engine', aliases: ['docker'] },
  { id: 'kubernetes', label: 'Kubernetes', eol: 'kubernetes', aliases: ['kubernetes', 'k8s'] },
]

export const RELEASE_PROJECT_IDS: readonly string[] = RELEASE_PROJECTS.map((p) => p.id)
const BY_ID = new Map(RELEASE_PROJECTS.map((p) => [p.id, p]))

/**
 * A GitHub repository followed directly ("gh:owner/repo"): a starred repo,
 * or a dependency of a linked repo that is not in the catalog. Its GitHub
 * releases are followed like a catalog project's.
 */
export const GITHUB_PROJECT_PREFIX = 'gh:'
const GITHUB_PROJECT = /^gh:([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})$/

export function githubProjectId(fullName: string): string | null {
  const id = `${GITHUB_PROJECT_PREFIX}${fullName}`
  return GITHUB_PROJECT.test(id) ? id : null
}

function githubProject(id: string): ReleaseProject | undefined {
  const m = GITHUB_PROJECT.exec(id)
  if (!m) return undefined
  const repo = m[2]!
  return { id, label: `${m[1]}/${repo}`, github: `${m[1]}/${repo}`, aliases: [repo.toLowerCase()] }
}

/** The catalog project with this GitHub repo, if any ("vercel/next.js" is nextjs). */
export function catalogIdForRepo(fullName: string): string | undefined {
  const lower = fullName.toLowerCase()
  return RELEASE_PROJECTS.find((p) => p.github?.toLowerCase() === lower)?.id
}

export function releaseProject(id: string): ReleaseProject | undefined {
  return BY_ID.get(id) ?? githubProject(id)
}

/** Role families (lib/discovery/relevance/roles.ts) → projects their work usually runs on. */
const ROLE_PROJECTS: Readonly<Record<string, readonly string[]>> = {
  frontend: ['react', 'typescript'],
  fullstack: ['react', 'typescript', 'nodejs'],
  devops: ['docker', 'kubernetes'],
  data_analyst: ['postgresql', 'python'],
  analytics_eng: ['postgresql', 'python'],
  data: ['postgresql', 'python'],
  ml: ['python'],
  llm_app: ['python', 'typescript'],
  qa_automation: ['playwright'],
}

/** Max projects in one user's list (the shared fetch takes the union, capped too). */
export const MAX_USER_PROJECTS = 20

/** A user's default list: projects named by ready skills or the study list, then by role families. */
export function deriveReleaseProjects(input: {
  readySkills: readonly string[]
  studySkills: readonly string[]
  roleFamilies: readonly string[]
}): string[] {
  const skills = new Set([...input.readySkills, ...input.studySkills].map(normalizeName).filter(Boolean))
  const out = new Set<string>()
  for (const p of RELEASE_PROJECTS) {
    if (p.aliases.some((a) => skills.has(normalizeName(a)))) out.add(p.id)
  }
  for (const f of input.roleFamilies) for (const id of ROLE_PROJECTS[f] ?? []) out.add(id)
  return [...out].slice(0, MAX_USER_PROJECTS)
}

/** Known ids (catalog or gh:owner/repo) only, unique, capped. */
export function cleanProjectIds(ids: readonly unknown[]): string[] {
  return [...new Set(ids.filter((i): i is string => typeof i === 'string' && releaseProject(i) !== undefined))].slice(0, MAX_USER_PROJECTS)
}

/** The shared fetch's list: every user's projects, most-followed first, capped. */
export function unionProjects(lists: ReadonlyArray<readonly string[]>, cap = 30): string[] {
  const count = new Map<string, number>()
  for (const l of lists) for (const id of new Set(l)) if (releaseProject(id)) count.set(id, (count.get(id) ?? 0) + 1)
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, cap).map(([id]) => id)
}
