/**
 * v12.0 — skill vocabulary + synonym map for keyword matching.
 *
 * Each entry maps a canonical skill to its aliases. `family` groups related
 * skills so a CV with a sibling (e.g. MySQL when the JD asks for Postgres)
 * earns a PARTIAL match rather than nothing. `caseSensitive` marks terms that
 * collide with plain English ("Go", "Swift", "REST") — in free text they only
 * match in their canonical capitalisation.
 *
 * Bump SCORER_VERSION (lib/cv-score/version.ts) whenever this map changes —
 * it alters keyword scores.
 */

export interface SkillEntry {
  canonical: string
  aliases: string[]
  family?: string
  /** Free-text matching must use these exact-case forms only. */
  caseSensitive?: string[]
}

export const SKILLS: readonly SkillEntry[] = [
  // Languages
  { canonical: 'javascript', aliases: ['js', 'javascript', 'ecmascript', 'es6', 'es2015'], family: 'js' },
  { canonical: 'typescript', aliases: ['ts', 'typescript'], family: 'js' },
  { canonical: 'python', aliases: ['python', 'python3', 'py'], family: 'scripting' },
  { canonical: 'java', aliases: ['java'], family: 'jvm' },
  { canonical: 'kotlin', aliases: ['kotlin'], family: 'jvm' },
  { canonical: 'scala', aliases: ['scala'], family: 'jvm' },
  { canonical: 'go', aliases: ['golang'], caseSensitive: ['Go'], family: 'systems' },
  { canonical: 'rust', aliases: ['rust', 'rustlang'], family: 'systems' },
  { canonical: 'c++', aliases: ['c++', 'cpp'], family: 'systems' },
  { canonical: 'c#', aliases: ['c#', 'csharp'], family: 'dotnet' },
  { canonical: '.net', aliases: ['.net', 'dotnet', '.net core', 'asp.net'], family: 'dotnet' },
  { canonical: 'php', aliases: ['php', 'php8'], family: 'scripting' },
  { canonical: 'ruby', aliases: ['ruby'], family: 'scripting' },
  { canonical: 'elixir', aliases: ['elixir'], family: 'scripting' },
  { canonical: 'swift', aliases: ['swiftui'], caseSensitive: ['Swift'], family: 'mobile' },
  { canonical: 'sql', aliases: ['sql'], family: 'sql' },
  { canonical: 'bash', aliases: ['bash', 'shell scripting'], family: 'scripting' },
  // Frameworks / runtimes
  { canonical: 'react', aliases: ['react', 'react.js', 'reactjs'], family: 'frontend' },
  { canonical: 'next.js', aliases: ['next.js', 'nextjs'], family: 'frontend' },
  { canonical: 'vue', aliases: ['vue', 'vue.js', 'vuejs'], family: 'frontend' },
  { canonical: 'angular', aliases: ['angular', 'angularjs', 'angular.js'], family: 'frontend' },
  { canonical: 'svelte', aliases: ['svelte', 'sveltekit'], family: 'frontend' },
  { canonical: 'react native', aliases: ['react native', 'react-native'], family: 'mobile' },
  { canonical: 'flutter', aliases: ['flutter'], family: 'mobile' },
  { canonical: 'node.js', aliases: ['node', 'node.js', 'nodejs'], family: 'backend-runtime' },
  { canonical: 'express', aliases: ['express.js', 'expressjs'], caseSensitive: ['Express'], family: 'backend-runtime' },
  { canonical: 'nestjs', aliases: ['nestjs', 'nest.js'], family: 'backend-runtime' },
  { canonical: 'django', aliases: ['django'], family: 'python-web' },
  { canonical: 'flask', aliases: ['flask'], family: 'python-web' },
  { canonical: 'fastapi', aliases: ['fastapi'], family: 'python-web' },
  { canonical: 'spring', aliases: ['spring boot', 'springboot'], caseSensitive: ['Spring'], family: 'jvm' },
  { canonical: 'laravel', aliases: ['laravel'], family: 'scripting' },
  { canonical: 'rails', aliases: ['rails', 'ruby on rails', 'ror'], family: 'scripting' },
  { canonical: 'graphql', aliases: ['graphql', 'gql'], family: 'api' },
  { canonical: 'rest', aliases: ['restful', 'rest api', 'rest apis', 'restful apis'], caseSensitive: ['REST'], family: 'api' },
  { canonical: 'grpc', aliases: ['grpc'], family: 'api' },
  // Data stores
  { canonical: 'postgresql', aliases: ['postgres', 'postgresql', 'psql', 'pg'], family: 'sql' },
  { canonical: 'mysql', aliases: ['mysql', 'mariadb'], family: 'sql' },
  { canonical: 'sql server', aliases: ['sql server', 'mssql', 't-sql'], family: 'sql' },
  { canonical: 'oracle', aliases: ['oracle db', 'oracle database', 'pl/sql'], family: 'sql' },
  { canonical: 'mongodb', aliases: ['mongodb', 'mongo'], family: 'nosql' },
  { canonical: 'dynamodb', aliases: ['dynamodb', 'dynamo db'], family: 'nosql' },
  { canonical: 'cassandra', aliases: ['cassandra'], family: 'nosql' },
  { canonical: 'redis', aliases: ['redis'], family: 'cache' },
  { canonical: 'elasticsearch', aliases: ['elasticsearch', 'elastic search', 'opensearch'], family: 'search' },
  { canonical: 'snowflake', aliases: ['snowflake'], family: 'warehouse' },
  { canonical: 'bigquery', aliases: ['bigquery', 'big query'], family: 'warehouse' },
  // Messaging / streaming
  { canonical: 'kafka', aliases: ['kafka', 'apache kafka'], family: 'queue' },
  { canonical: 'rabbitmq', aliases: ['rabbitmq', 'rabbit mq', 'amqp'], family: 'queue' },
  { canonical: 'sqs', aliases: ['sqs', 'amazon sqs'], family: 'queue' },
  // Cloud / infra
  { canonical: 'aws', aliases: ['aws', 'amazon web services', 'amazon aws', 'ec2', 'lambda', 's3'], family: 'cloud' },
  { canonical: 'gcp', aliases: ['gcp', 'google cloud', 'google cloud platform'], family: 'cloud' },
  { canonical: 'azure', aliases: ['azure', 'microsoft azure'], family: 'cloud' },
  { canonical: 'docker', aliases: ['docker', 'containers', 'containerization'], family: 'containers' },
  { canonical: 'kubernetes', aliases: ['kubernetes', 'k8s', 'eks', 'gke', 'aks'], family: 'containers' },
  { canonical: 'terraform', aliases: ['terraform', 'infrastructure as code', 'iac'], family: 'iac' },
  { canonical: 'ansible', aliases: ['ansible'], family: 'iac' },
  { canonical: 'ci/cd', aliases: ['ci/cd', 'cicd', 'ci-cd', 'continuous integration', 'continuous delivery', 'continuous deployment'], family: 'delivery' },
  { canonical: 'github actions', aliases: ['github actions'], family: 'delivery' },
  { canonical: 'jenkins', aliases: ['jenkins'], family: 'delivery' },
  { canonical: 'linux', aliases: ['linux', 'unix'], family: 'ops' },
  { canonical: 'observability', aliases: ['observability', 'monitoring', 'prometheus', 'grafana', 'datadog', 'opentelemetry'], family: 'ops' },
  // Concepts
  { canonical: 'microservices', aliases: ['microservices', 'microservice', 'micro-services', 'service-oriented architecture', 'soa'], family: 'architecture' },
  { canonical: 'distributed systems', aliases: ['distributed systems', 'distributed system'], family: 'architecture' },
  { canonical: 'system design', aliases: ['system design', 'systems design'], family: 'architecture' },
  { canonical: 'event-driven', aliases: ['event-driven', 'event driven', 'event sourcing'], family: 'architecture' },
  { canonical: 'machine learning', aliases: ['machine learning', 'ml', 'deep learning'], family: 'ml' },
  { canonical: 'llm', aliases: ['llm', 'llms', 'large language models', 'genai', 'generative ai'], family: 'ml' },
  { canonical: 'tdd', aliases: ['tdd', 'test-driven development', 'test driven development', 'unit testing'], family: 'quality' },
  { canonical: 'agile', aliases: ['agile', 'scrum', 'kanban'], family: 'process' },
  { canonical: 'payments', aliases: ['payments', 'payment processing', 'payment systems'], family: 'domain' },
]

interface AliasIndexEntry {
  alias: string
  canonical: string
  pattern: RegExp
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Word boundary that treats +, #, . and letters/digits as "inside" a token so
// `c++` doesn't match inside `c++17` and `java` doesn't match `javascript`.
function aliasPattern(alias: string, flags: string): RegExp {
  return new RegExp(`(?<![A-Za-z0-9+#.])${escapeRegex(alias)}(?![A-Za-z0-9+#]|\\.[A-Za-z])`, flags)
}

const ALIAS_TO_CANONICAL = new Map<string, string>()
const FAMILY_OF = new Map<string, string>()
const FREE_TEXT_INDEX: AliasIndexEntry[] = []

for (const entry of SKILLS) {
  ALIAS_TO_CANONICAL.set(entry.canonical, entry.canonical)
  if (entry.family) FAMILY_OF.set(entry.canonical, entry.family)
  for (const a of entry.aliases) {
    ALIAS_TO_CANONICAL.set(a, entry.canonical)
    FREE_TEXT_INDEX.push({ alias: a, canonical: entry.canonical, pattern: aliasPattern(a, 'gi') })
  }
  for (const cs of entry.caseSensitive ?? []) {
    ALIAS_TO_CANONICAL.set(cs.toLowerCase(), entry.canonical)
    FREE_TEXT_INDEX.push({ alias: cs, canonical: entry.canonical, pattern: aliasPattern(cs, 'g') })
  }
}

/** Lowercase, trim, collapse whitespace, strip trailing punctuation. */
export function normalizeTerm(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s"'(]+|[\s"'),;:!?]+$/g, '')
    .replace(/\.$/, '')
}

/**
 * Canonical form of a skill term. Known aliases collapse to their canonical
 * name (`postgres` → `postgresql`); unknown terms return their normalised
 * spelling so arbitrary JD skills still compare equal across sources.
 */
export function canonicalize(raw: string): string {
  const n = normalizeTerm(raw)
  if (!n) return ''
  return ALIAS_TO_CANONICAL.get(n) ?? ALIAS_TO_CANONICAL.get(n.replace(/\s*\(.*\)$/, '')) ?? n
}

export function familyOf(canonical: string): string | undefined {
  return FAMILY_OF.get(canonical)
}

export function isKnownSkill(canonical: string): boolean {
  return ALIAS_TO_CANONICAL.has(canonical)
}

/**
 * Scan free text for known skills. Returns canonical → occurrence count.
 * `Go` is special-cased: "go to", "go-to" and "go live" are English, not Go.
 */
export function findSkillsInText(text: string): Map<string, number> {
  const counts = new Map<string, number>()
  if (!text) return counts
  // Overlapping alias hits ("Apache Kafka" + "Kafka") count once: collect
  // spans per canonical term and count only non-overlapping ones.
  const spans = new Map<string, [number, number][]>()
  for (const { canonical, pattern, alias } of FREE_TEXT_INDEX) {
    pattern.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = pattern.exec(text)) !== null) {
      if (alias === 'Go') {
        const after = text.slice(m.index + 2, m.index + 8).toLowerCase()
        if (/^[\s-]*(to|live|ahead)\b/.test(after)) continue
      }
      const list = spans.get(canonical) ?? []
      list.push([m.index, m.index + m[0].length])
      spans.set(canonical, list)
    }
  }
  for (const [canonical, list] of spans) {
    const sorted = [...list].sort((a, b) => a[0] - b[0] || b[1] - a[1])
    let n = 0
    let end = -1
    for (const [s, e] of sorted) {
      if (s >= end) {
        n++
        end = e
      } else if (e > end) end = e
    }
    counts.set(canonical, n)
  }
  return counts
}

/** Number of vocabulary entries — exposed for tests / docs. */
export const SKILL_COUNT = SKILLS.length
