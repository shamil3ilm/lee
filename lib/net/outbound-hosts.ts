import { OFFICIAL_FEEDS } from '@/lib/radar/feeds-catalog'

/**
 * The single list of third parties lee sends requests (and so data) to.
 * Client-safe (no I/O). Used by:
 *
 * - the privacy page (app/(public)/privacy/page.tsx), which renders it;
 * - tests/unit/outbound-hosts.test.ts, which fails when code contacts a host
 *   that is not listed here, or the privacy page stops naming one.
 *
 * When you add an outbound call: add (or extend) an entry here, saying what
 * is sent and when, in plain words.
 */

export interface OutboundParty {
  id: string
  /** Who, as a reader would name them. */
  name: string
  /** Host names contacted. `*.example.com` covers every subdomain. */
  hosts: readonly string[]
  /** What leaves lee, and when. */
  sends: string
  group: 'platform' | 'google' | 'ai' | 'documents' | 'jobs' | 'research' | 'lookups'
}

const RADAR_FEED_HOSTS = [...new Set(OFFICIAL_FEEDS.map((f) => new URL(f.url).hostname))].sort()

export const OUTBOUND_PARTIES: readonly OutboundParty[] = [
  // Platform
  {
    id: 'vercel',
    name: 'Vercel (hosting, Web Analytics, Speed Insights)',
    hosts: ['vercel.com', '*.vercel.app'],
    sends: 'Every request to the app; anonymous page-view and performance statistics (no cookies).',
    group: 'platform',
  },
  {
    id: 'neon',
    name: 'Neon (database, usage meter)',
    hosts: ['*.neon.tech', 'console.neon.tech'],
    sends: 'All application data is stored there. The optional usage meter reads project usage with the owner’s Neon key.',
    group: 'platform',
  },
  {
    id: 'jsdelivr',
    name: 'jsDelivr CDN',
    hosts: ['cdn.jsdelivr.net'],
    sends: 'Your browser downloads the Playground code runtimes (Python, PHP, SQL) from it; it sees your IP address, not your code.',
    group: 'platform',
  },
  // Google
  {
    id: 'google',
    name: 'Google (sign-in, Gmail, Calendar, Drive, Picker)',
    hosts: [
      'accounts.google.com',
      'oauth2.googleapis.com',
      'openidconnect.googleapis.com',
      'gmail.googleapis.com',
      'www.googleapis.com',
      'apis.google.com',
    ],
    sends: 'The Google access described above: sign-in, the Gmail, Calendar and Drive calls you enable.',
    group: 'google',
  },
  {
    id: 'google-alerts',
    name: 'Google Alerts feeds',
    hosts: ['www.google.com'],
    sends: 'Fetches the Google Alerts RSS feed URL you add as a job source.',
    group: 'jobs',
  },
  {
    id: 'google-places',
    name: 'Google Places',
    hosts: ['places.googleapis.com'],
    sends: 'Company names, only if you turn on Google ratings in Settings › Integrations (with your own key).',
    group: 'lookups',
  },
  // AI
  {
    id: 'gemini',
    name: 'Google Gemini',
    hosts: ['generativelanguage.googleapis.com'],
    sends: 'The text of an AI request (CV, profile, job description) when Gemini is your chosen provider.',
    group: 'ai',
  },
  {
    id: 'groq',
    name: 'Groq',
    hosts: ['api.groq.com'],
    sends: 'The text of an AI request when Groq is your provider; the audio of a voice note you dictate (transcription).',
    group: 'ai',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    hosts: ['openrouter.ai'],
    sends: 'Model Playground prompts, when you pick an OpenRouter model.',
    group: 'ai',
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    hosts: ['api.cerebras.ai'],
    sends: 'Model Playground prompts, when you pick a Cerebras model.',
    group: 'ai',
  },
  {
    id: 'huggingface',
    name: 'Hugging Face (inference router, Hub, Laya Space)',
    hosts: ['router.huggingface.co', 'huggingface.co', '*.hf.space'],
    sends:
      'Model Playground prompts (router); public model/paper lists and model cards for AI Radar; the decision text and options sent to the Laya decision engine when you use it.',
    group: 'ai',
  },
  // Documents
  {
    id: 'latex',
    name: 'LaTeX compile services (latexonline.cc, latex.ytotech.com)',
    hosts: ['latexonline.cc', 'latex.ytotech.com'],
    sends: 'The LaTeX source and images of a document you compile to PDF.',
    group: 'documents',
  },
  {
    id: 'firecrawl',
    name: 'Firecrawl',
    hosts: ['api.firecrawl.dev'],
    sends: 'The URL of a job page you import, so Firecrawl can render it (only with a Firecrawl key).',
    group: 'documents',
  },
  {
    id: 'github',
    name: 'GitHub',
    hosts: ['api.github.com', 'raw.githubusercontent.com'],
    sends:
      'Your GitHub username (to list your public repos); reads your portfolio’s profile.json from your own repository (lee syncs your public profile from it) and writes the variant pages you publish there; AI Radar repository searches and READMEs; organisation searches by city for company discovery, and the public repos and weekly commit counts of company organisations (company growth).',
    group: 'documents',
  },
  {
    id: 'portfolio-site',
    name: 'Your portfolio site',
    hosts: [],
    sends:
      'Only when no portfolio repository is set: a plain request for /profile.json on the canonical address in your portfolio settings, to sync your public profile. Nothing about you is sent; private-network addresses are refused.',
    group: 'documents',
  },
  // Job sources
  {
    id: 'job-boards',
    name: 'Job boards and ATS public APIs',
    hosts: [
      'boards-api.greenhouse.io',
      'api.lever.co',
      'api.ashbyhq.com',
      'www.workable.com',
      'apply.workable.com',
      '*.pinpointhq.com',
      '*.recruitee.com',
      '*.myworkdayjobs.com',
      '*.myworkdaysite.com',
      '*.oraclecloud.com',
      '*.teamtailor.com',
      'lde.tbe.taleo.net',
      'himalayas.app',
      'jobicy.com',
      'remotive.com',
      'remoteok.com',
      'www.workingnomads.com',
      'weworkremotely.com',
      'www.ycombinator.com',
      'technopark.in',
      'infopark.in',
      'cyberparks.in',
      'www.ulcyberpark.com',
      'startupmission.kerala.gov.in',
    ],
    sends: 'Requests for public job listings: the company board names and search keywords of the sources you follow. No personal data.',
    group: 'jobs',
  },
  {
    id: 'adzuna',
    name: 'Adzuna',
    hosts: ['api.adzuna.com'],
    sends: 'Your search keywords and country, with your own Adzuna key.',
    group: 'jobs',
  },
  {
    id: 'hacker-news',
    name: 'Hacker News (Algolia search, Firebase API)',
    hosts: ['hn.algolia.com', 'hacker-news.firebaseio.com'],
    sends: 'Search terms: the monthly “Who is hiring” thread, company names (reputation and the company growth score) and AI Radar topics.',
    group: 'jobs',
  },
  {
    id: 'your-sources',
    name: 'Sites you add yourself',
    hosts: [],
    sends:
      'Pages and feeds at URLs you enter (RSS feeds, careers pages, Workday/SuccessFactors/Phenom sites, URLs you import). Fetched by lee’s server; private-network addresses are refused.',
    group: 'jobs',
  },
  {
    id: 'company-directories',
    name: 'Company discovery sources (Wikidata Query Service, yc-oss, IT-park, accelerator and member lists)',
    hosts: ['query.wikidata.org', 'yc-oss.github.io', 'qstp.qa', 'flat6labs.com', 'startupbahrain.com', 'nasscom.in'],
    sends:
      'Weekly: your target regions as place ids (Wikidata), company ids for dated employee counts, and plain requests for public company lists (Technopark, Infopark, Cyberparks, QSTP, Flat6Labs, StartUp Bahrain, NASSCOM). GitHub org searches send city names (see GitHub). No personal data.',
    group: 'jobs',
  },
  {
    id: 'company-logos',
    name: 'Company logos (Wikimedia Commons, GitHub avatars)',
    hosts: ['commons.wikimedia.org', 'avatars.githubusercontent.com'],
    sends: 'Your browser loads small company logos in Discovery › Companies from these hosts (they see your IP address; no referrer is sent).',
    group: 'jobs',
  },
  {
    id: 'company-sites',
    name: 'Company websites (careers-page check)',
    hosts: [],
    sends:
      'The robots.txt, home page and careers page of companies in Discovery › Companies, only where robots.txt allows lee, and the home page of a website guess for a name you search; nothing about you.',
    group: 'jobs',
  },
  // Research and lookups
  {
    id: 'arxiv',
    name: 'arXiv',
    hosts: ['export.arxiv.org', 'arxiv.org'],
    sends: 'AI Radar paper queries and abstract pages. No personal data.',
    group: 'research',
  },
  {
    id: 'gdelt',
    name: 'GDELT',
    hosts: ['api.gdeltproject.org'],
    sends: 'Company names (news for the reputation panel and the company growth score) and AI Radar topics.',
    group: 'research',
  },
  {
    id: 'wikidata',
    name: 'Wikidata',
    hosts: ['www.wikidata.org'],
    sends: 'Company names (basic company facts for the reputation panel, and the names you type in Discovery › Companies › Find a company).',
    group: 'research',
  },
  {
    id: 'endoflife',
    name: 'endoflife.date',
    hosts: ['endoflife.date'],
    sends: 'Release-cycle lookups for the technologies you follow in AI Radar. No personal data.',
    group: 'research',
  },
  {
    id: 'radar-feeds',
    name: 'Official AI lab blogs (AI Radar feeds)',
    hosts: RADAR_FEED_HOSTS,
    sends: 'Plain feed and page requests. No personal data.',
    group: 'research',
  },
  {
    id: 'frankfurter',
    name: 'Frankfurter (ECB exchange rates)',
    hosts: ['api.frankfurter.dev'],
    sends: 'A request for the day’s exchange rates. No personal data.',
    group: 'lookups',
  },
  {
    id: 'scam-shield',
    name: 'Scam Shield lookups (rdap.org and domain registries, Cloudflare DNS)',
    hosts: ['rdap.org', 'cloudflare-dns.com'],
    sends: 'The domain of a recruiter or job posting being checked (domain age and mail records). rdap.org may forward to the domain’s registry.',
    group: 'lookups',
  },
]

/** Every listed host, deduplicated. */
export const OUTBOUND_HOSTS: readonly string[] = [...new Set(OUTBOUND_PARTIES.flatMap((p) => p.hosts))]

/** True when `host` is listed (exactly, or under a `*.` wildcard entry). */
export function isListedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '')
  return OUTBOUND_HOSTS.some((entry) =>
    entry.startsWith('*.') ? h === entry.slice(2) || h.endsWith(entry.slice(1)) : h === entry,
  )
}
