/**
 * Discovery source kinds offered in Settings › Sources, and the one config
 * field each needs. Client-safe (no imports) — shared by the add/edit
 * dialogs and the server actions that validate them.
 */
export interface SourceKindMeta {
  id: string
  label: string
  description: string
  needs: 'company' | 'url' | 'none'
  placeholder?: string
  /**
   * Credit the provider's terms require wherever its jobs are listed (the
   * source name carries it into Discovery; Settings shows the link).
   */
  attribution?: { label: string; url: string }
  /**
   * Needs structured config (host, site number …) the add dialog can't
   * collect: offered through the starter catalog only, not in "Add source".
   */
  catalogOnly?: boolean
}

export const SOURCE_KINDS: readonly SourceKindMeta[] = [
  { id: 'greenhouse', label: 'Greenhouse', description: 'Company board on greenhouse.io', needs: 'company', placeholder: 'stripe' },
  { id: 'lever', label: 'Lever', description: 'Company board on lever.co', needs: 'company', placeholder: 'netflix' },
  { id: 'ashby', label: 'Ashby', description: 'Company board on ashbyhq.com', needs: 'company', placeholder: 'ramp' },
  { id: 'workable', label: 'Workable', description: 'Company board on workable.com', needs: 'company', placeholder: 'company-slug' },
  { id: 'recruitee', label: 'Recruitee', description: 'Company board on recruitee.com', needs: 'company', placeholder: 'company-slug' },
  { id: 'pinpoint', label: 'Pinpoint', description: 'Company board on pinpointhq.com', needs: 'company', placeholder: 'company-slug' },
  {
    id: 'email_alert',
    label: 'Job alerts by email',
    description: 'Indeed, LinkedIn, Naukri, NaukriGulf, Bayt, GulfTalent and Glassdoor alerts in your Gmail',
    needs: 'none',
  },
  {
    id: 'google_alerts',
    label: 'Google Alerts',
    description: 'Your Google Alerts for job searches, by email (Gmail) or RSS',
    needs: 'none',
    // Set up from the Google Alerts panel (optional RSS feed URL).
    catalogOnly: true,
  },
  {
    id: 'himalayas',
    label: 'Himalayas',
    description: 'Remote jobs open to your countries (GCC, India) and worldwide',
    needs: 'none',
    attribution: { label: 'Jobs from Himalayas', url: 'https://himalayas.app/jobs' },
  },
  {
    id: 'jobicy',
    label: 'Jobicy',
    description: 'Remote engineering jobs (anywhere, EMEA, APAC, UAE)',
    needs: 'none',
    attribution: { label: 'Jobs from Jobicy', url: 'https://jobicy.com' },
  },
  {
    id: 'weworkremotely',
    label: 'We Work Remotely',
    description: 'Back-end and full-stack remote jobs (RSS)',
    needs: 'none',
    attribution: { label: 'Jobs from We Work Remotely', url: 'https://weworkremotely.com' },
  },
  {
    id: 'remotive',
    label: 'Remotive',
    description: 'Remote software-dev jobs (small free feed, 24 h delay)',
    needs: 'none',
    attribution: { label: 'Jobs from Remotive', url: 'https://remotive.com' },
  },
  {
    id: 'workingnomads',
    label: 'Working Nomads',
    description: 'Remote development jobs (public feed)',
    needs: 'none',
    attribution: { label: 'Jobs from Working Nomads', url: 'https://www.workingnomads.com' },
  },
  {
    id: 'adzuna',
    label: 'Jobs by Adzuna',
    description: 'Job search for India (needs a free Adzuna key in Settings › AI)',
    needs: 'none',
    attribution: { label: 'Jobs by Adzuna', url: 'https://www.adzuna.in' },
  },
  {
    id: 'remoteok',
    label: 'RemoteOK',
    description: 'All remote-friendly jobs on remoteok.com',
    needs: 'none',
    attribution: { label: 'Jobs from Remote OK', url: 'https://remoteok.com' },
  },
  { id: 'hn_whoishiring', label: "HN Who's Hiring", description: 'Monthly HN "Who is hiring?" thread', needs: 'none' },
  { id: 'yc_directory', label: 'YC Directory', description: 'Y Combinator company directory', needs: 'none' },
  { id: 'technopark', label: 'Technopark', description: 'Company jobs at Technopark, Trivandrum', needs: 'none' },
  { id: 'infopark', label: 'Infopark', description: 'Company jobs at Infopark, Kochi', needs: 'none' },
  { id: 'cyberpark', label: 'Kerala Cyberpark', description: 'Company jobs at Cyberpark, Kozhikode', needs: 'none' },
  { id: 'ul_cyberpark', label: 'UL Cyberpark', description: 'Company jobs at UL Cyberpark, Kozhikode', needs: 'none' },
  { id: 'ksum', label: 'Kerala Startup Mission', description: "KSUM's own openings and internships", needs: 'none' },
  {
    id: 'workday',
    label: 'Workday',
    description: 'Employer careers site on myworkdayjobs.com (read for your target countries)',
    needs: 'url',
    placeholder: 'https://company.wd3.myworkdayjobs.com/External',
  },
  {
    id: 'oracle_orc',
    label: 'Oracle Recruiting Cloud',
    description: 'Employer careers site on Oracle Cloud (host + site number)',
    needs: 'none',
    catalogOnly: true,
  },
  {
    id: 'successfactors',
    label: 'SAP SuccessFactors',
    description: "Employer careers site on SuccessFactors (its job feed)",
    needs: 'none',
    catalogOnly: true,
  },
  {
    id: 'phenom',
    label: 'Phenom',
    description: 'Employer careers site on Phenom (host + page id)',
    needs: 'none',
    catalogOnly: true,
  },
  {
    id: 'watch',
    label: 'Watch (check yourself)',
    description: 'A careers page lee links to but never fetches (its terms forbid automated access)',
    needs: 'url',
    placeholder: 'https://careers.example.com/jobs',
  },
  { id: 'rss', label: 'RSS feed', description: 'Any jobs RSS feed URL', needs: 'url', placeholder: 'https://example.com/jobs.rss' },
  { id: 'jsonld', label: 'JSON-LD JobPosting', description: 'A page with JSON-LD JobPosting markup', needs: 'url', placeholder: 'https://example.com/careers' },
]

const BY_ID = new Map(SOURCE_KINDS.map((k) => [k.id, k] as const))

export function getSourceKind(id: string): SourceKindMeta | undefined {
  return BY_ID.get(id)
}

/** Which config field a kind needs; unknown kinds (legacy rows) need none. */
export function sourceKindNeeds(kind: string): SourceKindMeta['needs'] {
  return BY_ID.get(kind)?.needs ?? 'none'
}

/** Board slugs as the ATS hosts accept them in their public API paths. */
export const BOARD_SLUG_RE = /^[A-Za-z0-9._-]{1,200}$/
