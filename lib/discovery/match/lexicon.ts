import { canonicalize, familyOf, findSkillsInText, isKnownSkill } from '@/lib/cv-score/synonyms'
import { normalizeForMatch, termMatcher, type TermMatcher } from '../relevance/text'

/**
 * Skill vocabulary for the Match Score. Builds on the CV scorer's synonym
 * map (lib/cv-score/synonyms.ts, untouched so CV scores do not move) with:
 *   - EXTRA skills that map only matters for discovery (Git, HTML, Symfony…);
 *   - CONCEPTS: generic asks satisfied by any specific skill
 *     ("a PHP framework" ← Laravel / Symfony; "a relational database" ← MySQL);
 *   - IMPLIES: a ready Laravel also counts as PHP;
 *   - PARTIAL families: a sibling earns half credit (MySQL for PostgreSQL).
 * Changing any list changes scores → bump MATCH_SCORE_VERSION.
 */

interface ExtraSkill {
  canonical: string
  label: string
  aliases: readonly string[]
  family?: string
}

const EXTRA_SKILLS: readonly ExtraSkill[] = [
  { canonical: 'git', label: 'Git', aliases: ['git', 'github', 'gitlab', 'bitbucket', 'version control'] },
  { canonical: 'html', label: 'HTML', aliases: ['html', 'html5'] },
  { canonical: 'css', label: 'CSS', aliases: ['css', 'css3', 'scss', 'sass'] },
  { canonical: 'tailwind', label: 'Tailwind CSS', aliases: ['tailwind', 'tailwindcss', 'tailwind css'] },
  { canonical: 'jquery', label: 'jQuery', aliases: ['jquery'] },
  { canonical: 'livewire', label: 'Livewire', aliases: ['livewire'], family: 'php-framework' },
  { canonical: 'symfony', label: 'Symfony', aliases: ['symfony'], family: 'php-framework' },
  { canonical: 'codeigniter', label: 'CodeIgniter', aliases: ['codeigniter'], family: 'php-framework' },
  { canonical: 'yii', label: 'Yii', aliases: ['yii', 'yii2'], family: 'php-framework' },
  { canonical: 'wordpress', label: 'WordPress', aliases: ['wordpress'] },
  { canonical: 'nginx', label: 'Nginx', aliases: ['nginx'] },
  { canonical: 'phpunit', label: 'PHPUnit', aliases: ['phpunit', 'pest'] },
  { canonical: 'oauth', label: 'OAuth', aliases: ['oauth', 'oauth2', 'oauth 2.0', 'openid connect'] },
  { canonical: 'webhooks', label: 'Webhooks', aliases: ['webhook', 'webhooks'] },
  { canonical: 'stripe', label: 'Stripe', aliases: ['stripe'] },
  // Data / analysis
  { canonical: 'excel', label: 'Excel', aliases: ['excel', 'ms excel', 'microsoft excel', 'advanced excel', 'spreadsheets'] },
  { canonical: 'power bi', label: 'Power BI', aliases: ['power bi', 'powerbi', 'power-bi', 'dax'], family: 'bi' },
  { canonical: 'tableau', label: 'Tableau', aliases: ['tableau'], family: 'bi' },
  { canonical: 'looker', label: 'Looker', aliases: ['looker', 'looker studio', 'google data studio'], family: 'bi' },
  { canonical: 'metabase', label: 'Metabase', aliases: ['metabase', 'superset', 'apache superset'], family: 'bi' },
  { canonical: 'pandas', label: 'pandas', aliases: ['pandas', 'numpy', 'jupyter'] },
  { canonical: 'etl', label: 'ETL', aliases: ['etl', 'elt', 'data pipelines', 'data pipeline'], family: 'pipelines' },
  { canonical: 'airflow', label: 'Airflow', aliases: ['airflow', 'apache airflow'], family: 'pipelines' },
  { canonical: 'dbt', label: 'dbt', aliases: ['dbt', 'data build tool'], family: 'pipelines' },
  { canonical: 'data modelling', label: 'Data modelling', aliases: ['data modelling', 'data modeling', 'dimensional modelling', 'dimensional modeling', 'star schema'] },
  { canonical: 'dashboards', label: 'KPI dashboards', aliases: ['dashboards', 'dashboard', 'kpi dashboards', 'kpi reporting', 'kpis', 'kpi'] },
  { canonical: 'statistics', label: 'Statistics', aliases: ['statistics', 'statistical analysis', 'a/b testing', 'hypothesis testing'] },
  { canonical: 'requirements gathering', label: 'Requirements gathering', aliases: ['requirements gathering', 'requirements elicitation', 'requirements analysis', 'gathering requirements'] },
  { canonical: 'brd', label: 'BRD / FRD', aliases: ['brd', 'brds', 'frd', 'frds', 'business requirements document', 'functional specifications', 'functional specification'], family: 'ba-docs' },
  { canonical: 'user stories', label: 'User stories', aliases: ['user stories', 'user story', 'acceptance criteria'], family: 'ba-docs' },
  { canonical: 'uat', label: 'UAT', aliases: ['uat', 'user acceptance testing'] },
  { canonical: 'process mapping', label: 'Process mapping', aliases: ['process mapping', 'process modelling', 'process modeling', 'bpmn', 'as-is to-be'] },
]

interface Concept {
  canonical: string
  label: string
  /** Phrases that ask for the concept. */
  phrases: readonly string[]
  /** Any of these canonical skills satisfies it in full. */
  satisfiedBy: readonly string[]
}

const CONCEPTS: readonly Concept[] = [
  {
    canonical: 'bi tool',
    label: 'BI tool',
    phrases: ['bi tool', 'bi tools', 'data visualization tools', 'data visualisation tools', 'visualization tools', 'reporting tools'],
    satisfiedBy: ['power bi', 'tableau', 'looker', 'metabase'],
  },
  {
    canonical: 'php framework',
    label: 'PHP framework',
    phrases: ['php framework', 'php frameworks', 'php mvc framework', 'php mvc frameworks', 'modern php framework'],
    satisfiedBy: ['laravel', 'symfony', 'codeigniter', 'yii'],
  },
  {
    canonical: 'relational database',
    label: 'Relational database',
    phrases: ['relational database', 'relational databases', 'rdbms', 'sql databases', 'sql database'],
    satisfiedBy: ['postgresql', 'mysql', 'sql server', 'oracle', 'sql'],
  },
  {
    canonical: 'nosql',
    label: 'NoSQL',
    phrases: ['nosql', 'no-sql', 'non-relational database', 'non-relational databases'],
    satisfiedBy: ['mongodb', 'dynamodb', 'cassandra', 'redis'],
  },
  {
    canonical: 'message queue',
    label: 'Message queue',
    phrases: ['message queue', 'message queues', 'message broker', 'message brokers', 'queueing systems', 'pub/sub'],
    satisfiedBy: ['kafka', 'rabbitmq', 'sqs', 'redis'],
  },
  {
    canonical: 'cloud platform',
    label: 'Cloud platform',
    phrases: ['cloud platform', 'cloud platforms', 'public cloud', 'cloud providers', 'cloud provider'],
    satisfiedBy: ['aws', 'gcp', 'azure'],
  },
  {
    canonical: 'js framework',
    label: 'JavaScript framework',
    phrases: ['javascript framework', 'javascript frameworks', 'js framework', 'js frameworks', 'frontend framework', 'frontend frameworks', 'spa framework'],
    satisfiedBy: ['react', 'vue', 'angular', 'svelte', 'next.js'],
  },
]

/** A ready skill on the left also counts as every skill on the right. */
const IMPLIES: Readonly<Record<string, readonly string[]>> = {
  laravel: ['php'],
  symfony: ['php'],
  codeigniter: ['php'],
  yii: ['php'],
  livewire: ['laravel', 'php'],
  phpunit: ['php'],
  django: ['python'],
  flask: ['python'],
  fastapi: ['python'],
  rails: ['ruby'],
  spring: ['java'],
  'next.js': ['react', 'javascript'],
  react: ['javascript'],
  vue: ['javascript'],
  angular: ['typescript', 'javascript'],
  typescript: ['javascript'],
  nestjs: ['node.js', 'typescript'],
  express: ['node.js'],
  'node.js': ['javascript'],
  postgresql: ['sql'],
  mysql: ['sql'],
  'sql server': ['sql'],
  tailwind: ['css'],
}

/** Families whose siblings earn half credit; broad ones ("scripting") never do. */
const PARTIAL_FAMILIES: ReadonlySet<string> = new Set([
  'sql', 'nosql', 'queue', 'cloud', 'frontend', 'jvm', 'python-web', 'backend-runtime', 'dotnet',
  'delivery', 'iac', 'api', 'warehouse', 'search', 'mobile', 'php-framework', 'bi', 'pipelines', 'ba-docs',
])

/** Lexicon hits that are not skills a posting can be "missing" (process words, domains). */
const IGNORED: ReadonlySet<string> = new Set(['agile', 'payments', 'observability', 'tdd', 'system design'])

const LABELS: Readonly<Record<string, string>> = {
  javascript: 'JavaScript', typescript: 'TypeScript', python: 'Python', java: 'Java', kotlin: 'Kotlin',
  scala: 'Scala', go: 'Go', rust: 'Rust', 'c++': 'C++', 'c#': 'C#', '.net': '.NET', php: 'PHP',
  ruby: 'Ruby', elixir: 'Elixir', swift: 'Swift', sql: 'SQL', bash: 'Bash', react: 'React',
  'next.js': 'Next.js', vue: 'Vue', angular: 'Angular', svelte: 'Svelte', 'react native': 'React Native',
  flutter: 'Flutter', 'node.js': 'Node.js', express: 'Express', nestjs: 'NestJS', django: 'Django',
  flask: 'Flask', fastapi: 'FastAPI', spring: 'Spring', laravel: 'Laravel', rails: 'Rails',
  graphql: 'GraphQL', rest: 'REST APIs', grpc: 'gRPC', postgresql: 'PostgreSQL', mysql: 'MySQL',
  'sql server': 'SQL Server', oracle: 'Oracle', mongodb: 'MongoDB', dynamodb: 'DynamoDB',
  cassandra: 'Cassandra', redis: 'Redis', elasticsearch: 'Elasticsearch', snowflake: 'Snowflake',
  bigquery: 'BigQuery', kafka: 'Kafka', rabbitmq: 'RabbitMQ', sqs: 'SQS', aws: 'AWS', gcp: 'GCP',
  azure: 'Azure', docker: 'Docker', kubernetes: 'Kubernetes', terraform: 'Terraform', ansible: 'Ansible',
  'ci/cd': 'CI/CD', 'github actions': 'GitHub Actions', jenkins: 'Jenkins', linux: 'Linux',
  microservices: 'Microservices', 'distributed systems': 'Distributed systems',
  'event-driven': 'Event-driven design', 'machine learning': 'Machine learning', llm: 'LLMs',
}

const EXTRA_BY_CANONICAL = new Map(EXTRA_SKILLS.map((s) => [s.canonical, s] as const))
const CONCEPT_BY_CANONICAL = new Map(CONCEPTS.map((c) => [c.canonical, c] as const))
const EXTRA_MATCHERS: ReadonlyArray<{ canonical: string; match: TermMatcher }> = EXTRA_SKILLS.map((s) => ({
  canonical: s.canonical,
  match: termMatcher(s.aliases),
}))
const CONCEPT_MATCHERS: ReadonlyArray<{ canonical: string; match: TermMatcher }> = CONCEPTS.map((c) => ({
  canonical: c.canonical,
  match: termMatcher(c.phrases),
}))

export function skillLabel(canonical: string): string {
  return (
    LABELS[canonical] ??
    EXTRA_BY_CANONICAL.get(canonical)?.label ??
    CONCEPT_BY_CANONICAL.get(canonical)?.label ??
    canonical.replace(/(^|\s)(\p{L})/gu, (_m, s: string, c: string) => s + c.toUpperCase())
  )
}

/** The CV lexicon files Laravel under the broad "scripting" family; here it is a PHP framework. */
const FAMILY_OVERRIDES: Readonly<Record<string, string>> = { laravel: 'php-framework' }

export function skillFamily(canonical: string): string | undefined {
  return FAMILY_OVERRIDES[canonical] ?? EXTRA_BY_CANONICAL.get(canonical)?.family ?? familyOf(canonical)
}

export function isConcept(canonical: string): boolean {
  return CONCEPT_BY_CANONICAL.has(canonical)
}

export function conceptSatisfiers(canonical: string): readonly string[] {
  return CONCEPT_BY_CANONICAL.get(canonical)?.satisfiedBy ?? []
}

export function partialFamily(canonical: string): string | undefined {
  const f = skillFamily(canonical)
  return f && PARTIAL_FAMILIES.has(f) ? f : undefined
}

/**
 * Every skill and concept a text names, canonical. `raw` keeps its case so
 * the CV lexicon's case-sensitive terms ("Go", "REST") still work.
 */
export function skillsInText(raw: string | null | undefined): Set<string> {
  const out = new Set<string>()
  if (!raw) return out
  for (const c of findSkillsInText(raw).keys()) if (!IGNORED.has(c)) out.add(c)
  const text = normalizeForMatch(raw)
  for (const m of EXTRA_MATCHERS) if (m.match(text)) out.add(m.canonical)
  for (const m of CONCEPT_MATCHERS) if (m.match(text)) out.add(m.canonical)
  return out
}

/** A free-form skill name ("Laravel 10", "Postgres") → canonical, or null when unknown. */
export function canonicalSkill(name: string): string | null {
  const hits = skillsInText(name)
  if (hits.size > 0) return [...hits][0]!
  const c = canonicalize(name)
  return c && isKnownSkill(c) && !IGNORED.has(c) ? c : null
}

/** The set plus everything its members imply (Laravel → PHP), one level deep twice. */
export function withImplied(skills: Iterable<string>): Set<string> {
  const out = new Set(skills)
  for (let pass = 0; pass < 2; pass++) {
    for (const s of [...out]) for (const i of IMPLIES[s] ?? []) out.add(i)
  }
  return out
}
