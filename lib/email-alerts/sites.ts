/**
 * Job-alert email senders lee knows how to read. Client-safe (no imports):
 * Settings › Sources renders the setup steps from the same list the Gmail
 * reader uses to recognise senders, so the two can't drift.
 *
 * Why email: Indeed, LinkedIn, Naukri, NaukriGulf, Bayt, GulfTalent and
 * Glassdoor offer no free public job-search API and their terms forbid
 * scraping. Their own job-alert emails, which the user subscribes to and
 * which lee reads with the Gmail read-only scope it already has, are the
 * compliant route.
 */

export const ALERT_SITE_IDS = [
  'linkedin',
  'indeed',
  'naukri',
  'naukrigulf',
  'bayt',
  'gulftalent',
  'glassdoor',
] as const

export type AlertSiteId = (typeof ALERT_SITE_IDS)[number]

export interface AlertSite {
  id: AlertSiteId
  label: string
  /**
   * Registrable domains the alerts are sent from. A sender matches when its
   * address domain equals one of these or is a subdomain of one
   * (e.g. `match.indeed.com`). Also used for the DKIM/DMARC check.
   */
  senderDomains: readonly string[]
  /** Hosts whose links in an alert may point at one of this site's jobs. */
  jobHosts: readonly string[]
  /** Where to create an alert. */
  alertsUrl: string
  /** Step-by-step setup, shown in Settings › Sources. */
  steps: readonly string[]
}

const COMMON_TIP =
  'Use the same Google account you signed in to lee with, so the alerts land in the inbox lee reads.'

export const ALERT_SITES: readonly AlertSite[] = [
  {
    id: 'linkedin',
    label: 'LinkedIn',
    senderDomains: ['linkedin.com'],
    jobHosts: ['linkedin.com'],
    alertsUrl: 'https://www.linkedin.com/jobs/',
    steps: [
      'Open linkedin.com/jobs and search "Backend Developer" (then again for "Full Stack Developer").',
      'Set Location to "Kuwait" (repeat for "United Arab Emirates", Saudi Arabia, Qatar, Bahrain, Oman, India, or pick "Remote" under On-site/Remote). Settings › Sources › Coverage has a ready search link per region.',
      'Under Experience level tick "Entry level" and "Associate" (junior / mid).',
      'Switch on "Set alert" at the top of the results; choose Daily and Email in Job alert settings.',
      COMMON_TIP,
    ],
  },
  {
    id: 'indeed',
    label: 'Indeed',
    // Indeed documents these three sending domains (help article 211829163).
    senderDomains: ['indeed.com', 'indeedemail.com', 'indeedmail.com'],
    jobHosts: ['indeed.com'],
    alertsUrl: 'https://ae.indeed.com/',
    steps: [
      'Open kw.indeed.com (Kuwait), ae.indeed.com (UAE) or in.indeed.com (India); the other GCC countries have their own sites (sa., qa., bh., om.indeed.com).',
      'Search "backend developer" or "full stack developer" with the city or country as location.',
      'Filter Experience level to Entry level / Mid level where offered.',
      'Click "Get new jobs for this search by email" (or the bell icon) and confirm your email address.',
      COMMON_TIP,
    ],
  },
  {
    id: 'naukri',
    label: 'Naukri',
    senderDomains: ['naukri.com'],
    jobHosts: ['naukri.com'],
    alertsUrl: 'https://www.naukri.com/',
    steps: [
      'Sign in to naukri.com and search "Backend Developer" or "Full Stack Developer".',
      'Set Experience to 0–5 years and Location to your cities (e.g. Bengaluru, Kochi, Remote).',
      'Click "Create Job Alert" (or "Save this search as alert"), name it and choose daily email.',
      'Keep "Recommended jobs" mails on too: lee reads them the same way.',
      COMMON_TIP,
    ],
  },
  {
    id: 'naukrigulf',
    label: 'NaukriGulf',
    senderDomains: ['naukrigulf.com'],
    jobHosts: ['naukrigulf.com'],
    alertsUrl: 'https://www.naukrigulf.com/',
    steps: [
      'Sign in to naukrigulf.com and search "Backend Developer" or "Full Stack Developer".',
      'Pick Location Kuwait (repeat for UAE, Saudi Arabia, Qatar, Bahrain, Oman) and Experience 0–5 years.',
      'Click "Create Job Alert" on the results page and choose daily email.',
      COMMON_TIP,
    ],
  },
  {
    id: 'bayt',
    label: 'Bayt',
    senderDomains: ['bayt.com'],
    jobHosts: ['bayt.com'],
    alertsUrl: 'https://www.bayt.com/en/uae/jobs/',
    steps: [
      'Sign in to bayt.com and search "Backend Developer" or "Full Stack Developer".',
      'Choose the country (Kuwait, UAE, Saudi Arabia, Qatar, Bahrain, Oman) and Career level "Mid career" or "Entry level".',
      'Click "Create job alert" (bell) on the results page and choose daily.',
      COMMON_TIP,
    ],
  },
  {
    id: 'gulftalent',
    label: 'GulfTalent',
    senderDomains: ['gulftalent.com'],
    jobHosts: ['gulftalent.com'],
    alertsUrl: 'https://www.gulftalent.com/',
    steps: [
      'Sign in to gulftalent.com and search "Software Developer" / "Backend" in the country you want.',
      'On the results page choose "Email me jobs like these" (job alert) and pick daily.',
      COMMON_TIP,
    ],
  },
  {
    id: 'glassdoor',
    label: 'Glassdoor',
    senderDomains: ['glassdoor.com'],
    jobHosts: ['glassdoor.com', 'glassdoor.co.in'],
    alertsUrl: 'https://www.glassdoor.com/Job/index.htm',
    steps: [
      'Search Jobs on glassdoor.com for "Backend Developer" with location Dubai, Riyadh, Doha, Bengaluru or "Remote".',
      'Turn on "Job alert" for the search and choose daily email.',
      COMMON_TIP,
    ],
  },
]

const BY_ID = new Map(ALERT_SITES.map((s) => [s.id, s] as const))

export function getAlertSite(id: string): AlertSite | undefined {
  return BY_ID.get(id as AlertSiteId)
}

export function isAlertSiteId(v: unknown): v is AlertSiteId {
  return typeof v === 'string' && BY_ID.has(v as AlertSiteId)
}

/** True when `host` is `domain` or one of its subdomains. */
export function hostMatches(host: string, domain: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '')
  const d = domain.toLowerCase()
  return h === d || h.endsWith(`.${d}`)
}

/**
 * Hosts matched by `jobHosts` also cover the sites' country domains, e.g.
 * `linkedin.com` covers `ae.linkedin.com`, `indeed.com` covers
 * `ae.indeed.com`. Country TLD variants (`indeed.co.in`) are listed
 * explicitly where a site uses them.
 */
export function siteForHost(host: string): AlertSite | undefined {
  return ALERT_SITES.find((s) => s.jobHosts.some((d) => hostMatches(host, d)))
}

/** Gmail search query that finds alert mail from every known sender. */
export function alertSendersQuery(days: number): string {
  const domains = [...new Set(ALERT_SITES.flatMap((s) => s.senderDomains))]
  return `from:(${domains.join(' OR ')}) newer_than:${days}d`
}
