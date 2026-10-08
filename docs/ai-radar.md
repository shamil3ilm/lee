# AI Radar (phases 16.0 and 16.1)

Spec: `docs/superpowers/specs/2026-09-25-employ-v16-ai-radar-issues-linkedin-design.md`
§1 (and §5–§8). Checked live on **Oct 8, 2026**. The Radar keeps the owner
up to date on new AI models, products, papers and repos, and turns what it
finds into grounded briefs and Playground cards.

Rules it follows: zero cost (free, keyless APIs; two optional free tokens),
no ToS-violating scraping, an honest User-Agent
(`lee/1.0 (+https://getlee.vercel.app; personal job-search tool)`, shared
with the company reputation feature), per-host rate limits, AI suggests and
the user confirms, settings in the UI.

## Sources

All are fetched once a day as queue jobs (`radar-source:user+source`, one
per source, priority 65, after the job-search work) for accounts that watch
at least one unmuted term. Radar › Refresh now queues the same jobs at most
once an hour. A failing source is recorded in its run summary and tried
again the next day; a 429 stops that source for the day.

| Source | Endpoint | Access and terms | Limit lee keeps | Per run |
|---|---|---|---|---|
| Hugging Face Hub | `huggingface.co/api/{models,spaces,datasets}?sort=trendingScore` | Public API; optional read token (Settings › AI › Service keys, `huggingface`) | Observed `RateLimit-Policy: 500 requests / 300 s`; lee spaces 1 s per host | 20 models, 10 Spaces, 10 datasets |
| HF Daily Papers | `huggingface.co/api/daily_papers` | Public API | as above | 30 papers |
| GitHub | `api.github.com/search/repositories` | Search API under GitHub's API terms; optional token (`github_search`, no scopes) | Observed `x-ratelimit-limit: 10`/min unauthenticated (30 with a token); lee spaces 6.5 s | 3 topic queries (`llm`, `agents`, `inference`, created in the last 7 days, by stars) + up to 3 watch terms (`in:name,description`, pushed in 30 days) |
| arXiv | `export.arxiv.org/api/query` (cs.CL OR cs.LG OR cs.AI, by submission date) | arXiv API Terms of Use: no more than one request every 3 s. `export.arxiv.org/robots.txt` disallows crawlers; the API is the sanctioned programmatic path | 3.1 s per request | 25 newest |
| Hacker News | `hn.algolia.com/api/v1/search_by_date` (stories, last 7 days) | Algolia HN API, free, no key | 10,000 requests/hour/IP; 0.5 s spacing | Up to 5 watch terms (rotated daily), 15 stories each; the term must be in the title or link |
| Official feeds | 19 RSS/Atom feeds (below) | Feeds published for feed readers; robots.txt allows each feed path | 1 s per host | Posts from the last 14 days, ≤ 8 per feed |
| News (GDELT) | `api.gdeltproject.org/api/v2/doc/doc` (phrase, last 7 days) | GDELT DOC 2.0, free, no key | One request per 5 s (lee: 6 s), 30 s timeout | Up to 5 terms; terms under 4 characters are skipped (GDELT answers "The specified phrase is too short."); the headline must name the term |

Watch terms are sent to the Hacker News, GitHub and GDELT searches (the
Watchlist page says so).

### Official announcement feeds

Each answered 200 with RSS/Atom items on Oct 8, 2026 and its robots.txt
allows the feed path (`lib/radar/feeds-catalog.ts`). Live counts are posts
inside the 14-day window.

| Feed | URL | Posts (14 days) |
|---|---|---|
| OpenAI News | https://openai.com/news/rss.xml | 8 |
| Google DeepMind blog | https://deepmind.google/blog/rss.xml | 4 |
| Google — AI (The Keyword) | https://blog.google/innovation-and-ai/technology/ai/rss/ | 3 |
| Google Developers Blog (Gemini API) | https://developers.googleblog.com/feeds/posts/default/ | 0 |
| Google Research blog | https://research.google/blog/rss/ | 6 |
| Meta Newsroom | https://about.fb.com/news/feed/ | 8 |
| Engineering at Meta | https://engineering.fb.com/feed/ | 1 |
| Microsoft Source — AI | https://news.microsoft.com/source/topics/ai/feed/ | 0 |
| Microsoft Research blog | https://www.microsoft.com/en-us/research/feed/ | 5 |
| Mistral AI news | https://mistral.ai/news/rss | 2 |
| Hugging Face blog | https://huggingface.co/blog/feed.xml | 8 |
| NVIDIA blog | https://blogs.nvidia.com/feed/ | 8 |
| NVIDIA Technical Blog | https://developer.nvidia.com/blog/feed | 8 |
| AWS Machine Learning blog | https://aws.amazon.com/blogs/machine-learning/feed/ | 8 |
| Apple Machine Learning Research | https://machinelearning.apple.com/rss.xml | 8 |
| The GitHub Blog — AI & ML | https://github.blog/ai-and-ml/feed/ | 6 |
| Together AI blog | https://www.together.ai/blog/rss.xml | 2 |
| Ollama blog | https://ollama.com/blog/rss.xml (no robots.txt) | 1 |
| Qwen blog | https://qwenlm.github.io/blog/index.xml | 0 |

Checked and **not fetched** (no feed): Anthropic (`/rss.xml`, `/news/rss.xml`,
`/feed.xml` all 404), Meta AI blog (`ai.meta.com/blog/rss/` 404 — Meta's
newsroom and engineering feeds cover its announcements), xAI (404), Cohere
and LangChain (redirect to HTML), DeepSeek (HTML), the Microsoft AI blog
feed (`blogs.microsoft.com/ai/feed/` 410 Gone). lee states nothing about the
terms of sites it does not read; feeds only give title, link, date and a
≤ 500-character excerpt, and every entry links back.

## Live check (Oct 8, 2026)

One-off run of every fetcher with the four starter terms (`Jev`, `Laya`,
`ChatGPT Dots`, `Meta Muse`); network only for this audit, never in tests.
"Matches" counts fetched items whose title or excerpt names a term.

| Source | Items | Jev | Laya | ChatGPT Dots | Meta Muse |
|---|---|---|---|---|---|
| Hugging Face Hub | 40 | 3 | 1 | 0 | 0 |
| HF Daily Papers | 30 | 0 | 0 | 0 | 0 |
| GitHub (topics + terms) | 75 | 16 | 4 | 5 | 10 |
| arXiv | 25 | 0 | 0 | 0 | 0 |
| Hacker News (terms) | 21 | 13 | 3 | 0 | 3 |
| Official feeds | 86 | 1 | 0 | 0 | 0 |
| GDELT (terms) | failed | — | — | — | — |

So yes: three of the four terms match today (Jev on Hugging Face, GitHub,
Hacker News and the Ollama blog; Laya on Hugging Face, GitHub and Hacker
News; Meta Muse on GitHub and Hacker News); ChatGPT Dots matches only in
GitHub repo descriptions. These are counts of mentions, not facts about the
products — lee asserts nothing about them beyond the fetched sources.

GDELT did not answer usefully from this network on the day: connections
timed out (undici's 10 s connect timeout), one request returned 429 ("limit
requests to one every 5 seconds"), `"Jev"` returned "The specified phrase
is too short." (hence the 4-character minimum), and `"ChatGPT Dots"`
returned one article whose headline did not name the term (dropped by the
headline guard). The Radar records such failures per source and retries the
next day.

## Data (migration `0035_ai_radar`, to be renumbered)

| Table | Rows |
|---|---|
| `radar_items` | (user, source, external id) unique: kind, title (≤ 300), url, published and first-fetched dates, excerpt (≤ 500 chars, email addresses removed, DB check), metrics (≤ 1 KB: stars, likes, createdAt, arXiv id, feed id, ≤ 3 related links), matched term ids |
| `radar_entries` | The cross-source cluster: name, kind, cluster keys (GIN), sources, matched term ids, item count, first/last seen, read and saved times |
| `radar_watch_terms` | Term (2–80 chars, unique per user case-insensitively), aliases (≤ 8), kind (term / entity), muted |
| `radar_briefs` | One confirmed brief per entry: sections (≤ 16 KB), sources, timeline, the Learn-this module, prompt version and hash |

`user_profile.radar_notify` (`instant` / `daily` / `weekly` / `off`, default
weekly) and `user_profile.radar_sources_off`.

**Dedup and clustering** (`lib/radar/cluster.ts`): an item already stored
for (source, external id) is never written again. A new item joins the
entry sharing the most strong keys — arXiv id, canonical URL (host + path
+ identifying query, GitHub/HF links reduced to owner/name, tracking
parameters dropped), repo/model name — else the entry of its single
matching watch term, else a new entry. An item matching several terms adds
no term key, so two terms' entries never merge.

**Matching** (`lib/radar/match.ts`): case-insensitive, Unicode word
boundaries (`Jev` matches "jev-latest", never "Jevons"), aliases, and
spaces/hyphens/dots inside a term optional. Muted terms never match.
Changing terms re-matches stored items at once.

**Retention** (`radarItems` step, `lib/db/retention/radar.ts`): items older
than 30 days are deleted unless the item or its entry matches a watch term,
the entry is saved, or it has a brief; entries left empty are deleted too
(unless saved or briefed). Rough size: ~100 new items/day × ~0.8 KB ≈ 2.4 MB
per user at steady state.

## Regular updates

| Mode | Channel |
|---|---|
| instant | Browser notification from the 5-minute poller (`/api/radar/notifiable`) |
| daily | "Radar: new on your watch terms" in the discovery email (which then also goes out on radar matches alone; needs that email on) |
| weekly (default) | The same section in the Monday weekly digest |
| off | Nothing pushed |

The nav badge on Radar always counts unread entries matching an unmuted
term. Digest selection (`selectDigestEntries`): unread, matching a current
unmuted term, seen in the window, newest first, at most 8.

## Grounded briefs (16.1)

On demand from the entry page (`lib/radar/brief/`):

1. **Primary sources** come only from the entry's own items' official URLs:
   an official-feed post, a GitHub README (`raw.githubusercontent.com/…/HEAD/README.md`),
   a Hugging Face model card (`/raw/main/README.md`), an arXiv abstract page.
   News and discussions are never primary. At most 4.
2. **Signal gate:** fewer than 2 candidates, or fewer than 2 fetched with
   ≥ 200 characters of text, → `AISkippedError` (`radar_brief_sources`),
   a skip row in `ai_call_logs`, no model call; the page says "Not enough
   sources for a brief".
3. **Fetching** (`fetch-source.ts`): https only, private addresses refused
   and re-checked on every redirect, robots.txt respected (4xx robots =
   allowed, 5xx/unreachable = not fetched), shared host limiter (arxiv.org
   at its 15 s crawl-delay), 10 s timeout, 1 MB cap, HTML/text only.
4. The model (`radar_brief` prompt v1.0.0, logged in `ai_call_logs` and the
   usage badge) returns sentences per section, each with a verbatim quote
   and a source id.
5. **Verbatim citation check** (`citations.ts`): the quote (20–300 chars)
   must appear in that source's fetched text — only whitespace and
   typographic quote/dash styles are normalised — or the sentence is
   dropped. ≤ 4 sentences per section.
6. **Timeline** (`timeline.ts`) is computed from item metadata (repo
   creation, HF creation, arXiv submission, announcement and first-seen
   dates), never from model output.
7. The draft is HMAC-signed; the user can untick sentences, then confirms.
   Only a correctly signed draft is saved (the timeline is recomputed).

Sections: What it is, Architecture, Workflow, How to use it, Trade-offs &
limits, Security notes, Compared with (names from the user's Radar only).

**Learn this** (`module.ts`): one SM-2 card per filled section in
`academy_reviews` (`radar:<briefId>:<section>`, pseudo-skill `radar`), the
brief as reading, and a Model Arena link for models. See
`docs/playground.md` › "AI Radar cards".

**E2E offline mode:** with the E2E AI fixtures on (never in production),
primary sources are read from the items' own title and excerpt instead of
the network.

## Suggested watches

From CV skills backed by ready evidence only (`backedSkillIds`: marked
interview-ready or named by a fully ready item) and the skill-graph names
of Playground study targets — never the user's own item labels or notes.
Suggestions are added only on click.

## Starter terms

`lib/defaults/catalog.ts` `DEFAULT_WATCH_TERMS` (defaults version 3): the
four terms above, added once and removable. Like the starter sources, they
are owner-tailored; the invite-beta work (`2026-10-08-lee-invite-beta-design.md`
§ owner-tailored data) should make them owner-only. Tests use synthetic
terms.

## Logs

Category `radar` (`lib/logs/catalog.ts`): `radar_source_polled`,
`radar_source_failed`, `radar_watch_changed`, `radar_brief_drafted`,
`radar_brief_skipped`, `radar_brief_source_failed`, `radar_brief_saved`;
`radar_module_created` (playground). Context is source ids and counts —
never terms, titles or brief text.

## Not in 16.0/16.1

Jev/Laya provider work (16.2), the prompt-injection lab (16.3), issue leads
(16.4) and LinkedIn import (16.5).
