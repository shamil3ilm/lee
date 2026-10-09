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

## LinkedIn hiring posts (2026-10-09)

Many GCC openings are never listed: a recruiter or hiring manager posts
"We're hiring a Laravel developer in Dubai, DM me / send your CV to …".
lee picks these up through compliant channels only. It never fetches,
scrapes or scrolls linkedin.com: LinkedIn's User Agreement (section 8.2)
forbids scraping and "bots or other unauthorized automated methods to
access the Services", and reading other members' posts through the API
(`r_member_social`) is granted to approved partners only.

**1. The user's own LinkedIn notification emails (automatic).** Source kind
`linkedin_post` (Settings › LinkedIn › Hiring posts, off by default). Each
discovery run reads the last 7 days of mail matching
`from:linkedin.com subject:(posted OR post OR posts OR shared OR …) -subject:("job alert")`
(≤ 40 messages) with the Gmail read-only scope, keeps only messages Google
verified for linkedin.com (DMARC pass, or a DKIM pass from linkedin.com, in
mx.google.com's Authentication-Results; the job-alert check), parses them
in memory (`lib/linkedin-posts/email-parse.ts`: "X posted", "X shared a
post", "Top posts for you" digests, text-only fallback) and keeps the posts
the classifier calls hiring. Stored per post: poster name, headline and
profile link as the email showed them, a ≤ 1 KB snippet, the canonical post
link (`/feed/update/urn:li:activity:<id>/`; every tracking and
recipient-token parameter dropped; never requested), the role, place and
contact read from the text. The job itself is title-only ("Low confidence:
title only", with Paste the JD). Bodies are never stored.

Turning the emails on (LinkedIn renames these; check the current labels):
Me › Settings & Privacy › Notifications; "Connecting with others" ›
"Updates from your network" › Email on; "Posting and commenting" › the post
notifications you want › Email on; a "Searching for a job" hiring/job-post
update, if your account shows one, › Email on. Follow recruiters in your
target cities and ring their bell so their new posts are emailed.

**Format changes.** LinkedIn changes these emails often. The parser keys
on what stays stable (post links carry a feed URN or a `/posts/` slug,
actor links are `/in/<slug>`) and reads the text around them. An email
whose subject looks like a post notification but yields no post is counted
as unreadable, never thrown: the count is in the source's run summary
("… · 2 unreadable"), on `sources.last_result.parseFailures`, and in
Settings › LinkedIn ("Format changed?" when at least half of the last five
emails, and two or more, were unreadable). Counters
(`linkedin_post_messages`) are pruned after 120 days.

**Classifier** (`lib/linkedin-posts/classify.ts`, deterministic): weighted
hiring phrases in English and Arabic ("we're hiring", "#hiring", "join our
team", "send your CV to", "urgent requirement", "looking to hire", مطلوب,
توظيف, وظيفة شاغرة …) plus supporting signals (DM me, role named, years of
experience, a GCC place, an email address), minus job-seeker posts
(#opentowork, "I'm looking for a new role"), announcements, advice about
hiring, filled roles and events. Hiring = a clear hiring phrase, score ≥ 5,
no job-seeker signal. On the 40 labelled synthetic posts
(`tests/fixtures/linkedin-posts/posts.ts`, 24 hiring / 16 not, used to tune
it): precision 1.00, recall 1.00 (gate: precision ≥ 0.90). On the 10
held-out posts, first blind run: precision 0.75, recall 0.60; after adding
the missed phrase families ("looking to hire", "we have an opening",
"recruiting now", "not hiring yet", "lessons from hiring"): 1.00 / 1.00, so
the held-out set is no longer blind. Expect real-world recall below these
numbers; the threshold favours precision.

**2. Posts the user captures.** "Add from text or link" recognises a pasted
LinkedIn post (its text, its link, or both). A link alone is stored as a
link and the user is asked to paste the text. The **Send to lee**
bookmarklet (Settings › LinkedIn) sends the user's current text selection
and the page URL in a POST form to `/api/capture` (never a query string),
authenticated by a per-user HMAC key in the form body (the cross-site POST
carries no session cookie; the key is revoked by making a new one); the
capture waits 30 minutes on Discovery › Capture for review, ≤ 4,000
characters, at most five per user. On a phone: Share › Copy link to post,
copy the text, paste both. A PWA share target was not added: lee has no
web app manifest or service worker, and iOS Safari does not support Web
Share Target.

**3. AI Mode.** The AI Mode dialog has "LinkedIn hiring posts" prompts (GCC,
the user's domains, India) asking for recent hiring posts with their links;
the answer comes back through "Add from text or link".

**Acting on a post:** a fact-locked, region-aware reply (LinkedIn message,
or email when the post lists an address) from the master CV, the best
résumé variant and the opted-in region facts, which the user copies and
sends; "Track it" makes an application (source "LinkedIn post"), the poster
a contact (role "Recruiter / Hiring manager") and, when sent, schedules
follow-ups; the referral hint shows the poster or colleagues at the
company among the user's imported connections; Scam Shield runs on the post
text with the Gulf rules (visa + job, processing fees, WhatsApp only).

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

## Coverage audit: Kuwait as the canary (2026-10-09)

With the Region filter on Kuwait, Discovery showed 0 new jobs out of 974.
Kuwait was the canary: the same gaps cost every region some postings.

### Root causes

1. **No automatic Kuwait source.** Every Kuwait employer on the watch list
   was a hand-checked link. The only Kuwait postings came from Tabby's
   Pinpoint board: 4 senior commercial and compliance roles that the gate
   rightly filtered. Search APIs (Himalayas, Jobicy) carry almost no Kuwait
   jobs, and Adzuna covers no GCC country.
2. **Region tagging missed most districts.** 119 of the ~250 place
   spellings in the new fixture set resolved to no region, including
   Mangaf, Fahaheel, Hawally, Mubarak Al-Kabeer, every Arabic Kuwait
   district, Al Barsha, TECOM, KIZAD, West Bay, Seef, Qurum, Indian tech
   areas (Marathahalli, Taramani, Hadapsar, Airoli) and Malayalam / Hindi /
   Tamil names. An untagged posting is kept but is invisible to the Region
   filter. "JP Nagar" (Bengaluru) was tagged Japan.
3. **The job APIs' country filter** (`locationMatchesCountries`, used by
   Workday and the enterprise adapters) knew only "kuwait" for Kuwait, so a
   posting located "Shuwaikh" or "Salmiya" was dropped before the gate.
4. **Nationals-only matched boilerplate.** "Kuwaiti nationals" anywhere in
   the JD filtered the posting, including "60% of our workforce are Kuwaiti
   nationals", "we support Kuwaitization" and "open to Kuwaiti nationals
   and expatriates". It now reads sentence by sentence: requirement phrases
   ("nationals only", "applicants must be Kuwaiti nationals", "reserved for
   Saudi candidates") always count; bare mentions and programme names count
   only in a sentence that is not about the company and does not welcome
   other nationalities. Title segments ("BI Developer - UAE National") now
   count. Same rules for all six GCC countries.
5. **Gulf grade titles.** "Assistant / Deputy Manager" (a senior individual
   grade in Gulf and Indian banks) read as Manager.
6. **Dedupe across countries.** The cross-source dedupe matched employer and
   title only, so a group's "Data Analyst" in Kuwait City was dropped as a
   copy of its Dubai posting. It now needs the same country (or an unknown
   location), and strips Gulf legal suffixes (W.L.L., K.S.C.P., S.A.O.G.).
7. **Google Alerts kept two places.** Suggested queries named only the first
   two target regions, so Kuwait (fourth) never got one. Starred regions now
   come first, with Arabic and district queries from the region playbook.

Stages checked and found sound (fixtures in `tests/unit/region-survival.test.ts`
for every region): the location rule keeps on-site GCC and India postings
that mention US or UK clients; remote eligibility keeps GCC / MENA / EMEA /
India / UTC+3 roles and still drops US-only; analyst, ERP, BI, MIS and
integration roles at banks, hospitals and logistics groups pass, while
teller, cashier, nurse and sales roles are filtered; retention is
status-based and region-neutral.

### Kuwait and UAE job sources (checked 2026-10-09)

One GET per board, honest User-Agent. Live counts are the day's totals.

| Employer | Board | Jobs (Kuwait) | robots.txt / terms | Route |
|---|---|---|---|---|
| Gulf Bank | Oracle ORC `JobSearch-GulfBank` | 6 (6) | Oracle hosts serve no robots.txt (404) | automatic, on |
| Kuwait Finance House | Oracle ORC `CX_1` (linked from kfh.com) | 0 | no robots.txt | automatic, on |
| Boubyan Bank | Taleo Business Edition RSS (`org=BYBBANK`) | 0 | lde.tbe.taleo.net serves no robots.txt | automatic, on |
| Tap Payments | Teamtailor RSS | 20 (3, Salmiya) | tenant robots: `User-agent: *` disallows `/app/ /messages/ /messenger/ /facebook/tab/ /jobs/internal/` only; `/jobs.rss` allowed | automatic, on |
| Agility | Workable `agility` | 16 (0) | Workable widget API, as for other boards | automatic, on |
| Tabby | Pinpoint `tabby` (since v2) | 43 (4) | as before | automatic, on |
| Property Finder (UAE) | Teamtailor RSS | 32 (UAE 15) | as Tap | automatic, off (Coverage turns it on) |
| Alghanim Industries | SuccessFactors | ~13 Kuwait | career host `Disallow: /services/` (the RSS path) | weekly check |
| Kuwait Airways | Zoho Recruit | 0 | Zoho allows `/jobs`, but lee has no Zoho reader | weekly check |
| Americana | Oracle ORC | 62 (0) | feed is a test ("dev7") host with 2022–25 postings | weekly check |
| NBK | Oracle iRecruitment | — | careers.nbk.com `Disallow: /` | weekly check, AI search |
| Zain · stc Kuwait · Alshaya · Jazeera · Boutiqaat · talabat | custom / Taleo Enterprise / SmartRecruiters | — | redirect loop, bot wall or 403; SmartRecruiters API disallowed | weekly check, AI search |
| KOC · KNPC · KIPIC · KPC · PIC | KPC recruitment portal | — | KPC: "announces their career opportunities for nationals"; no listing | not added (nationals) |

Plausible slugs that belong to someone else (do not add): Greenhouse
`armada` (US edge-AI), Ashby `rain` (US), Pinpoint `gig` (Gaming Innovation
Group), Workable `lean` (London) and `sabbar` (Saudi).

Government and semi-government (Kuwait): CITRA has no careers listing
(robots `Disallow: /private/`); PAAET lists no vacancies; KIA's careers page
runs a "Kuwaiti Fresh Graduates" programme (nationals); KDIPA careers sit
behind an Akamai 403. None is a source.

### Job boards for Kuwait

| Board | robots.txt | Terms | Route |
|---|---|---|---|
| LinkedIn | `User-agent: *` `Disallow: /` | §8.2 bans scraping | alert e-mails (parsed) + Kuwait search link |
| Indeed (kw.indeed.com) | `Disallow: /*?rss`, `/alert`, `/jobs/KW/` | bans bots on Indeed Apply | alert e-mails (parsed) + search link |
| Bayt | `Disallow: /en/jobs/?`, `/en/jobs/*-jobs/`; pages 403 | not readable (403) | alert e-mails (parsed) + search link |
| NaukriGulf | unreadable (TLS loop) | Info Edge terms | alert e-mails (parsed) + search link |
| GulfTalent | `Allow: /`, `Content-Signal: search=yes,ai-train=no,use=reference`; pages 403 | web terms 403 | alert e-mails (parsed) + search link |
| Tanqeeb | `Disallow: /*?keywords`, `/*?countries`, `/*?job_id` | not read | browse link |
| Akhtaboot | ends `User-agent: *` `Disallow: /` | — | not added (0 Kuwait jobs) |
| Mourjan | `Disallow: /search/`, `/detail/` | "Use any robot, spider, scraper … without our express written permission" is prohibited | not added (mostly domestic work) |
| Expatriates.com · dubizzle Kuwait (OLX) · 4Sale | Cloudflare / CloudFront 403 | — | not added |
| Q8Jobs · kuwaitjobs.net | suspended / parked | — | — |

### Region playbooks (the onboarding recipe)

`lib/coverage/playbooks.ts` holds one entry per region: the taxonomy ids
it covers, the place used in job-board searches, the AI Mode place phrase,
the alert sites (with ready search links built in `lib/coverage/presets.ts`),
local Google Alerts queries (English and Arabic), browse-only boards and the
company-directory group. Employer boards come from the starter catalog
(`regions` on each board). Adding a region is data: a taxonomy node, a
playbook entry and its boards.

Settings › Sources › **Coverage** lists every region in the preferences,
starred first, as Good / Low / None (3+ region sources and 5+ jobs kept a
week is Good), with one-click next steps: turn on the region's catalog
boards, open a ready alert search, check the watched employers, add a
Google Alert. Discovery (jobs and companies) shows a one-line summary for
the starred regions. Starred regions also get their own Google AI Mode
prompt, naming non-tech employers (banks, telecoms, retail, hospitals).

### Coverage matrix

Generated by `pnpm tsx scripts/coverage-matrix.ts --write` from the shipped
data. "Fixture postings kept" runs one synthetic on-site posting per place
spelling (`tests/fixtures/regions/places.ts`, plus the e2e region seeds)
through the relevance gate. Status counts what ships by default; live yield
is in the next table.

<!-- coverage-matrix:start -->
| Region | Status | Employer boards (on / off) | Broad & park sources | Alert links | Watched by hand | Browse boards | Company directories (auto) | Seed companies | Browse directories | Fixture postings kept |
|---|---|---|---|---|---|---|---|---|---|---|
| Kuwait | green | 6 / 0 | himalayas | 5 | 12 | 4 | Flat6Labs | 11 | 3 | 35 / 35 |
| UAE | green | 9 / 15 | himalayas, jobicy | 5 | 14 | 3 | Flat6Labs | 19 | 9 | 21 / 21 |
| Saudi Arabia | green | 6 / 9 | himalayas | 5 | 5 | 1 | Flat6Labs | 17 | 3 | 16 / 16 |
| Qatar | amber | 1 / 0 | himalayas | 5 | 4 | 1 | QSTP, Flat6Labs | 5 | 2 | 8 / 8 |
| Bahrain | amber | 2 / 0 | himalayas | 5 | 1 | 1 | StartUp Bahrain, Flat6Labs | 0 | 2 | 8 / 8 |
| Oman | amber | 1 / 0 | himalayas | 5 | 2 | 1 | Flat6Labs | 0 | 1 | 10 / 10 |
| Kochi | amber | 2 / 0 | himalayas, adzuna, infopark, ksum | 3 | 0 | 0 | Technopark, Infopark, Kerala Cyberpark, UL Cyberpark, NASSCOM members | 14 | 6 | 9 / 9 |
| Trivandrum | amber | 2 / 0 | himalayas, adzuna, technopark, ksum | 3 | 0 | 0 | Technopark, Infopark, Kerala Cyberpark, UL Cyberpark, NASSCOM members | 21 | 6 | 6 / 6 |
| Calicut | amber | 0 / 2 | himalayas, adzuna, cyberpark, ul_cyberpark, ksum | 3 | 0 | 0 | Technopark, Infopark, Kerala Cyberpark, UL Cyberpark, NASSCOM members | 2 | 6 | 4 / 4 |
| Bengaluru | green | 4 / 3 | himalayas, adzuna | 3 | 0 | 0 | NASSCOM members | 0 | 3 | 8 / 8 |
| Hyderabad | amber | 0 / 1 | himalayas, adzuna | 3 | 0 | 0 | NASSCOM members | 0 | 3 | 6 / 6 |
| Chennai | red | 0 / 0 | himalayas, adzuna | 3 | 0 | 0 | NASSCOM members | 0 | 3 | 5 / 5 |
| Pune | red | 0 / 0 | himalayas, adzuna | 3 | 0 | 0 | NASSCOM members | 0 | 3 | 6 / 6 |
| Delhi NCR | amber | 1 / 0 | himalayas, adzuna | 3 | 0 | 0 | NASSCOM members | 0 | 3 | 6 / 6 |
| Mumbai | red | 0 / 0 | himalayas, adzuna | 3 | 0 | 0 | NASSCOM members | 0 | 3 | 6 / 6 |
| Remote | green | 0 / 0 | himalayas, remoteok, weworkremotely, remotive, workingnomads, jobicy, hn_whoishiring | 1 | 0 | 0 | — | 0 | 0 | 9 / 9 |
| Europe | amber | 0 / 1 | hn_whoishiring | 3 | 0 | 0 | — | 0 | 0 | 1 / 2 |
| UK | amber | 0 / 1 | hn_whoishiring | 3 | 0 | 0 | — | 0 | 0 | 1 / 1 |
| US | amber | 0 / 15 | hn_whoishiring | 3 | 0 | 0 | — | 0 | 0 | 1 / 1 |
| Canada | red | 0 / 0 | — | 3 | 0 | 0 | — | 0 | 0 | 1 / 1 |
| Australia | red | 0 / 0 | — | 3 | 0 | 0 | — | 0 | 0 | 1 / 1 |
| Singapore | amber | 0 / 1 | — | 3 | 0 | 0 | — | 0 | 0 | 1 / 1 |
| Malaysia | red | 0 / 0 | — | 3 | 0 | 0 | — | 0 | 0 | 1 / 1 |
<!-- coverage-matrix:end -->

### Live check (2026-10-09)

`DATABASE_URL=pglite:memory:// pnpm tsx scripts/region-coverage-live-check.ts`
reads every polled catalog source once (public sources only, nothing
stored) and counts postings tagged to each region / kept by the gate for
the owner's domains. Both columns use the new tagging, so "before" shows the
source gap only.

| Region | Before (v5 defaults) | After (v6 defaults) | After + Coverage one-click boards |
|---|---|---|---|
| Kuwait | 4 / 4 | 13 / 8 | 13 / 8 |
| UAE | 143 / 78 | 147 / 81 | 879 / 401 |
| Saudi Arabia | 54 / 24 | 69 / 30 | 184 / 74 |
| Qatar | 2 / 1 | 3 / 2 | 3 / 2 |
| Bahrain | 2 / 2 | 11 / 8 | 11 / 8 |
| Oman | 4 / 1 | 4 / 1 | 4 / 1 |
| Kochi | 62 / 30 | 62 / 30 | 62 / 30 |
| Trivandrum | 100 / 47 | 100 / 47 | 100 / 47 |
| Calicut | 0 / 0 | 0 / 0 | parks off by default |
| Bengaluru | 86 / 39 | 86 / 39 | 114 / 51 |
| Hyderabad · Chennai · Pune | 3 · 3 · 2 | 5 · 3 · 2 | 12 · 3 · 2 |
| Delhi NCR · Mumbai | 102 · 25 | 102 · 25 | 102 · 25 |
| Remote | 229 / 97 | 238 / 102 | 238 / 102 |

Kuwait is still thin from feeds alone: most Kuwaiti employers publish no
allowed feed. The rest comes from the user's own alerts (LinkedIn, Bayt,
NaukriGulf, Indeed, GulfTalent with location Kuwait), Google Alerts and AI
Mode, which the Coverage section sets up. Two sources were unreadable on the
day (Meesho timed out; Deloitte's SuccessFactors feed exceeds 10 MB).

## Company discovery: local companies and startups (2026-10-09)

Discovery › Companies lists companies that may never post on a job portal,
especially in the GCC and Kerala, ranked by an explainable company fit
(`lib/company-discovery`). A weekly job per user collects them; a bounded
enrichment queue then finds each company's careers page and job board.

### Sources: read automatically

| Source | Endpoint | Terms / robots | Bounds |
|---|---|---|---|
| Wikidata Query Service | `GET query.wikidata.org/sparql` (companies whose HQ (P159) is a target city or in one, or whose country (P17) is a target country, with an industry (P452) in lee's list, not dissolved; website, inception, employees, logo) | Data CC0. WDQS manual: 60 s per query, 60 s of processing per minute per client, informative User-Agent with contact details required (`lee/1.0 (+https://getlee.vercel.app; …)`). robots.txt disallows `/sparql` for crawlers; the endpoint is a public API | one query per country, `LIMIT 400`, 2 s apart |
| GitHub organisations | `GET api.github.com/search/users?q=type:org location:"Dubai"`, then `/orgs/{login}` and `/orgs/{login}/repos` in enrichment | REST Search API: 10 requests a minute unauthenticated, 30 with a token (the user's GitHub connection, else the deployment's `GITHUB_TOKEN`). Acceptable Use forbids using GitHub information for spam or selling personal data: lee searches **organisations only** (`type:org`), stores no person's data and sends nothing | 6 locations a run (starred countries always, the rest rotating weekly), 50 orgs a page, 6.5 s apart; a cursor per city walks the pages week by week (search serves at most 1,000 results), so every org in the city comes round (Kuwait: 368 orgs → 8 pages) |
| YC companies (yc-oss) | `GET yc-oss.github.io/api/companies/all.json` (~10.5 MB, 6,283 companies on 2026-10-09) | The github.com/yc-oss/api repository has **no licence**, and YC's own terms forbid scraping ycombinator.com. lee never fetches ycombinator.com; from the open copy it keeps facts only (name, website, location, team size, industry tags) and links to the YC profile; no descriptions or logos | one fetch a week, 16 MB cap; active GCC / India companies only (India 226, UAE 17, Saudi 5 on 2026-10-09) |
| Technopark company list | `GET technopark.in/api/paginated-companies?page=N` (the JSON its own /company-list page calls; 497 companies, 25 pages; names only), then `GET technopark.in/company-details/{id}` during enrichment for the "Company Website" link | robots.txt disallows only `/cgi-bin/`; no terms page (privacy/cookie policy only) | the **whole list** every week (a cursor; an interrupted run resumes at the next page); one profile page per name-only company |
| Infopark company list (Kochi) | `GET infopark.in/companies?page=N` (HTML cards: name, website, "Domain" tags; 401 companies, 10 pages of 42) | robots.txt `User-agent: * Disallow:` (empty); no terms page (`/terms*`, `/privacy-policy`, `/disclaimer` all 404) | the whole list every week (cursor); e-mails and phones on the cards are never kept |
| Kerala Cyberpark (Kozhikode) | `GET cyberparks.in/companies-at-park/` (one page, ~75 cards: name, website, listing) | robots.txt disallows only `/wp-admin/`; no terms page | once a week |
| UL Cyberpark (Kozhikode) | `GET www.ulcyberpark.com/companies` (one page, ~42 linked cards) | no robots.txt (the path serves the site's 404 page, so no rules); its terms page has no clause on robots, scraping or automated access | once a week |
| QSTP directory (Doha) | `GET qstp.qa/wp-json/wp/v2/directory?per_page=100` (WordPress REST API; 95 entries) | robots.txt `Disallow:` (empty); privacy policy only, no scraping clause | once a week |
| Flat6Labs portfolio | `GET flat6labs.com/company-sitemap.xml` (Yoast; 455 portfolio companies), then each company page (name and country in its `<h1>`, website after "Website") | robots.txt `User-agent: * Allow: /`; no terms page (`/terms-of-use`, `/terms-and-conditions`, `/privacy-policy` 404); no bot wall | 60 company pages a week (cursor; a full pass in about 8 weeks); GCC companies inside your target regions only |
| StartUp Bahrain ecosystem | `GET startupbahrain.com/ecosystem` (one pre-rendered Framer page; the "Startups" section's name + domain) | robots.txt `User-agent: * Allow: /`; no terms page | once a week |
| NASSCOM members | `GET nasscom.in/members-listing?page=N` (Drupal view, 15 a page, about 3,600 members: name, city, website) | robots.txt disallows `/core/`, `/profiles/`, `/admin/`, `/search/`, `/user/*` … not `/members-listing`; no terms-of-use page; the footer's refund and privacy policies have no clause on automated access | 10 pages a week (cursor; a full pass in about 24 weeks); members in your target cities only |
| Employers in your jobs | every employer of a posting lee collected in the last 120 days (ATS boards, e-mail alerts, Google Alerts, pasted imports, park job boards), your applications and your watch list; placed by the posting's location | your own data | 300 a run, most postings first; a posting from the employer's own ATS source sets its job board (already watched) |
| Well-known employers (seed) | `lib/company-discovery/seed/*.ts`: about 75 public facts (name, website, offices, industry, other names), verified live with `pnpm tsx scripts/company-seed-verify.ts` | public facts | **a recall floor, not the ceiling, never a ranking signal**: no fit or growth points, never "under the radar" |
| Your LinkedIn connections | the export you imported (`linkedin_connections`) | your own data | companies with ≥ 2 connections, 60 a run; counts feed the warm-intro chip |
| "Add companies" | text or links you paste (e.g. a Google AI Mode answer from the prompts in the dialog, opened in your own browser) | lee never contacts Google | 40 companies per paste |
| "Find a company by name" | the name you type: Wikidata `wbsearchentities` (www.wikidata.org) and one SPARQL query for website, HQ, industry, founding year and employees; up to 4 website guesses (the name + .com/.ai/.io/.co and the typed place's country domain), each one GET of the home page | Wikidata data CC0; nothing is stored until you pick an option and confirm (you may correct the website) | 5 Wikidata hits, 4 guesses a search |

Company websites are read only during enrichment, only after robots.txt
(lee's token or `*`; an unreadable robots.txt stops the check), through
`safeFetch`: the home page, then a linked careers page or `/careers`,
`/jobs`, `/join-us`, `/work-with-us`; at most 4 pages of 1.5 MB per
company, 6 companies per job, 40 jobs a week (complete park lists add
hundreds of companies; the rest continue the week after). A link to Greenhouse, Lever,
Ashby, Workable, Recruitee, Pinpoint, Workday or Teamtailor offers
**Watch jobs** (a source of that kind, polled by the existing adapter);
SmartRecruiters, BambooHR, Zoho Recruit and others stay links. Role
addresses (careers@, jobs@, hr@ …) on the company's own domain are kept;
personal addresses are never kept or guessed. **Watch careers page** adds a
weekly "Check these yourself" link; when robots.txt allowed the page, its
text hash is compared weekly and a change adds a to-do.

### Directories: browse links only (never fetched)

| Directory | Region | Why not read |
|---|---|---|
| Hub71 startups | Abu Dhabi | Terms of use ban "any robot, spider, scraper, data mining tool" |
| in5 (now infive.ae) | Dubai | TECOM terms: personal, non-commercial use only; REST API needs sign-in |
| Dubai Internet City community directory | Dubai | TECOM terms (its backend API is undocumented) |
| Dubai Silicon Oasis / DTEC members | Dubai | DSO terms forbid spiders and robots; DTEC personal use only |
| DIFC public register / Innovation Hub | Dubai | Vercel bot checkpoint (429); FinTech Hive's old host no longer resolves |
| ADGM public registers | Abu Dhabi | Cloudflare challenge (403) |
| Central Bank of Kuwait Innovation Hub participants | Kuwait | Terms: "for personal usage only" |
| Kuwait National Fund for SME Development | Kuwait | Sucuri JavaScript challenge; Sirdab Lab's domain no longer resolves |
| Misk Hub / Monsha'at | Saudi Arabia | No public startup list (the Misk Accelerator page is 404); Monsha'at did not answer |
| QDB startups | Qatar | Akamai 403 |
| Bahrain FinTech Bay partners | Bahrain | Terms only render with JavaScript (unread) |
| Oman SME Authority (Riyada) | Oman | No company directory (riyada.om has lapsed; sme.gov.om) |
| GTECH members (Group of Technology Companies, Kerala) | Kerala | Terms of use §5: "No material from this site may be copied, modified, reproduced, republished … without prior written permission from GTech"; the list is a CSRF-protected POST behind JavaScript |
| Kerala IT (keralait.org) | Kerala | Unusable: an expired self-signed certificate over HTTPS, "Restricted URL!!" over HTTP (checked 2026-10-09) |
| Dubai Chambers commercial directory | Dubai | Terms: "No material from the site may be copied, distributed, transmitted or used without expressed written permission"; the directory is a session-based Siebel app behind Cloudflare |
| DMCC business directory / public register | Dubai | The directory page itself: "expressly forbidden to copy, download, store, reproduce … the DMCC member directory"; Salesforce search pages only |
| RAKEZ | Ras Al Khaimah | No public company registry; terms forbid obtaining information "through any means not intentionally made available" |
| Kuwait Chamber of Commerce & Industry | Kuwait | Sucuri JavaScript challenge on every page (not bypassed); terms unreadable |
| Kerala Startup Mission | Kerala | No startup directory API (a short showcase only) |
| Startup India search | India | `api.startupindia.gov.in/robots.txt`: `Disallow: /` |

### Ranking (company fit, 0–100)

Deterministic chips: region (inside your regions 22 · broader 11 · unknown
7), a starred region (+10 top priority, +6 preferred), domain (an industry
that serves your target role families: payments, fintech, banking,
e-invoicing, ERP, data 22 · general software 16), tech (GitHub languages
you have ready: top language 13 · any 9), size/stage (your preference 8 ·
none 4), hiring (open roles 15 · a job board 10 · a careers page 6), warm
intro (LinkedIn connections, 10), **growth (0–10: the growth score ÷ 10,
pulled toward the neutral 5 by its confidence — high × 1, medium × 0.7,
low × 0.4; unknown growth is the neutral 5, never 0)**. The total is capped
at 100. Public-sector / nationals-first names are capped at 10 and
flagged. No part counts fame: a seed entry, a Wikidata item or press
coverage adds nothing by itself.

### Growth score (0–100, with a confidence)

`lib/company-discovery/growth`: deterministic, explainable, free. Each
signal is a 0–100 sub-score (50 = flat) with its source, date and
confidence, measured against the company's **own** baseline, so a 3 → 8
role company scores higher than a 300 → 310 one. A signal lee could not
measure is *unknown*: it is left out of the mean (never counted as 0) and
lowers the confidence.

| Signal | Weight | What is measured | Source |
|---|---|---|---|
| Hiring velocity | 30 | open roles now vs ~30 and ~90 days ago (relative change, floor 2); until that history exists, new postings first seen in the last 30 days vs the 60 before | a weekly count of the company's ATS board (Greenhouse, Lever, Ashby, Workable, Recruitee, Pinpoint, Workday, Teamtailor) through the existing adapters, kept in `role_snapshots` (one a week, 26 weeks: retention by construction); postings lee collected |
| Funding and expansion news | 18 | funding +25, expansion / new office +18, acquisition +10, layoffs −30, closure −45, **each kind once** (press volume never adds), last 12 months | GDELT headlines naming the company (rule-classified, `lib/reputation/classify.ts`) and the user's reputation panel |
| Engineering activity | 17 | commits in the last 13 weeks vs the 13 before (the 3 most active public repos), plus new repos; stars are never scored | GitHub `/orgs/{login}/repos` + `/repos/{o}/{r}/stats/participation`, weekly |
| Headcount trend | 13 | yearly growth rate from dated employee counts; a size band alone is context (unknown) | Wikidata P1128 with P585 qualifiers, monthly |
| Stage and age | 9 | young (≤ 3 y 62 · ≤ 8 y 58 · ≤ 20 y 50 · older 45), + 10 for a recent accelerator cohort (a YC batch in the last 3 years, or an accelerator listing of a company at most 5 years old; any accelerator counts the same, no YC premium; a park or portfolio listing alone is not a signal), + 15 for funding in the last year when ≤ 10 years old | Wikidata / YC / Flat6Labs / StartUp Bahrain |
| Product momentum | 6 | launches in 90 days (+12 each, ≤ 2) and the **trend** of Hacker News mentions (6 months vs the 6 before), not their number | AI Radar "What's new" rows on the company's domain or GitHub org; HN Algolia |
| Market tailwind | 7 | a documented table: ZATCA e-invoicing in KSA 75, UAE e-invoicing 72, Saudi fintech 68, GCC fintech / payments 65, GCC AI 62, GCC e-commerce 58, Indian SaaS / AI 60, Kerala IT 56 | `lib/company-discovery/growth/tailwind.ts` (reviewed 2026-10-09) |

Score = the weighted mean of the known signals; null ("Growth unknown")
when nothing company-specific is known (the tailwind alone says nothing
about the company). Confidence: coverage q = Σ weight × confidence factor
(high 1 · medium 0.7 · low 0.4) ÷ 100 → **high** when q ≥ 0.45 and 3+
company-specific signals are known, **medium** when q ≥ 0.2 or 2+ are
known, else **low**. Shown as a chip ("Growth 78 · high confidence") with a
"Why" popover listing every signal; Discovery › Companies sorts by growth
and filters by a minimum growth.

**Under the radar** ("Under the radar" filter): fit ≥ 55, growth ≥ 60 or
open roles / new postings, and little visibility — no Wikidata item, no
press found, under 3 HN mentions, under 200 GitHub stars, no YC batch, not a
large employer (1000+ people or 50+ open roles), not
in the seed list.

**Job cards**: the employer's growth is copied onto its postings (by
domain, name or the legal name a park listed) and shown in "Why this
score" as "Company growth: 78" — not in Fit, unless Settings › Search ›
"Factor company growth into Fit" is on: then Fit moves by round((growth −
50) ÷ 10), −5…+5, at medium or high confidence only (the list sort uses
the same nudge, `growthNudgeSql`).

A weekly `company-growth` job (after the discovery run) gathers the facts
within bounds, best fit first, each on its own staleness clock: 20 board
counts (weekly), 6 GitHub orgs (4 requests each, weekly), one Wikidata
query for 40 companies (monthly), news + HN for 4 companies (every four
weeks).

### Recall audit (2026-10-09): why CareStack and QBurst were missing

Checked live through the same endpoints the pipeline reads.

| Company | Technopark list | Wikidata | GitHub org search | Cause |
|---|---|---|---|---|
| CareStack | listed as **"Good Methods Software Solutions (P) Ltd"** (id 6254, page 10 of 25); its profile page links carestack.com | no item (the only "CareStack" is an unrelated doula-practice product, Q140085746) | org `carestack` has no location, name or repos | the run read **3 of 25 pages** (this week's slice: 24, 25, 1); even when read, the legal name had no website, so it was never recognised or enriched |
| QBurst | listed as "QBurst Technologies (P) Ltd" (id 6092, page 18) | no item | org `qburst` (283 repos) has no location, so `location:` searches miss it | page 18 was not in the rotation; Infopark (Kochi) and UL Cyberpark (Kozhikode) list it with qburst.com but were browse-only; "(P)" was not stripped, so the Technopark name would not have matched "QBurst Technologies" |

Not the cause: dedupe across sources and region tagging (Technopark rows
are tagged Thiruvananthapuram → Kerala → India). Contributing: 40 new
directory rows a run (20 of the 60 read were dropped), 800 rows per user,
and retention auto-dismissing unreviewed companies after 60 days (a
dismissed key never comes back).

Fixes: the whole Technopark list every run (cursor, resumes after a
failure) and its profile pages for websites; Infopark, Cyberparks,
Flat6Labs, StartUp Bahrain and NASSCOM read automatically; "(P)" and
generic tails ("Technologies", "Solutions") folded into a brand key that
joins a name-only listing to the company known by its website (also across
runs: the remap before insert and the duplicate fold); a seed of
well-known employers with their legal names as aliases; employers seen in
jobs; the search box; caps of 1,200 directory rows a run and 3,000 per
user; local companies no longer auto-expire.

### Reset companies

Discovery › Companies › ⋯ › "Reset companies" (`lib/company-discovery/reset.ts`)
removes discovered companies, their growth scores, signals and weekly role
counts, and the dismissed rows that block a company from coming back.
Watched and saved companies are kept by default (removing them needs
typing RESET), and companies you added (pasted or found by name) are kept
unless you tick "Also remove companies I added myself". Rows linked to a
speculative application or promoted to your companies list are always
kept. Applications, contacts, jobs and the sources "Watch" added are never
touched. The dialog shows the counts first. The reset is owner-scoped and
batched, resets the list cursors so the next run re-reads every park and
member list, and can start that run at once. It logs `companies_reset`
with counts only.

### Live check (2026-10-09)

Through lee's own parsers and client (`pnpm tsx scripts/company-discovery-audit.ts`):

| Source | Region | Count | Sample (public company data) |
|---|---|---|---|
| Wikidata | UAE | 147 (Dubai 70, Abu Dhabi 15, Sharjah 4, Ajman 1) | Eat App, Lune Technologies, DeepSolve |
| Wikidata | Saudi Arabia | 42 (Riyadh 24, Jeddah 5) | Mantiqi, Naseej, Saudi Cloud Computing Company |
| Wikidata | Qatar | 11 (Doha 8) | — |
| Wikidata | Kuwait | 18 (first try timed out at WDQS's 60 s; retried in 5 s) | Kuwait Finance House, Gulf Bank of Kuwait, KlippiK, Zayn Technology |
| Wikidata | Kerala | Kochi 8 · Kozhikode 4 · Trivandrum 3 · Kerala-level 4 (of 165 for all Indian target cities, Bengaluru 70) | Codenex Solutions, Asianet Web |
| GitHub orgs | Dubai · Abu Dhabi · Riyadh · Doha · Kuwait | 20 each (first page; Kuwait 368 in total) | Vinelab, namshi · tiiuae · mrsool, ElmCompany · qcri, dibsyhq · Tap-Payments, JoinCODED |
| GitHub orgs | Kochi · Trivandrum · Kozhikode | 20 each (first page) | ileafsolutions, flycatch · zyxware, PIT-Solutions · Genskill, efeone |

### Live check after the recall fixes (2026-10-09)

`pnpm tsx scripts/company-recall-live-check.ts` against a throwaway PGlite
database: one synthetic user per region, the real weekly run, then 40
enrichments and the growth refresh. "Before" emulates the previous
pipeline's first run with the same parsers (Technopark 3 rotating pages,
GitHub first page of 20, no other parks, no seed, no jobs; caps wikidata
60 · github 40 · directory 40 · yc 40).

| Region | Before | After | After, by source | Well-known names present |
|---|---|---|---|---|
| Kerala | 138 | 1,148 | Technopark 488 · Infopark 401 · Cyberpark 75 · UL Cyberpark 42 · GitHub 162 · seed 25 · Wikidata 18 · NASSCOM 2 | 12 / 12 (CareStack, QBurst, UST, IBS, Experion, SunTec, Tata Elxsi, Envestnet, Guidehouse, Nest Digital, Quest Global, Litmus7) |
| UAE | 140 | 184 | GitHub 152 · seed 19 · YC 16 · Flat6Labs 1 (Wikidata rate-limited in this run: 429) | 12 / 12 |
| Kuwait | 79 | 75 | GitHub 51 · Wikidata 18 · seed 11 (YC's Indian companies no longer leak in) | 11 / 11 |
| KSA | 122 | 212 | GitHub 152 · Wikidata 42 · seed 17 · YC 4 · Flat6Labs 1 | 12 / 12 |
| Qatar | 126 | 181 | QSTP 95 · GitHub 74 · Wikidata 11 · seed 5 | 5 / 5 |

On the first run growth is mostly unknown (no role history yet; GDELT
answered 429 to this IP during the check), so it rests on the signals
that exist at once: engineering activity, Wikidata headcount and founding
year. Role counts build week by week.

## Company sources for low-visibility companies (2026-10-09)

Many employers in the GCC and Kerala have no Wikidata item, no GitHub
organisation and no park listing: family groups, banks, hospitals,
logistics firms, small software houses in residential towers. Two automatic
sources and one keyed source now find them
(`lib/company-discovery/sources/overpass.ts`, `gleif.ts`, `mca.ts`, walked by
`map-register.ts` over the areas in `register-areas.ts`, which is data: a
bounding box per target city, a GLEIF search per country or city, an MCA
state), plus browse links for the registers and events that cannot be read.

**Not only tech companies.** Banks, insurers, telecoms, airlines, logistics,
e-commerce, hospitals, universities, government bodies, conglomerates and
consultancies all hire software, data, analyst, ERP and BI people, so these
sources take every kind of office and large employer and never filter by
industry. Each listing gets a **hiring likelihood** instead
(`lib/company-discovery/hire-likelihood.ts`; on the card, e.g. "Likely
hires: data/IT (bank, 1,000+ staff)"): job postings lee saw from it +35 (the
strongest signal), a job board +15 or a careers page +10, a sector prior
(`sectors.ts`: software, IT, banks, telecoms, e-commerce, airlines,
conglomerates 28–35; retail and manufacturing 18; shops and restaurants 2–3),
size (staff, branches on the map, paid-up capital) up to +30, an LEI +8, a
website that answers +8. Only obvious non-employers are dropped (ATMs,
restaurants and cafés, single shops, homes, unnamed objects, embassies);
nothing is dropped for its sector alone. Each run keeps the 150 most likely
employers per family (map, register; `NEW_PER_SOURCE` caps them the same).
The likelihood is **not** part of the company fit, and these sources add no
fame or growth points. The card says why the company appeared ("Found via
map", "Found via register", when no other source listed it) and links to the
OpenStreetMap element or the GLEIF record.

**Fit is domain-neutral** (`lib/company-discovery/fit.ts`, audited for tech
bias): an unknown industry scores the neutral 11 (was 0), no public GitHub
code the neutral 6 (was 0), postings lee saw from the employer count as
hiring (+10), and banks, telecoms, e-commerce, fintech and data companies
now serve the analyst, BI and ERP role families as well as engineering ones
(`INDUSTRY_FAMILIES`). The growth score already left unmeasured signals out
(GitHub activity unknown is not 0), and "under the radar" / the seed floor
add no tech-only points.

### Automatic (with the bounds)

| Source | Endpoint | Licence / policy | Bounds |
|---|---|---|---|
| OpenStreetMap | `GET overpass-api.de/api/interpreter?data=…`: per area `[bbox]`, `nwr["office"]["name"]` (every office kind), `amenity=hospital\|university\|college\|bank`, `shop=mall\|department_store`, `man_made=works`, `industrial=*`; `out tags center 1500` | Data © OpenStreetMap contributors, **ODbL 1.0**: the attribution is shown at the foot of Discovery › Companies (linked to openstreetmap.org/copyright) and on the privacy page. Overpass usage (wiki.openstreetmap.org/wiki/Overpass_API): "You can assume that you don't disturb other users when you do less than 10,000 queries per day and download less than 1 GB data per day … If you set something up that uses the Overpass API regularly, then divide those numbers by 100 (making less than 100 queries fetching less 10 MB of data per day fine). If you have an app or website, then the usage counts towards the sum of requests made by all your users". overpass-doc "commons": "users are expected to send a maximum of about 10000 requests per day and keep their download volume below about 1 GB per day". `overpass-api.de/robots.txt` disallows `/api/` for crawlers; the interpreter is a public query API (as with WDQS) and lee does not crawl | the public instance, `[timeout:60]`, lee's User-Agent; **one area per run and at most one query per user every 14 days**, 1,500 elements a query (about 0.3–1 MB); with ≤ 100 invitees that is under ~50 queries and ~50 MB on a Monday; a full pass over a user's areas takes months; a failed query (504 "server too busy") also waits the 14 days |
| GLEIF LEI register | `GET api.gleif.org/api/v1/lei-records?filter[entity.legalAddress.country]=KW&filter[entity.status]=ACTIVE&page[size]=200&page[number]=N`: the whole country for KW, BH, QA, OM; `filter[fulltext]=<city>` for UAE, KSA and Indian cities (GLEIF has no city filter: `filter[entity.legalAddress.city]` answers "Filter should contain only allowed values"), places resolved from the addresses | GLEIF terms of use: "The data available through the Access Service are provided under the CC0 licence" (no attribution required; credited anyway). robots.txt `Disallow:` (empty). The API allows 60 requests a minute | 3 pages of 200 a run, one area a run (a cursor per area), a finished area again after 90 days; funds dropped; the trading or transliterated name shown, the legal name kept as "listed as" |
| India MCA company master data | `GET api.data.gov.in/resource/4dbe5667-7b6b-41d7-82af-211562424d9a?api-key=…&filters[CompanyStateCode]=Kerala&limit=500&offset=N` ("Registrars of Companies (RoC)-wise Company Master Data") | Government Open Data License – India (use, adaptation and redistribution, commercial or not, with attribution; credited in the Companies tab). Needs a free data.gov.in key: **runs only when the user saves one** (Settings › AI › "data.gov.in"; owner env fallback `DATA_GOV_IN_KEY`), skipped otherwise | 4 pages of 500 a run, one state a run; **all NIC codes** (the CIN's NIC code sets the sector: NIC 2004 for CINs before 2011, NIC 2008 after); companies not Active dropped; the e-mail and the full address never kept |

**MCA not verified live:** `api.data.gov.in` did not answer from the audit
network (connection failed) and `www.data.gov.in` (catalogue, robots.txt,
licence page) returned Akamai 403, so the resource id, field names and the
`CompanyStateCode` filter come from the published dataset listing and a
third-party integration's description, not from a response. The parser
reads fields leniently (`CompanyName` / `COMPANY_NAME` / `company_name`),
checks the state letters inside each CIN itself, and stops the walk with
"state filter not applied" if a page holds no company of the state. The
fixtures are synthetic.

**Legal names.** The brand fold strips GCC and Indian legal forms ("W.L.L.",
"K.S.C.(Closed)", "K.S.C. (Holding)", "K.S.C.C.", "K.S.C.P.", "S.A.K.P.",
"S.P.C.", "S.A.O.G", "S.A.O.C", "P.J.S.C.", "L.L.C.", "FZ-LLC", "FZE",
"FZCO", "DMCC", "Pvt. Ltd.", "Private Limited", "Co.", "Company", "Est.",
"Establishment", "/With Limited Liability"; for the brand key also
"Trading", "Industries" and a trailing country), only at the end of a name
and never the first word. A register's legal name joins the company lee
knows by its website in the same country ("National Bank of Kuwait
S.A.K.P." → "National Bank of Kuwait", "Zain Kuwait K.S.C.P." → "Zain"), and
a legal name that begins with exactly one known brand of 5+ characters joins
it ("Agility Public Warehousing Company K.S.C.P." → "Agility") — for map and
register names only, in the candidate merge, the remap before insert and
across runs.

**Websites.** A website that only a map or a register gave is checked once
in enrichment with the website liveness check (one GET of the home page,
`lib/company-discovery/site-live.ts`, shared with "Find a company"); a site
that does not answer is removed from the row ("The listed website did not
answer."), the company stays.

### Browse links only

| Register / channel | Checked 2026-10-09 (single GETs, lee's UA) | Why not automatic |
|---|---|---|
| DIFC public register, ADGM public registers, Dubai Internet City, in5, Dubai Silicon Oasis (DTEC) | see "Directories: browse links only" above | bot walls (Vercel, Cloudflare) and TECOM / DSO terms |
| QFC public register (Doha) | `qfc.qa/robots.txt` disallows only `/umbraco/`; `/en/public-register` redirects to `eservices.qfc.qa/qfcpublicregister/publicregister.aspx` | an ASP.NET WebForms search (postbacks, view state), not a list lee can page politely |
| SRTI Park (Sharjah) | robots.txt `Disallow:` (empty) | no public company directory |
| KSA MISA | robots.txt `Crawl-delay: 30` | no public licensee list |
| KSA Monsha'at | see above | did not answer automated clients |
| Kuwait MOCI | no robots.txt (404) | company lookups are e-services; no list |
| KDIPA (Kuwait) | robots.txt `Disallow:` (empty) | licensed investors are announced in news posts, not a list |
| Bahrain Sijilat | no robots.txt (404) | a per-company search app; no bulk list |
| Oman Invest Easy | connection failed | did not answer |
| India MCA via data.gov.in | Akamai 403 on www; API unreachable from the audit network | automatic with the user's key (above); otherwise a link |
| GITEX Global (Dubai) | robots.txt disallows `/registration-and-vip`; `/exhibitor-list` is a 404 page | exhibitors live in an event app, per edition |
| LEAP (Riyadh) | robots.txt allows; `/exhibitors` → Cloudflare 403 | bot wall (never bypassed) |
| Web Summit Qatar | robots.txt `Disallow: /api/` | its data API is disallowed |
| Huddle Global (Kerala) | robots.txt → 403 AccessDenied | no exhibitor list on the site |
| KSA Etimad | redirects to `login.etimad.sa` | tender awards behind sign-in |
| University career-fair employer lists | — | per-fair PDFs and pages; add them with "Add companies" |

**Common Crawl: skipped.** Finding company sites in it means scanning CDX
indexes or WAT files (terabytes per crawl) and classifying each host — not
cheap enough for a weekly per-user job — and the result would still need the
same liveness and noise checks as OpenStreetMap, which lists the same
employers with a name and a place already attached.

### Google Maps: a link only, never data

lee neither scrapes Google Maps nor uses the Places API to find companies.
Google Maps Platform Terms of Service §3.2.3: "(a) No Scraping. Customer will
not export, extract, or otherwise scrape Google Maps Content for use outside
the Services. For example, Customer will not: (i) pre-fetch, index, store,
reshare, or rehost Google Maps Content outside the services; (ii) bulk
download … places information …; (iii) copy and save business names,
addresses, or user reviews" and "(b) No Caching. Customer will not cache
Google Maps Content except as expressly permitted under the Maps Service
Specific Terms". The Service Specific Terms allow caching "latitude values,
longitude values" for "30 consecutive calendar days, after which Customer
must delete the cached Google Maps Content", and the Places policies say
"the place ID, used to uniquely identify a place, is exempt from the caching
restrictions". A list of discovered companies is exactly the stored business
names and addresses the terms forbid. Each company card instead has **"Look
up on Google Maps"**: a plain Maps URL,
`https://www.google.com/maps/search/?api=1&query=<name + city>`
(`lib/company-discovery/maps-link.ts`), opened in the user's own browser —
"You don't need a Google API key to use Maps URLs" (Maps URLs guide). lee
stores nothing from it. (The optional Google ratings on the Reputation panel
are a separate, user-keyed feature.)

### Automatic vs browse-only, in short

Automatic: OpenStreetMap (Overpass), GLEIF, India MCA (with the user's
data.gov.in key). Browse links: every register and event in the table
above, plus the existing directory links. A link only: Google Maps.

### Live check (2026-10-09)

`pnpm tsx scripts/company-sources-live-check.ts` (`countRegionCandidates`
in `map-register.ts`: one Overpass query and one GLEIF page per region,
no database). The first Dubai and Kochi Overpass queries answered 504
("Dispatcher_Client::request_read_and_idx::timeout. The server is probably
too busy"); they succeeded about 30 minutes later.

| Region | OpenStreetMap (after the noise filter; branches folded) | GLEIF |
|---|---|---|
| Kuwait (Kuwait City box) | 327 employers, 33 with a website, 43 likely or possible data/IT employers; most likely first: Boubyan Bank, Gulf Bank, NBK, Kuwait Finance House, ABK | 224 active entities in Kuwait; 97 of the first 100 kept |
| UAE (Dubai box) | 1,194 employers (the 1,500-element cap was reached), 281 with a website, 158 likely or possible; Commercial Bank of Dubai, Dubai Islamic Bank, Emirates Islamic, Emirates NBD | 5,730 entities match "Dubai"; 99 of the first 100 kept (mostly free-zone FZCO / FZ-LLC firms) |
| Kochi | 1,168 employers (cap reached), 88 with a website, 198 likely or possible; Axis Bank, Bank of Baroda, Bank of India, Canara Bank, Federal Bank | 2,266 entities match "Ernakulam"; 98 of the first 100 kept |
