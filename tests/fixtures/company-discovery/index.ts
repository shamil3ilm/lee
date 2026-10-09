/**
 * Offline fixtures for company discovery (lib/company-discovery). SYNTHETIC:
 * company names, logins, domains and people are invented (`.example`
 * domains), shaped like the real responses checked on 2026-10-09
 * (query.wikidata.org SPARQL JSON, GitHub REST search/orgs/repos, yc-oss
 * all.json, Technopark paginated-companies, QSTP wp-json directory).
 */

const E = 'http://www.wikidata.org/entity/'
const b = (value: string) => ({ value })

/** Wikidata SPARQL JSON: rows repeat per place / industry, as WDQS returns them. */
export const WIKIDATA_KW = {
  head: { vars: ['item', 'itemLabel', 'itemDescription', 'site', 'inception', 'employees', 'logo', 'place', 'ind'] },
  results: {
    bindings: [
      {
        item: b(`${E}Q900001`),
        itemLabel: b('Dinar Pay'),
        itemDescription: b('payments company in Kuwait'),
        site: b('https://www.dinarpay.example/'),
        inception: b('2019-01-01T00:00:00Z'),
        employees: b('45'),
        logo: b('http://commons.wikimedia.org/wiki/Special:FilePath/Dinar%20Pay.svg'),
        place: b(`${E}Q35178`),
        ind: b(`${E}Q1956140`),
      },
      {
        item: b(`${E}Q900001`),
        itemLabel: b('Dinar Pay'),
        site: b('https://www.dinarpay.example/'),
        place: b(`${E}Q817`),
        ind: b(`${E}Q16319025`),
      },
      {
        item: b(`${E}Q900002`),
        itemLabel: b('Gulf Ledger Bank'),
        site: b('http://gulfledger.example'),
        inception: b('1961-05-01T00:00:00Z'),
        employees: b('3200'),
        place: b(`${E}Q817`),
        ind: b(`${E}Q837171`),
      },
      // No English label: dropped.
      { item: b(`${E}Q900003`), itemLabel: b('Q900003'), place: b(`${E}Q817`), ind: b(`${E}Q880371`) },
      {
        item: b(`${E}Q900004`),
        itemLabel: b('Ministry of Example Services'),
        site: b('https://moes.example.gov'),
        place: b(`${E}Q35178`),
        ind: b(`${E}Q11661`),
      },
    ],
  },
}

export const WIKIDATA_AE = {
  head: { vars: [] },
  results: {
    bindings: [
      {
        item: b(`${E}Q900010`),
        itemLabel: b('Falcon Invoicing'),
        site: b('https://falconinvoice.example'),
        inception: b('2021-01-01T00:00:00Z'),
        place: b(`${E}Q612`),
        ind: b(`${E}Q131508`),
      },
    ],
  },
}

export const GITHUB_ORGS_KUWAIT = {
  total_count: 3,
  incomplete_results: false,
  items: [
    { login: 'dinarpay', type: 'Organization', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' },
    { login: 'someone-personal', type: 'User', avatar_url: 'https://avatars.githubusercontent.com/u/2?v=4' },
    { login: 'kw-devhouse', type: 'Organization', avatar_url: 'https://avatars.githubusercontent.com/u/3?v=4' },
  ],
}

export const GITHUB_ORG_DEVHOUSE = {
  login: 'kw-devhouse',
  name: 'KW Devhouse',
  blog: 'kwdevhouse.example',
  location: 'Kuwait City, Kuwait',
  description: 'Software house building payment and ERP integrations',
  public_repos: 24,
}

export const GITHUB_REPOS_DEVHOUSE = [
  { name: 'a', language: 'PHP', fork: false, archived: false },
  { name: 'b', language: 'PHP', fork: false, archived: false },
  { name: 'c', language: 'TypeScript', fork: false, archived: false },
  { name: 'd', language: 'Go', fork: true, archived: false },
  { name: 'e', language: null, fork: false, archived: false },
]

export const YC_ALL = [
  {
    id: 1,
    name: 'Kochi Ledger',
    slug: 'kochi-ledger',
    website: 'https://kochiledger.example',
    all_locations: 'Kochi, KL, India',
    one_liner: 'Accounting software for SMEs',
    team_size: 12,
    industry: 'Fintech',
    subindustry: 'Fintech -> Payments',
    industries: ['Fintech', 'Payments'],
    tags: ['SaaS'],
    regions: ['India', 'South Asia'],
    status: 'Active',
    stage: 'Early',
    batch: 'Winter 2026',
    small_logo_thumb_url: 'https://example.com/logo.png',
  },
  {
    id: 2,
    name: 'Dubai Data Labs',
    slug: 'dubai-data-labs',
    website: 'https://dubaidata.example',
    all_locations: 'Dubai, Dubai, United Arab Emirates',
    team_size: 300,
    industry: 'B2B',
    industries: ['B2B', 'Analytics'],
    regions: ['United Arab Emirates', 'Middle East and North Africa'],
    status: 'Active',
    stage: 'Growth',
    batch: 'Summer 2021',
  },
  { id: 3, name: 'Elsewhere Inc', all_locations: 'San Francisco, CA, USA', regions: ['United States of America'], status: 'Active' },
  { id: 4, name: 'Gone Pay', all_locations: 'Riyadh, Saudi Arabia', regions: ['Saudi Arabia'], status: 'Inactive' },
]

export const TECHNOPARK_PAGE = {
  current_page: 1,
  last_page: 25,
  data: [
    { id: 1, company: 'Trivandrum Example Systems (P) Ltd', active: 1 },
    { id: 2, company: '  Closed Example Ltd ', active: 0 },
  ],
}

export const QSTP_DIRECTORY = [
  {
    id: 10,
    link: 'https://qstp.qa/directory/doha-ai-example/',
    title: { rendered: 'Doha AI Example' },
    content: {
      rendered:
        '<p>Builds analytics for logistics.</p><p><strong>Sector:</strong> AI; Data</p><h3>Get in touch</h3><p>Website: <a href="https://dohaai.example/?utm_source=x">Doha AI</a><br>Email: <a href="mailto:hello@dohaai.example">hello@dohaai.example</a></p>',
    },
    class_list: ['tag-artificial-intelligence-ai'],
  },
]

export const HOME_WITH_BOARD = `<!doctype html><html><head><title>Dinar Pay</title></head><body>
<nav><a href="/about">About</a><a href="https://jobs.lever.co/dinarpay">Careers</a></nav>
<footer>Contact: <a href="mailto:careers@dinarpay.example">careers@dinarpay.example</a> · <a href="mailto:jane.doe@dinarpay.example">Jane</a> · info@other.example</footer>
</body></html>`

export const HOME_WITH_CAREERS_LINK = `<!doctype html><html><head><title>KW Devhouse</title></head><body>
<a href="/en/join-us">Join us</a><p>Write to jobs@kwdevhouse.example</p></body></html>`

export const CAREERS_PAGE = `<!doctype html><html><head><title>Careers at KW Devhouse</title></head><body>
<h1>Careers</h1><p>We are always looking for engineers. Send your CV to careers@kwdevhouse.example.</p></body></html>`

export interface FakeRoute {
  match: (u: URL) => boolean
  status?: number
  body: unknown
  type?: string
}

/** A transport answering from routes; records every URL. Unmatched → 404. */
export function fakeFetch(routes: readonly FakeRoute[]): typeof fetch & { calls: string[] } {
  const calls: string[] = []
  const impl = async (input: string | URL | Request): Promise<Response> => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    calls.push(href)
    const u = new URL(href)
    const r = routes.find((x) => x.match(u))
    if (!r) return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } })
    const text = typeof r.body === 'string' ? r.body : JSON.stringify(r.body)
    const type = r.type ?? (typeof r.body === 'string' ? 'text/html; charset=utf-8' : 'application/json')
    return new Response(text, { status: r.status ?? 200, headers: { 'content-type': type } })
  }
  return Object.assign(impl as typeof fetch, { calls })
}

export const ROBOTS_ALLOW_ALL = 'User-agent: *\nDisallow:\n'
export const ROBOTS_DISALLOW_ALL = 'User-agent: *\nDisallow: /\n'
