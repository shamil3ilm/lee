/**
 * Company directories lee never fetches (audited 2026-10-09; see
 * docs/job-sources.md): links in Discovery › Companies › "Browse
 * directories", grouped by region. Client-safe data.
 */

export interface BrowseDirectory {
  id: string
  name: string
  url: string
  /** Region-taxonomy node it belongs under. */
  region: string
  /** Why lee does not read it (shown as a hint). */
  why: string
}

export const BROWSE_GROUPS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'ae', label: 'UAE' },
  { id: 'kw', label: 'Kuwait' },
  { id: 'sa', label: 'Saudi Arabia' },
  { id: 'qa', label: 'Qatar' },
  { id: 'bh', label: 'Bahrain' },
  { id: 'om', label: 'Oman' },
  { id: 'kerala', label: 'Kerala (parks and KSUM)' },
  { id: 'in', label: 'India' },
  { id: 'events', label: 'Events, exhibitors and tenders' },
]

export const BROWSE_DIRECTORIES: readonly BrowseDirectory[] = [
  { id: 'hub71', name: 'Hub71 startups (Abu Dhabi)', url: 'https://www.hub71.com/startups', region: 'ae', why: 'Its terms forbid robots and scrapers.' },
  { id: 'in5', name: 'in5 startups (Dubai)', url: 'https://infive.ae/startups/', region: 'ae', why: 'TECOM terms: personal, non-commercial use only.' },
  { id: 'dic', name: 'Dubai Internet City directory', url: 'https://www.dic.ae/the-community/community-directory', region: 'ae', why: 'TECOM terms: personal, non-commercial use only.' },
  { id: 'dtec', name: 'Dubai Silicon Oasis · DTEC members', url: 'https://dtec.ae/coworking/meet-our-members/', region: 'ae', why: 'DSO terms forbid robots and spiders.' },
  { id: 'difc', name: 'DIFC public register and Innovation Hub', url: 'https://www.difc.com/business/public-register', region: 'ae', why: 'Behind a bot wall (Vercel checkpoint).' },
  { id: 'adgm', name: 'ADGM public registers (Abu Dhabi)', url: 'https://www.adgm.com/public-registers', region: 'ae', why: 'Behind a bot wall (Cloudflare).' },
  { id: 'dubai-chamber', name: 'Dubai Chambers commercial directory', url: 'https://www.dubaichambers.com/', region: 'ae', why: 'Its terms forbid copying site material; the directory is a sign-in app.' },
  { id: 'dmcc', name: 'DMCC business directory', url: 'https://dmcc.ae/business-directory', region: 'ae', why: 'The directory itself forbids copying or storing it.' },
  { id: 'rakez', name: 'RAKEZ (Ras Al Khaimah Economic Zone)', url: 'https://rakez.com/', region: 'ae', why: 'No public company registry.' },
  { id: 'kcci', name: 'Kuwait Chamber of Commerce & Industry', url: 'https://www.kuwaitchamber.org.kw/', region: 'kw', why: 'Behind a bot wall (Sucuri).' },
  { id: 'cbk-hub', name: 'Central Bank of Kuwait · Innovation Hub participants', url: 'https://www.cbk.gov.kw/en/legislation-and-regulation/innovation-hub/participants', region: 'kw', why: 'Terms: personal use only.' },
  { id: 'nfsmed', name: 'Kuwait National Fund for SME Development', url: 'https://nationalfund.gov.kw/', region: 'kw', why: 'Behind a bot wall (Sucuri).' },
  { id: 'misk', name: 'Misk Hub entrepreneurship (Riyadh)', url: 'https://hub.misk.org.sa/programs/entrepreneurship/', region: 'sa', why: 'No public startup list.' },
  { id: 'monshaat', name: "Monsha'at (Saudi SME authority)", url: 'https://www.monshaat.gov.sa/', region: 'sa', why: 'Did not answer automated clients.' },
  { id: 'flat6labs', name: 'Flat6Labs portfolio (Riyadh, Abu Dhabi, Cairo…)', url: 'https://flat6labs.com/Company/', region: 'sa', why: 'lee also reads it weekly (portfolio pages; robots allow, no terms).' },
  { id: 'qstp', name: 'Qatar Science & Technology Park directory', url: 'https://qstp.qa/directory/', region: 'qa', why: 'lee also reads it weekly (its public API).' },
  { id: 'qdb', name: 'Qatar Development Bank startups', url: 'https://www.qdb.qa/', region: 'qa', why: 'Behind a bot wall (Akamai).' },
  { id: 'startup-bahrain', name: 'StartUp Bahrain ecosystem', url: 'https://startupbahrain.com/ecosystem', region: 'bh', why: 'lee also reads it weekly (one public page; robots allow, no terms).' },
  { id: 'bfb', name: 'Bahrain FinTech Bay partners', url: 'https://www.bahrainfintechbay.com/fintech-partners', region: 'bh', why: 'Terms not readable without JavaScript.' },
  { id: 'riyada', name: 'Oman SME Authority (Riyada) maps', url: 'https://www.sme.gov.om/riyada-maps/', region: 'om', why: 'No company directory.' },
  { id: 'technopark', name: 'Technopark companies (Trivandrum)', url: 'https://technopark.in/company-list', region: 'kerala', why: 'lee also reads it weekly (its own JSON).' },
  { id: 'infopark', name: 'Infopark companies (Kochi)', url: 'https://infopark.in/companies', region: 'kerala', why: 'lee also reads it weekly (the full list; robots allow, no terms).' },
  { id: 'cyberpark', name: 'Kerala Cyberpark companies (Kozhikode)', url: 'https://cyberparks.in/companies-at-park/', region: 'kerala', why: 'lee also reads it weekly (robots allow, no terms).' },
  { id: 'ul-cyberpark', name: 'UL Cyberpark companies (Kozhikode)', url: 'https://ulcyberpark.com/companies', region: 'kerala', why: 'lee also reads it weekly (no robots rules; its terms have no clause on automated access).' },
  { id: 'gtech', name: 'GTECH members (Kerala IT companies)', url: 'https://gtechindia.org/members', region: 'kerala', why: 'Its terms forbid reproducing site material without written permission.' },
  { id: 'ksum', name: 'Kerala Startup Mission startups', url: 'https://startupmission.kerala.gov.in/#startups', region: 'kerala', why: 'No startup directory API (a short showcase only).' },
  { id: 'nasscom', name: 'NASSCOM members', url: 'https://nasscom.in/members-listing', region: 'in', why: 'lee also reads it (members in your target cities, a few pages a week).' },
  { id: 'startup-india', name: 'Startup India search', url: 'https://www.startupindia.gov.in/content/sih/en/search.html', region: 'in', why: 'Its API host disallows all robots.' },
  { id: 'yc', name: 'Y Combinator companies', url: 'https://www.ycombinator.com/companies', region: 'in', why: 'lee reads the open yc-oss copy, never ycombinator.com.' },
  // Official registers (audited 2026-10-09; docs/job-sources.md "Company sources for low-visibility companies")
  { id: 'qfc', name: 'QFC public register (Doha)', url: 'https://www.qfc.qa/en/public-register', region: 'qa', why: 'A search form (ASP.NET postbacks), not a list lee can page politely.' },
  { id: 'srtip', name: 'Sharjah Research Technology and Innovation Park', url: 'https://srtip.ae/', region: 'ae', why: 'Robots allow, but there is no public company directory.' },
  { id: 'misa', name: 'Saudi Ministry of Investment (MISA)', url: 'https://misa.gov.sa/', region: 'sa', why: 'No public licensee list; robots ask for 30 s between requests.' },
  { id: 'moci', name: 'Kuwait Ministry of Commerce and Industry', url: 'https://www.moci.gov.kw/', region: 'kw', why: 'Company lookups are e-services, not a public list.' },
  { id: 'kdipa', name: 'Kuwait Direct Investment Promotion Authority (KDIPA)', url: 'https://kdipa.gov.kw/', region: 'kw', why: 'Licensed investors are announced in news posts, not a list.' },
  { id: 'sijilat', name: 'Sijilat commercial registry (Bahrain)', url: 'https://www.sijilat.bh/', region: 'bh', why: 'A per-company search app; no bulk list.' },
  { id: 'invest-easy', name: 'Invest Easy (Oman business registry)', url: 'https://www.investeasy.gov.om/', region: 'om', why: 'Did not answer automated clients (checked 2026-10-09).' },
  { id: 'mca-ogd', name: 'India company master data (data.gov.in)', url: 'https://www.data.gov.in/', region: 'in', why: 'lee reads it weekly only with your free data.gov.in key (Settings › AI).' },
  // Events, exhibitors and public tenders
  { id: 'gitex', name: 'GITEX Global exhibitors (Dubai)', url: 'https://www.gitex.com/', region: 'events', why: 'Exhibitor lists change every edition and sit in an event app.' },
  { id: 'leap', name: 'LEAP exhibitors (Riyadh)', url: 'https://onegiantleap.com/', region: 'events', why: 'The exhibitor pages are behind a bot wall (Cloudflare).' },
  { id: 'web-summit-qatar', name: 'Web Summit Qatar startups and partners', url: 'https://qatar.websummit.com/', region: 'events', why: 'Its API path is disallowed in robots.txt.' },
  { id: 'huddle-global', name: 'Huddle Global (Kerala Startup Mission)', url: 'https://huddleglobal.co.in/', region: 'events', why: 'No exhibitor list on the site.' },
  { id: 'etimad', name: 'Etimad public tenders (Saudi Arabia)', url: 'https://www.etimad.sa/', region: 'events', why: 'Tender awards sit behind a sign-in portal.' },
]
