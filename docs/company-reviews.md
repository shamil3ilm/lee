# Company reputation from public reviews

What lee can learn about an employer's reputation at zero cost, legally,
and how the Reputation panel on the company page uses it. Research date:
Sep 27, 2026. Re-check the terms below before adding a source.

## Rules this feature follows

- **Zero cost.** Only free, keyless APIs are fetched automatically. The one
  optional paid-tier API (Google Places) is off by default, uses the
  user's own key and has a hard monthly call cap in code.
- **No ToS-violating scraping.** Review sites whose terms forbid automated
  access are never fetched. lee shows a deep link instead, and the user
  records what they read.
- **AI suggests, the user confirms.** The AI summary is only a draft until
  the user edits and confirms it. Only confirmed data feeds scoring and
  Scam Shield.
- **Honest client.** Every request sends
  `lee/1.0 (+https://getlee.vercel.app; personal job-search tool)`, is
  rate-limited per host and has a timeout. Each source's last error is
  stored and shown.

## Review sites: deep links only

| Site | Free API? | Automated access allowed? | What lee does |
|---|---|---|---|
| Glassdoor | No. The partner API closed in 2021–2022, and access is now enterprise-only. | No. The Terms of Use forbid "any robot, spider, scraper, data mining tools … or other automated means" without written permission. | Deep link to the Glassdoor company search. |
| Indeed company reviews | No public reviews API. The Publisher API is for jobs only and closed to new users. | No. Indeed's ToS forbid scraping without written permission. | Deep link to the Indeed company search. |
| AmbitionBox (Naukri / Info Edge) | No. | No. The site blocks automated clients (it returned 403 to our fetch), and its terms reserve all content. | Deep link (web search restricted to ambitionbox.com). |
| Comparably | No. | No. The terms forbid using "any means to scrape or crawl any Web pages or content". | Deep link (site search). |
| Kununu | No public API (the `kununu/*` packages are internal tooling). | No. It is a login-gated review platform, and its AGB reserve the content. | Deep link (site search). |
| Blind (teamblind.com) | No. | No. The community guidelines say "Do not … scrape …" and most content is login-walled. | Deep link (site search). |

The user reads the site and records a rating (1–5), an optional link and a
short summary in the panel. These are the user's own notes, so storing them
is fine. They count as confirmed input.

## Google Places API (New): optional, off by default

- **Free caps since Mar 1, 2025.** The $200 monthly credit was replaced by
  per-SKU free monthly caps:
  - Text Search Essentials (IDs Only): unlimited.
  - Place Details Enterprise + Atmosphere: 1,000 calls a month free, then
    $25 per 1,000.

  The `reviews` field puts a Place Details call in the **Enterprise +
  Atmosphere** SKU. `rating` and `userRatingCount` are Enterprise fields.
- **Caching terms.** You must not pre-fetch, cache or store Places content.
  The **place ID is exempt** and may be stored indefinitely. Reviews must be
  shown with their author attributions and a Google attribution.
- **What lee does.**
  - The key is saved by the user in Settings › AI › Service keys
    (`google_places`, encrypted like the other keys). It is never read from
    a shared server key unless the owner set `GOOGLE_PLACES_API_KEY`.
  - Places is enabled per user in Settings › Integrations. **Default: off.**
  - The first lookup is a Text Search with field mask `places.id` (IDs Only,
    free). After that, a Place Details call fetches `rating`,
    `userRatingCount`, `reviews` and `googleMapsUri`.
  - Only the place ID is stored. The rating and reviews are shown live, when
    the user clicks "Check Google rating". They are never cached and never
    fed to scoring or the AI.
  - **Hard cap in code.** `PLACES_HARD_MONTHLY_CAP = 900` calls a month,
    below the 1,000 free calls. The user's own cap (default 100) is clamped
    to it. Every HTTP call, including the free ID search, reserves one unit
    atomically in `reputation_settings` *before* the request is sent. When
    the month's budget is used up, the call is refused and nothing is sent.
  - The cap only covers lee's calls. If the same key is used elsewhere,
    set a quota in Google Cloud Console too. The settings card says so.

## Free, compliant signals fetched automatically

| Source | Access | Limits and terms | Used for |
|---|---|---|---|
| **Hacker News via Algolia** (`hn.algolia.com/api/v1`) | Free, no key. | 10,000 requests per hour per IP. | Story mentions in the last 2 years, and "Who is hiring" history: comments in "Ask HN: Who is hiring?" threads that name the company, counted by month. |
| **GDELT DOC 2.0** (`api.gdeltproject.org/api/v2/doc/doc`) | Free, no key. | One request per 5 s per IP. The limiter is stricter in practice, so lee keeps ≥ 6 s between requests and records a 429 as a source error. | News in the last 12 months: layoffs, lawsuits, fraud, unpaid wages, visa or labour issues, and funding. Headlines are sorted into categories by deterministic keyword rules. |
| **Wikidata** (`wbsearchentities`, `wbgetentities`) | Free, no key. | The Wikimedia User-Agent policy requires a descriptive UA with contact details, which lee sends. Rate limits are per minute; honour 429 and Retry-After. | Founded date (P571), HQ (P159), industry (P452), employees (P1128), official website (P856), and the English Wikipedia link. The candidate whose P856 host matches the company's domain wins. With no domain match, only an exact label match is accepted. |

Search results for common names can be noisy. Every automatic signal must
name the company in its title (a word-boundary match), or its link must be
on the company's own domain. Signals are kept compact: at most 40 per
company, titles truncated to 200 characters, one row per company (see
Storage).

## Checked and rejected for automatic fetching

| Source | Finding | Result |
|---|---|---|
| **Reddit Data API** | Free for non-commercial use (100 QPM with OAuth). Since the Responsible Builder Policy (Nov 2025, updated Jun 2026), every developer, including personal projects, needs explicit pre-approval, and the self-service app form is gone. | **Deep link only** (`reddit.com/search`). Revisit if the owner gets approval. |
| **layoffs.fyi** | Data lives in an embedded Airtable. There is no API and no documented permission for automated access. | **Deep link only.** Layoff *news* comes from GDELT instead. |
| **WARN notices (US)** | Public filings, but published separately by each state, with no single free API. The aggregators are third-party scrapers. | **Deep link only** (WARNTracker site search). |
| **GCC company registries** | UAE: Invest in Dubai licence search (the former DED), and the MoET commercial-licence enquiry. Saudi Arabia: Ministry of Commerce CR inquiry (via my.gov.sa). Qatar: MOCI Qatar Business Map. All are public web forms, some with CAPTCHAs, and none has a free API. | **Deep links only**, shown in a "GCC registries" group. |

## How signals are used

1. **Reputation panel** (company page), with four parts:
   - Fetched signals, each with its source link and date.
   - Per-source status: last fetch and last error.
   - Deep links.
   - The user's recorded ratings.
2. **AI summary.** Generated only on demand. The AI returns pros, cons and
   red flags (unpaid salaries, visa or contract issues, layoffs, toxic
   culture, fraud) and notes each red flag's relevance to GCC hiring. Every
   claim must cite signal ids, and a claim whose cites are not real signals
   is dropped. The user edits the draft and confirms it before anything is
   saved. The call goes through the user's AI client (`ai_call_logs` kind
   `company_reputation_summary`) and the request usage scope, so tokens are
   tracked like every other AI call.
3. **Scoring.** Confirmed data feeds two criteria in the v17 §6.6 criterion
   shape (a score, a confidence and evidence items):
   - **Environment & culture**
   - **Company structure & stability**

   Inputs are the user's ratings, confirmed red flags and pros/cons, and
   Wikidata facts. Unknown lowers confidence, not the score. The
   breakdown lists each evidence item with its effect.
4. **Scam Shield.** A confirmed red flag in the *fraud* or *unpaid
   salaries / wage theft* category adds a `reputation.*` signal to postings
   from that company. The evidence is the company name in the posting.
   Confirming or changing a summary re-assesses that company's saved jobs
   and job discoveries.

## Fetching and storage

- **Refresh job.** Queue job type `company-reputation:user+company`, with
  two triggers:
  - **Weekly:** the daily scheduler plans watched companies whose signals
    are more than 7 days old, at most 20 a day. The idempotency key is the
    ISO week.
  - **On demand:** the panel's Refresh button, at most once an hour per
    company.

  The job is skipped while the free-tier throttle is on.
- **Storage** (0.5 GB budget):
  - `company_reputation` is one row per company, holding signals, source
    status, facts, the user's ratings, the confirmed summary and the Places
    place ID, all as capped JSON (a few KB per company).
  - `reputation_settings` is one row per user, holding the Places toggle,
    the cap and the month's counter.

  Deleting a company deletes its row (cascade). The nightly retention run
  (`reputationCache` step in `lib/db/retention/`) clears fetched signals of
  unwatched companies not refreshed for 90 days. It keeps the user's
  ratings, the place ID and any confirmed summary, and it deletes a row
  only when nothing of the user's is left in it.
- **Logs.** `reputation_refreshed` and `reputation_summary_confirmed` are
  persisted as info events, and `reputation_source_failed` as a warning
  (`lib/logs/catalog.ts`).

## Sources

- Glassdoor Terms of Use: <https://www.glassdoor.com/about/terms/>
- Indeed Terms of Service: <https://www.indeed.com/legal>
- Comparably Terms: <https://www.comparably.com/info/terms-of-service>
- Blind community guidelines: <https://www.teamblind.com/community-guidelines>
- Google Maps Platform pricing: <https://developers.google.com/maps/billing-and-pricing/pricing>
- Places API data fields and SKUs: <https://developers.google.com/maps/documentation/places/web-service/data-fields>
- Places API policies (caching, place ID exemption, attribution): <https://developers.google.com/maps/documentation/places/web-service/policies>
- HN Search API: <https://hn.algolia.com/api>
- GDELT DOC 2.0 API: <https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/>
- MediaWiki API etiquette and User-Agent policy: <https://www.mediawiki.org/wiki/API:Etiquette>
- Wikimedia API rate limits: <https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits>
- Reddit Responsible Builder Policy: <https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy>
- Reddit Data API wiki: <https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki>
- layoffs.fyi: <https://layoffs.fyi/>
- UAE licence verification: <https://u.ae/en/information-and-services/business/important-digital-services/inquire-about-licences-names-and-activities>
- Invest in Dubai licence search: <https://app.invest.dubai.ae/search-license>
- Saudi CR inquiry: <https://my.gov.sa/en/services/18443>
- Qatar Business Map: <https://businessmap.moci.gov.qa>
