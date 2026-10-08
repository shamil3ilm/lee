# Job sources: what lee reads, and how

Checked 2026-09-27. lee is a single-user tracker: it polls each source about
once a day, shows postings privately and always links back to the original
posting. It never logs in to a job site, never bypasses anti-bot measures,
and sends an honest User-Agent (`lee/1.5 (personal job tracker; polls each
source about once a day)`).

Three routes, in order of preference:

1. **Public API / feed** the site offers for this use → a polled source.
2. **Job-alert emails** the user subscribes to on the site → the
   `email_alert` source reads them from Gmail (read-only, Google-verified
   senders only, bodies never stored).
3. **Manual / watch link** → a `watch` source: a link in Settings › Sources
   › "Check these yourself", never fetched.

"(unverified)" marks a point taken from a search excerpt because the page
itself blocked a plain client.

## Job boards and aggregators

| Portal | Region | Access method | Allowed? | What lee does |
|---|---|---|---|---|
| LinkedIn | Global/GCC | Job Posting API is partner-only (publishing, not search) | No — robots `User-agent: * Disallow: /`; User Agreement §8.2 bans scraping | Email alerts (`jobalerts-noreply@linkedin.com`) |
| Indeed | Global/GCC/India | Publisher Job Search API deprecated; RSS disallowed | No — robots disallows `/*?rss`, `/jobs/AE/`, `/jobs/IN/`, `/viewjob`, `/rc/`; ToS bans bots | Email alerts (`alert@indeed.com`) |
| Glassdoor | Global | Jobs API retired | No — robots disallows `/job-listing/*`; ToS bans robots/scrapers | Email alerts |
| Naukri | India | None | No — ToS bans spiders/crawlers (Akamai blocks plain clients) | Email alerts (`naukrialerts@naukri.com`) |
| NaukriGulf | GCC | None | No — Info Edge terms (unverified); robots unreachable | Email alerts |
| Bayt | GCC | None | No — robots disallows `/en/jobs/?`, `/en/jobs/*-jobs/`; ToS bans spiders/robots | Email alerts |
| GulfTalent | GCC | None | No — ToS bans scripts/robots scraping (robots allows search engines) | Email alerts |
| Dubizzle Jobs | UAE | None (`/api/` disallowed) | No — Incapsula; ToS bans scraping (unverified) | Watch link |
| Laimoon | GCC | None | Unknown — robots returned 503; no ToS found | Watch link |
| Wuzzuf | Egypt/GCC | None | Unknown — Cloudflare challenge | Watch link (alerts exist, unverified) |
| Akhtaboot | Jordan/GCC | None | No — robots `User-agent: * Disallow: /` | Watch link |
| Tanqeeb | GCC | None | No — robots disallows search params (`/*?keywords`, `/*?job_id`) | Watch link (email alerts exist) |
| Dr.Job (drjobpro.com) | GCC | Sitemap only | No — ToS 5.3.5 bans robots/crawlers without permission | Watch link |
| Nafis (UAE), Jadarat/Taqat (KSA) | GCC | Login portals | n/a — for Emirati / Saudi nationals only | Not added |
| Tasheel | UAE | Not a job board | n/a | Not added |
| Instahyre | India | None | No — ToS bans crawling/spidering | Watch link (it emails matches) |
| Cutshort | India | API for paying employers only | No — robots disallows `/view/j/`; ToS bans automated access | Watch link |
| Wellfound | India/Global | None | No — robots disallows `/_jobs/`; ToS bans scraping | Watch link |
| Hirist, iimjobs | India | None | No — Hirist ToS bans crawling (iimjobs same group, unverified) | Watch link |
| Foundit (Monster India) | India | None | Unknown — Akamai 403 | Watch link |
| Internshala | India | None (`/api/` disallowed) | No — robots disallows `/job/search/`, `/job/details/`; ToS bans bots | Watch link |
| KKEM / DWMS (Kerala Knowledge Economy Mission) | Kerala | Login portal + app | No public listing | Watch link |
| Himalayas | Remote (country filters incl. GCC/India) | Free JSON API | Yes — link back + name Himalayas; don't feed other boards | `himalayas` source (on by default) |
| Jobicy | Remote | Free JSON API | Yes — credit Jobicy, apply via its URL, ≤ 1 call/hour | `jobicy` source (off by default) |
| We Work Remotely | Remote | Category RSS | Yes — "attribute the links back" | `weworkremotely` source (off) |
| Remotive | Remote | Free JSON API | Yes — link back + name Remotive, ≤ 4/day, no redistribution; 24 h delay | `remotive` source (off) |
| Working Nomads | Remote | `/api/exposed_jobs/` (linked from homepage) | Yes — robots allows all; no scraping clause; no licence text, so link back only | `workingnomads` source (off) |
| RemoteOK | Remote | Free JSON API | Yes — link back + name Remote OK | `remoteok` source (v1), postings tagged for the relevance gate |
| Adzuna | India (no GCC country) | Free API key | Yes — "Jobs by Adzuna" credit; 250 calls/day | `adzuna` source (off; needs a key) |
| Arbeitnow | Germany/EU | Free JSON API | Yes — "please link back" | Not added: no GCC/India jobs; its `remote` filter didn't filter |
| Jooble | Global incl. GCC | Key on request | Allowed, but 500 requests per key **lifetime**, one key per country | Not added: unusable for daily polling |
| Careerjet | Global incl. GCC/India | Publisher key | Requires the end user's IP / User-Agent per call | Not added: a server-side daily poll doesn't fit its terms |
| The Muse | Mostly US | Free API | Allowed | Not added: no GCC coverage |

Sources: robots.txt of each host, fetched 2026-09-27; terms pages:
[LinkedIn](https://www.linkedin.com/legal/user-agreement),
[Indeed](https://www.indeed.com/legal),
[Glassdoor](https://www.glassdoor.com/about/terms/),
[Naukri](https://www.naukri.com/termsconditions),
[Bayt](https://www.bayt.com/en/pages/terms/),
[GulfTalent](https://www.gulftalent.com/terms),
[Dr.Job](https://www.drjobpro.com/terms),
[Instahyre](https://www.instahyre.com/terms/),
[Cutshort](https://cutshort.io/terms),
[Wellfound](https://wellfound.com/terms),
[Hirist](https://www.hirist.tech/terms),
[Internshala](https://internshala.com/terms),
[Himalayas API](https://himalayas.app/api),
[Jobicy](https://jobicy.com/jobs-rss-feed),
[WWR feeds](https://weworkremotely.com/remote-job-rss-feed),
[Remotive API](https://github.com/remotive-com/remote-jobs-api),
[Working Nomads terms](https://www.workingnomads.com/terms-and-conditions),
[Adzuna terms](https://developer.adzuna.com/docs/terms_of_service),
[Arbeitnow API](https://www.arbeitnow.com/blog/job-board-api),
[Jooble API](https://help.jooble.org/en/support/solutions/articles/60001448238-rest-api-documentation),
[Careerjet API](https://www.careerjet.com/partners/api).

## Company careers backends (ATS)

Public job-board APIs the employers' own careers pages use. Each default
board in `lib/defaults/catalog.ts` was checked live; the job count is noted
there.

| ATS | Endpoint | Source kind |
|---|---|---|
| Greenhouse | `GET boards-api.greenhouse.io/v1/boards/{slug}/jobs` | `greenhouse` |
| Lever | `GET api.lever.co/v0/postings/{slug}?mode=json` | `lever` |
| Ashby | `GET api.ashbyhq.com/posting-api/job-board/{slug}` | `ashby` |
| Workable | `GET www.workable.com/api/accounts/{slug}` (widget; v3 fallback) | `workable` |
| Recruitee | `GET {slug}.recruitee.com/api/offers/` | `recruitee` |
| Pinpoint | `GET {slug}.pinpointhq.com/postings.json` | `pinpoint` |
| Workday | `POST {tenant}.wd{N}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs` (country facet; robots allow the site paths) | `workday` |
| Oracle Recruiting Cloud | `GET {host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions` (no robots.txt on the hosts) | `oracle_orc` |
| SAP SuccessFactors | `GET {host}/sitemal.xml` (robots disallow `/services/` RSS, not this feed) | `successfactors` |
| Phenom | `POST {host}/widgets` refineSearch (robots disallow `/px-widgets`, not `/widgets`) | `phenom` |
| SmartRecruiters | `api.smartrecruiters.com` robots.txt: `User-agent: * Disallow: /` (LinkedInBot only) | **not used** → watch links |

## Kerala IT parks

All public, no login, robots allow the listing paths, no terms against
automated access (checked 2026-09-27). Read once a day, ≤ 5 pages.

| Park | Endpoint | Live jobs | Source kind |
|---|---|---|---|
| Technopark, Trivandrum | `GET technopark.in/api/paginated-jobs?page=N` (the page's own JSON) | 362 | `technopark` (on) |
| Infopark, Kochi | `GET infopark.in/companies-job?page=N` (HTML table) | ~466 | `infopark` (on) |
| Kerala Cyberpark, Kozhikode | `GET cyberparks.in/jm-ajax/get_listings/` (WP Job Manager) | 29 | `cyberpark` |
| UL Cyberpark, Kozhikode | `GET ulcyberpark.com/jobs[/index/{offset}]` (HTML table) | 26 | `ul_cyberpark` |
| Kerala Startup Mission | `GET startupmission.kerala.gov.in/api/public/career?page=N` (KSUM's own openings) | 15 | `ksum` |
| SmartCity Kochi | news-style posts, last one Jul 2026 | 0 recent | watch |
| KINFRA | own notices only | 0 | watch |

## Employers (GCC and MNCs with India / Kerala offices)

Verified live 2026-09-27 through lee's own adapters; counts are jobs in
the GCC + India after the country filter.

| Employer | Backend | Jobs | Route |
|---|---|---|---|
| IBS Software | Oracle ORC | 69 (35 Kochi/Trivandrum) | source, on |
| Emirates NBD · FAB · Mashreq · e& · du · DP World · Dubai Holding | Oracle ORC | 22 · 124 · 245 · 17 · 10 · 129 · 33 | sources, off |
| KPMG India · Oracle | Oracle ORC | 499 · 29 | sources, off |
| ADCB · Al-Futtaim · stc · Deloitte South Asia | SuccessFactors feed | 38 · 204 · 5 · 1928 | sources, off |
| G42 | Phenom | 46 | source, on |
| Majid Al Futtaim · ADNOC · Quest Global | Phenom | 139 · 72 · 200 | sources, off |
| Salesforce · Visa · Adobe · Cisco · Mastercard · PayPal · PwC | Workday | 100 · 100 · 93 · 100 · 8 · 5 · 24 (per poll, newest first) | sources, off |
| Thoughtworks | Greenhouse | 35 | source, off |
| Chalhoub Group | Teamtailor RSS (newest 100) | 100 | `rss` source, off |
| talabat, HungerStation, Etihad, Swiggy, Freshworks | SmartRecruiters | — | watch (robots.txt disallows the API) |
| noon | own site | — | watch (robots.txt `Disallow: /`) |
| Saudi Aramco, TCS, Infosys | — | — | watch (bot wall) |
| Google, Microsoft, Amazon, Atlassian | own sites | — | watch (terms forbid or unconfirmed) |
| EY, Wipro | SuccessFactors | — | watch (feed times out; RSS disallowed) |
| Emirates Group, flydubai | custom sites | — | watch (no generic reader yet) |
| Mubadala, QNB, Ooredoo, UST, Tata Elxsi, Experion | — | — | watch (no feed / login / robots) |
| SAP | moving to SmartRecruiters | — | not added (unresolved) |

## Job-alert emails

See Settings › Sources › "Job alerts by email" for the per-site setup
steps. Parsers live in `lib/email-alerts/`; their test fixtures in
`tests/fixtures/email-alerts/` are **synthetic** (hand-written from the
sites' documented or observable formats), not real emails.

## AI search: Google AI Mode hand-off and "Add from text or link"

Checked 2026-10-08 against Google's own pages (dates are each page's
"Last updated").

### Gemini API "Grounding with Google Search": verified facts

| Point | What Google says | Source |
|---|---|---|
| Tool and API shape | Tool `google_search`. The current docs show it on the Interactions API (`POST /v1beta/interactions`, `"tools": [{"type": "google_search"}]`); `generateContent` takes `"tools": [{"google_search": {}}]` and returns `groundingMetadata` (`webSearchQueries`, `searchEntryPoint.renderedContent`, `groundingChunks[].web.{uri,title}`, `groundingSupports`). Supported on Gemini 3.x Flash / Pro and 2.5 / 2.0 models. | [Grounding with Google Search](https://ai.google.dev/gemini-api/docs/google-search) (2026-09-23) |
| Free tier | **Not available** on the free tier for any Gemini 3.x model ("can be tested in Google AI Studio"); paid tier: 5,000 free search requests a month shared across Gemini 3.x, then $14 / 1,000 search queries (billed per search query the model runs). Only `gemini-2.5-flash` and `gemini-2.5-flash-lite` keep a free grounded quota: "free of charge, up to 500 RPD (limit shared)". | [Pricing](https://ai.google.dev/gemini-api/docs/pricing) (2026-10-07) |
| Structured output with the tool | "Structured outputs with tools … available only to Gemini 3 series models" (preview), i.e. not on the free 2.5 models. | [Structured output](https://ai.google.dev/gemini-api/docs/structured-output) (2026-09-23) |
| Display requirements | Show "the Grounded Results with the associated Search Suggestion(s) to the end user who submitted the prompt"; do not "modify, or intersperse any other content with, the Grounded Results or Search Suggestions"; no interstitials between a Link and its page. | [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms#grounding-with-google-search) (2026-04-28) |
| Use restrictions | No "cache, frame, syndicate, resell, analyze, train on, or otherwise learn from Grounded Results or Search Suggestions"; "it is a violation of these terms to use Grounding with Google Search to extract or collect one or more of these components for another purpose (for example, using programmatic or automated means to collect Links, using Links to build an index, or using Links to identify destination pages for crawling or scraping)". Storage only up to 2 years for display evaluation, the end user's chat history, or a refinement prompt; no click or Link tracking. | same |
| Data use (unpaid tier) | Google uses prompts and responses "to provide, improve, and develop Google products"; "human reviewers may read, annotate, and process your API input and output … Do not submit sensitive, confidential, or personal information to the Unpaid Services." Grounding prompts and output are also stored 30 days for debugging. | same |

**Decision: no automated "AI web search" source.** A daily poll that turns
grounded answers into discoveries — parsing out Links, resolving the
grounding redirects, fetching the destination ATS boards, deduping and
scoring them — is the use the terms name as a violation (collecting Links
by automated means, using them to find pages to fetch, building an index,
analysing Grounded Results). It would also need a paid Gemini 3 key for
structured output, against lee's zero-cost rule. Revisit only if Google
publishes terms that allow it; a compliant alternative would be an
on-demand "ask" view that shows the grounded answer verbatim with its
Search Suggestions to the user who asked, without extracting anything.

### What lee does instead

- **Search with Google AI Mode** (Discovery header, Shortlist empty state):
  prompts built from the search preferences only (role families, regions,
  remote scope, sponsorship, keywords; scrubbed of the profile's name,
  email, phone, employers and schools), editable, opened with a plain link
  `https://www.google.com/search?udm=50&q=…` (`rel="noopener noreferrer"`)
  in a new tab of the user's own browser, or copied (Incognito works).
  Prompt families: GCC (roles open to expatriates), India, other countries,
  remote roles workable from the user's home country (no US-only /
  EU-residency-only roles), relocation or visa sponsorship anywhere, and
  employer-watch batches of 5–8 GCC employers from
  `lib/defaults/watch-employers.ts` (nationals-only employers left out).
  A daily rotation shows four; every prompt comes round within a week.
  lee never contacts Google.
- **Add from text or link** (same places): the user pastes an AI Mode
  answer, any text, or links. URLs are found by regex (Google's
  `/url?q=` wrapper unwrapped offline; other Google links dropped, never
  followed). With an AI key the provider extracts title, employer,
  location, date and link with a JSON schema, and a link is kept only when
  it occurs in the pasted text. Without a key, links only. Nationals-only
  openings are dropped. The user ticks what to import; items become
  discoveries of a switched-off `manual_import` source ("Added by you") and
  go through the relevance gate, Scam Shield and scoring. Links on
  Greenhouse, Lever, Ashby, Workable and Workday are filled in through the
  existing adapters' public endpoints (each board read once per import);
  SmartRecruiters, LinkedIn, Indeed, Naukri, Bayt and every other page stay
  links with the pasted details. Duplicates (same canonical link, or same
  employer and title, from any source) are skipped.

### What still needs a real alert email to confirm

The parsers handle the synthetic layouts in `tests/fixtures/email-alerts/`
and `tests/fixtures/email-alerts/gcc/` (Arabic cards and location lines,
"Experience: / Salary: / Nationality:" lines, Glassdoor "3d" / "30d+"
chips, click-tracker links, plain-text parts). Not yet confirmed against a
real message (forward one, anonymised, when a parser misses jobs):

| Site | Unconfirmed |
|---|---|
| Bayt | the single-job URL shape (`/en/<country>/jobs/<slug>-<id>/`), the click-tracker host, the Arabic alert layout |
| NaukriGulf | the card markup and which labelled lines it uses |
| GulfTalent | the card markup; whether the text part repeats each job |
| Glassdoor | the card markup and the `jl` / `jobListingId` link forms in GCC alerts |
| LinkedIn (Arabic UI), Indeed AE | Arabic location lines (only English layouts were seen in public samples) |
| Employer alerts (Emirates Group, Qatar Airways, Etihad, flydubai, Masdar) | sender domains and formats are unknown, so lee does not read them yet; the watch list links to the sign-up |

## GCC portal audit (2026-10-08)

Every GCC default, run through lee's own adapters against the live
endpoints (default countries GCC + India). "Count" = postings returned;
GCC = located in the GCC by `parseGccLocation`; city = a canonical city
found; text = description over 40 characters; dated = posting date.

| Source | Status | Count (GCC / city) | Text · dated · remote/hybrid | Issues fixed | Checked |
|---|---|---|---|---|---|
| Careem (Greenhouse) | OK | 16 (8 / 8) | 16 · 16 · 0/0 | escaped HTML stored raw → plain text; `first_published` as the date; company name | 2026-10-08 |
| Tamara (Greenhouse) | OK | 31 (21 / 21) | 31 · 31 · 0/0 | as Careem | 2026-10-08 |
| HALA (Greenhouse) | OK | 8 (8 / 8) | 8 · 8 · 0/0 | as Careem | 2026-10-08 |
| Tabby (Pinpoint) | OK | 58 (36 / 36) | 58 · 0 · 13/4 | descriptions were dropped (0 → 58); pay when shown; the feed has no posting date | 2026-10-08 |
| Dubizzle Group (Workable) | OK | 48 (44 / 44) | 48 · 48 · 0/0 | widget read with `details=false`, so no descriptions (0 → 48) | 2026-10-08 |
| Salla · Foodics · Lucidya · Mozn (Workable) | OK | 31 · 27 · 45 · 17 (31 · 23 · 27 · 12 GCC) | all with text and dates; remote 3 · 1 · 24 · 5 | as Dubizzle | 2026-10-08 |
| Ziina · Lean (Ashby) | OK | 15 · 3 (all GCC) | all with text and dates | none needed | 2026-10-08 |
| Unifonic (Recruitee) | OK | 34 (6 / 6) | 34 · 34 · 16/0 | description and requirements were dropped | 2026-10-08 |
| Emirates NBD (Oracle) | OK | 23 (23 / 7) | 21 · 23 · 0/0 | teaser only → full text from the detail endpoint (20 newest per poll); On-site mapped | 2026-10-08 |
| FAB · Mashreq · e& · du · DP World · Dubai Holding (Oracle) | OK | 110 · 202 · 8 · 12 · 140 · 38 | text 29 · 48 · 8 · 12 · 117 · 22 (detail cap 20 per poll) | as Emirates NBD; many locations are country-only | 2026-10-08 |
| ADCB (SuccessFactors) | OK | 30 (30 / 30) | 30 · 0 · — | the feed's full description was ignored; the feed has no posting date (expiry only) | 2026-10-08 |
| Al-Futtaim (SuccessFactors) | OK | 199 (199 / 123) | 199 · 0 · — | bare "SA" / "QA" locations read as countries; pipe-style titles give the city | 2026-10-08 |
| stc (SuccessFactors) | OK, empty | 0 | — | the careers site itself lists no openings | 2026-10-08 |
| G42 · Majid Al Futtaim (Phenom) | OK | 42 · 137 (all GCC) | teaser (~330 chars) · dated | empty locations fall back to the country | 2026-10-08 |
| ADNOC (Phenom) | **Fixed** | 0 → 66 (66 / 66) | 66 · 66 · 0/0 | the site locale `country: "us"` was read as the search country and dropped every posting | 2026-10-08 |
| Salesforce · Visa (Workday) | OK | 100 · 100 (15 · 22 GCC) | 25 per poll · 100 · 0/2 | no descriptions → detail JSON (text, exact date, ISO country, time type) for 25 per poll | 2026-10-08 |
| Chalhoub (Teamtailor RSS) | **Fixed** | 100 (75 / 73) | 100 · 100 · 0/3 | every location was empty (Teamtailor `tt:locations` unread); remote status; employer name | 2026-10-08 |
| Email alerts (Bayt, NaukriGulf, GulfTalent, LinkedIn / Indeed AE, Glassdoor) | Synthetic only | — | — | Arabic lines, labelled lines, age chips, more Gulf cities; see above | 2026-10-08 |

Location parsing (`lib/discovery/relevance/location.ts`) now reads Workday
"AE - Dubai, United Arab Emirates", SuccessFactors "Riyadh, SA" and bare
"SA", ISO-3 codes (ARE, SAU, QAT, KWT, BHR, OMN), Workable "Riyadh,
Riyadh Province, Saudi Arabia", Arabic names and double-encoded Arabic.
Relevance rules version r3.

Remote boards: Remotive, Working Nomads and We Work Remotely stored no
description, and Himalayas / Jobicy only a one-line excerpt, so "US only",
"relocation package" or a UTC window never reached the gate. All five now
keep the full text (Himalayas adds its timezone window, e.g. "UTC+5:30").

### New sources from the 2026-10-08 search (defaults v3)

| Source | Method | Count | Robots / terms | Default |
|---|---|---|---|---|
| ENOC · SABIC · Saudia · OQ | SuccessFactors `sitemal.xml` | 4 · 0 · 6 · 2 | robots disallow `/services/` etc., not the feed | on (employer watch list) |
| AD Ports · Emaar (CX_1001) · Bapco Energies | Oracle ORC | 9 · 2 · 1 | no robots.txt on the hosts | on (employer watch list) |
| Qashio | Teamtailor RSS | 16 | robots allow `/jobs.rss` (only `aihitdata` is blocked) | off |
| Mrsool | Workable `mrsool-3` | 14 | apply.workable.com robots allow all | off |
| Thndr | Ashby | 10 (Riyadh and Cairo) | public posting API | off |

Probed and not added: Kitopi (its Lever board returns 404), Rewaa (Lever,
0 jobs), Property Finder, Huspy, Sarwa, Alaan, Wio, Bayzat, NymCard (no
public board found, or an empty account), Tamatem and Jeeny (mostly
non-engineering).

### Remote and relocation boards (2026-10-08)

| Board | Feed / API | Robots / terms | Decision |
|---|---|---|---|
| JustRemote | none | robots allow listings; no feed | not added (HTML only) |
| Remote.co | none reachable | site did not answer | not added |
| EU Remote Jobs | feed redirects to HTML | robots disallow search parameters | not added (HTML only) |
| Remote Rocketship | authenticated REST API | paid plans only | not added (zero-cost rule) |
| Arc | none public | robots allow pages | not added (HTML only) |
| Relocate.me | none | robots allow pages | not added (HTML only) |
| Landing.jobs | `/api/` | robots disallow `/api/` and `/jobs/search` | not added |

## Employer watch list (2026-10-08)

GCC government, semi-government and major employers lee keeps watching
(`lib/defaults/watch-employers.ts`, Settings › Sources › "GCC employer
watch list"). Methods: **polled** (an adapter), **alerts** (the
employer's own job alerts), **AI** (daily AI web search), **weekly** (a
watch link with a "Checked" button, due again after 7 days). None is
nationals-only.

| Employer | Country | Backend | Method | Verified | Date |
|---|---|---|---|---|---|
| Emirates Group | AE | Avature | alerts · AI · weekly | no public feed | 2026-10-08 |
| Etihad Airways | AE | SmartRecruiters | alerts · AI · weekly | API disallowed by robots.txt | 2026-10-08 |
| flydubai | AE | iCIMS | alerts · AI · weekly | robots `Disallow: /` | 2026-10-08 |
| Dubai Airports | AE | custom | AI · weekly | no feed | 2026-10-08 |
| DEWA | AE | custom | AI · weekly | 403 to automated clients | 2026-10-08 |
| SEWA | AE | custom | AI · weekly | no feed | 2026-10-08 |
| ADNOC | AE | Phenom | polled | 66 jobs | 2026-10-08 |
| ENOC | AE | SuccessFactors | polled | 4 jobs | 2026-10-08 |
| TAQA | AE | custom | AI · weekly | no feed | 2026-10-08 |
| Masdar | AE | SmartRecruiters | alerts · AI · weekly | API disallowed by robots.txt | 2026-10-08 |
| ADNEC Group | AE | unknown | AI · weekly | careers page 404 | 2026-10-08 |
| du · e& | AE | Oracle ORC | polled | 12 · 8 jobs | 2026-10-08 |
| Emirates NBD · DP World | AE | Oracle ORC | polled | 23 · 140 jobs | 2026-10-08 |
| AD Ports Group · Emaar | AE | Oracle ORC | polled | 9 · 2 jobs | 2026-10-08 |
| RTA Dubai | AE | custom | AI · weekly | no feed | 2026-10-08 |
| Mubadala · ADQ | AE | custom / unknown | AI · weekly | no feed; ADQ page 404 | 2026-10-08 |
| Emirates Post | AE | custom | AI · weekly | 403 | 2026-10-08 |
| Dubai Careers (Dubai Government) | AE | custom | AI · weekly | mixed portal; nationals-only postings are skipped | 2026-10-08 |
| Qatar Airways | QA | Taleo + Avature | alerts · AI · weekly | no public feed | 2026-10-08 |
| QatarEnergy | QA | custom | AI · weekly | careers behind a login | 2026-10-08 |
| Ooredoo · QNB | QA | SniperHire | AI · weekly | HTML only | 2026-10-08 |
| Aramco | SA | SuccessFactors | AI · weekly | refuses automated clients; not bypassed | 2026-10-08 |
| SABIC · stc · Saudia | SA | SuccessFactors | polled | 0 · 0 · 6 jobs | 2026-10-08 |
| NEOM · Ma'aden · Saudi National Bank · PIF | SA | custom / unknown | AI · weekly | no feed; PIF 403 | 2026-10-08 |
| Kuwait Oil Company · KNPC | KW | custom | AI · weekly | no feed; most KOC hires are nationals | 2026-10-08 |
| Zain · NBK | KW | custom | AI · weekly | no feed | 2026-10-08 |
| Bapco Energies | BH | Oracle ORC | polled | 1 job | 2026-10-08 |
| Beyon (Batelco) | BH | custom | AI · weekly | no feed | 2026-10-08 |
| OQ | OM | SuccessFactors | polled | 2 jobs | 2026-10-08 |
| Omantel · Oman Air | OM | custom | AI · weekly | Omantel needs a Microsoft sign-in | 2026-10-08 |

Excluded, nationals only (never added as sources or watch links): Jadarat
(Saudi Arabia), Kawader (Qatar), Kuwait Civil Service Commission, the UAE
federal government portal (FAHR) and Abu Dhabi government jobs.
