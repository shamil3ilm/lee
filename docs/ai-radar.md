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
at least one unmuted term. What's new (below) runs for every account from
one shared fetch. Radar › Refresh now queues the same jobs at most
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

## What's new (discovery without watch terms)

Radar › **What's new** (`/radar/new`, `lib/radar/new/`) finds notable new
models, tools, releases, papers and launches **without** watch terms. The
watched-terms feed stays its own tab (Radar › Feed).

### Shared fetch, per-user ranking

- **One fetch per source per day for every account.** The cron schedule
  route queues six global jobs (`radar-new:source`, `userId` null,
  idempotency key `radar-new:all:<source>:<day>`, priority 64), due two
  hours after the daily schedule so the job-search work drains first
  (`lib/radar/new/schedule.ts`). They skip under the free-tier throttle.
  Tokens are the deployment's optional env keys (`GITHUB_TOKEN`,
  `HF_TOKEN`), never a user's saved key.
- **Stored once.** `radar_new_entries` and `radar_new_items` (migration
  `0038_radar_whats_new`) have **no user id** and hold public facts only:
  names, links, dates, counts, licence, parameter count, base model,
  versions. Excerpts ≤ 500 characters, metrics ≤ 1 KB, tags ≤ 16 (DB
  checks). Dataset cards are never stored (only metadata tags), because
  they can carry contact details.
- **Ranked per user at read time.** `loadWhatsNew` reads at most 600
  candidates in the period and ranks them in memory with the user's
  profile (`lib/radar/new/personal.ts`). Nothing personal is written to
  the shared rows. Sources the user switched off in Radar › Sources are
  hidden here too.

**How this fits the invite-beta plan.** The plan in
`docs/superpowers/specs/2026-10-08-lee-invite-beta-design.md` (§4.4,
`source-fetch:shared` plus per-user filter-and-score) is the same shape:
What's new is the first shared fetch already built. It is a global job per
source, a user-independent table of public data, and per-user scoring with
no per-user rows. It costs six jobs a day whatever the number of accounts,
and no source sees more than one daily request set from lee. The per-user
watched-terms jobs (`radar-source:user+source`) remain per user, because
they search for each user's own terms. Those jobs could later read these
shared rows for the general (non-term) sources.

### Sources and terms

| Source | What | Endpoint | Terms and limits | Per day |
|---|---|---|---|---|
| Hugging Face Hub | Models, Spaces and datasets **created in the last 14 days**, from the trending lists, with licence (`license:` tag), parameter count (`safetensors.total`), pipeline and base model (`base_model:<relation>:<id>` tags) | `huggingface.co/api/{models,spaces,datasets}?sort=trendingScore&expand[]=…` | Public API, 500 requests / 5 min (header `RateLimit-Policy`); 1 s spacing | 3 requests (100 models, 50 Spaces, 50 datasets) |
| HF Daily Papers | Papers with ≥ 5 upvotes, top 20 | `huggingface.co/api/daily_papers` | Public API | 1 request |
| GitHub | Repos **created in the last 30 days** with the most stars, 13 queries: agents, llm, inference, mcp, developer-tools, database, framework, laravel, PHP, TypeScript, Python, analytics, security; `fork:false archived:false` plus a star floor per query | `api.github.com/search/repositories?q=… created:>… stars:>=…&sort=stars` | GitHub API terms; Search 10/min unauthenticated (30 with a token); 6.5 s spacing; a 403/429 stops the run | 13 requests |
| Releases | New release **cycles** in the last 30 days, with their latest version and EOL dates; plus non-prerelease **x.y.0** GitHub releases | `endoflife.date/api/v1/products/<slug>`; `api.github.com/repos/<repo>/releases` | endoflife.date: free, no key, MIT-licensed data, `robots.txt` allows all, no published rate limit (lee: 1 s spacing, one request per project a day). GitHub REST: 60/h unauthenticated | ≤ 30 projects (the union of every user's list) |
| Hacker News | "Show HN" and "Launch HN" with ≥ 40 points in the last 7 days, tech only (Launch HN always counts); stories linking an **arXiv** paper with ≥ 30 points | `hn.algolia.com/api/v1/search?tags=(show_hn,launch_hn)`; `…/search?query=arxiv.org&restrictSearchableAttributes=url` | Algolia HN API, free, 10,000/h | 2 requests |
| Official feeds | Launch posts from the 19 lab feeds above | (the feeds above) | As above | 19 requests |

arXiv submissions are not listed one by one. arXiv papers reach What's new
through HF Daily Papers (upvotes) or HN discussion (points), and both
cluster by arXiv id.

**Checked and skipped: OpenRouter's public model list**
(`openrouter.ai/api/v1/models`). Its Terms of Service forbid using
"scripts, robots or any other means … to scrape or copy any information on
the Site or the Services", and nothing carves out the public list.
Hosted-model launches come from the official lab feeds instead.

### Launch detection (official feeds)

`lib/radar/new/launch.ts` uses heuristics only, never a model call:

- **A launch** has a lead ("Introducing", "Announcing", "Meet") or a launch
  verb ("now available", "release", "launches", "rolling out",
  "open-sourcing"). A versioned name ("GPT-6", "Mistral Large 4") counts
  together with a verb anywhere in the post. Posts framed as "how we",
  "case study", "webinar" and similar are not launches.
- **A model** is a launch with a versioned name or the word "model". A
  `v1.0`-style name is software unless the post says "model".
- **Openness.** A launch is `proprietary` unless the post links to a
  Hugging Face model repo (the feed parser now keeps up to three
  huggingface.co/github.com links from the post HTML) or says open weights,
  "open-sourcing … model", or Apache 2.0 / MIT.

### Novelty, dedup and spam

- **New** means lee sees the entity (model id, repo, `release:<project>@<version>`,
  arXiv id, HN story, post) for the **first** time, **and** its own
  creation date is inside the source window: Hub 14 days, papers 14,
  GitHub 30, releases 30, HN 7, feeds 14. An old project that trends again
  is not new. A new release of an old project is new, because the version
  is in its key.
- **The same item again** (same source and external id) only refreshes its
  counts (likes, stars and points keep growing). It never adds a row.
- **Cross-source corroboration** reuses the Radar clustering keys (arXiv id,
  canonical URL, repo/model name) plus `entity:<key>`. An HN Show post
  linking a new repo joins the repo's entry, and a model's paper joins the
  model. The strongest category leads: model, then release, paper, tool,
  news.
- **Variants.** Quantisations, fine-tunes, adapters and merges of a base
  model that is itself new fold under it as "+N variants", following
  chains to the root. Quantisations of an **older** base are dropped as
  repackaging. Fine-tunes and adapters of an older base stand alone, with
  the base named.
- **Spam and NSFW guards.** Minimum likes (models 20, Spaces 20, datasets
  10) and stars (per query). Forks, archived repos and mirrors are
  dropped. The tags `not-for-all-audiences`/`nsfw` and obvious adult or
  spam words drop an item.
- **Cap.** At most this many new rows per source per UTC day, strongest
  traction first: Hub 60, GitHub 60, releases 30, HN 30, feeds 30,
  papers 20.

### Ranking (`lib/radar/new/rank.ts`)

```
score = 100 × (0.35·traction + 0.15·corroboration + 0.20·authority + 0.20·relevance + 0.10·freshness)
```

- **traction** (0..1, log-scaled): early velocity. This is Hub likes or
  GitHub stars per day since creation, HN points, or paper upvotes. It is
  0.5 for releases and official posts.
- **corroboration**: (sources − 1) / 2, capped at 1.
- **authority**, from the best source: official lab post 1.0, release 0.9,
  HF Daily Papers 0.7, Hub model 0.6, GitHub 0.5, HN 0.4, Hub Space or
  dataset 0.3.
- **relevance** (0..1, `lib/radar/new/relevance.ts`), matched on word
  boundaries with the Radar matcher:
  - ready skills (0.5);
  - the study list, as the Playground targets' skill-graph names (0.4);
  - the release list (0.4, releases only);
  - role families' topics (0.3; e.g. payments → payments, billing,
    invoicing; LLM integration → llm, rag, agents, mcp).

  Names under 3 characters ("Go") only match exact tags.
- **freshness**: 1 − age / 30 days.

Every factor that lifts an entry shows as a chip: "Laravel · ready skill",
"Payments · role family", "120 likes/day", "On 2 sources", "Official lab
post", "New this week".

### Release list

`lib/radar/new/projects.ts` lists 30 projects (Laravel, PHP, Symfony,
Livewire, Filament, Next.js, React, Vue, Angular, TypeScript, Node.js,
Tailwind, Vite, Playwright, Drizzle, Supabase CLI, PostgreSQL, MySQL,
MariaDB, Redis, MongoDB, Python, Django, Go, Rust, .NET, Java, Spring Boot,
Docker, Kubernetes). Each endoflife.date slug was checked on Oct 8, 2026;
TypeScript, Vite and Supabase have none, so they use GitHub releases.

A user's list is derived from the ready skills, study list and role
families until they edit it in Radar › Sources › "Releases in What's new"
(`user_profile.radar_release_projects`; null means derived). The shared
fetch takes the union of every user's list, most-followed first, capped at
30.

### Surfaces

- **Radar › What's new** has sections per category (Models, Tools & repos,
  Releases, Papers, News), with the top 6 each and "All N" links. Filters:
  category, model type (LLM, multimodal, vision, speech, embedding, code),
  period (today, week, month), relevant to me, open source only.
- **Watch this** adds the entry's name as a watch term (kind `entity`). The
  user's daily term sources then search for it.
- **Save** and **Brief & learn** copy the entry into the user's own Radar
  (`radar_entries`/`radar_items`) with the key `new:<shared id>`. This
  reuses an entry the user already has for it, and is idempotent. Brief &
  learn opens the entry page, where the grounded brief rules apply
  unchanged: ≥ 2 primary sources, verbatim citations, a timeline from
  metadata (releases add "Released (version)"). Learn this works from
  there.
- **Weekly digest**: a "What's new this week" section with the top 3 per
  category by the user's own ranking, among entries first seen that week.
  It goes in the Monday digest in every radar mode except `off`.
  Instant/daily notifications stay for watch-term matches only, so new
  things never page anyone.

### Retention (`radarWhatsNew`, global step, `lib/db/retention/radar-new.ts`)

Shared entries first seen more than **60 days** ago are deleted, with their
items, unless someone keeps them:

- **saved**: a user's own entry opened from it (`new:<id>` key) is saved;
- **briefed**: that entry has a brief;
- **watched**: a user watches a term equal to its name.

An entry that was only opened, with no saved brief, does not keep it. The
user's own copies follow the Radar's 30-day rule.

Rough size: about 150 new entries and 200 item rows a day × ~0.7 KB ≈
0.25 MB a day. That is ≈ 15 MB at the 60-day steady state for the whole
deployment, not per user.

### Logs

These events are in category `radar`:

- `radar_new_polled`, `radar_new_failed`: source and counts only;
- `radar_new_profile_failed`;
- `radar_new_action` (`watched`, `saved`, `opened`, `releases_edited`,
  `releases_reset`);
- `radar_new_digest_failed`.

### Live check (Oct 8, 2026)

`scripts/radar-new-live.ts` ran every fetcher once against a throwaway
PGlite database (network only for this audit, never in tests). It ran four
times between 12:30 and 13:30 UTC while the relevance and launch rules
were tuned:

- The counts and the Models, Releases, Papers and News lists are from the
  last run.
- The last run's GitHub searches hit **HTTP 403** (GitHub's secondary
  limit, after the earlier runs' 39 searches in the hour). The fetcher
  stopped there, as designed. The GitHub figures and the Tools list are
  from the previous run (13 queries, before the 403).

Names and links below come from the sources as fetched.

| Source | Fetched | New entries | Joined another entry | Variants folded |
|---|---|---|---|---|
| Hugging Face Hub | 66 | 50 | 2 | 3 |
| HF Daily Papers | 20 | 20 | 0 | 0 |
| GitHub (previous run) | 105 | 59 | 1 | 0 |
| Releases (10 projects) | 2 | 2 | 0 | 0 |
| Hacker News | 25 | 24 | 1 | 0 |
| Official feeds (launches) | 10 | 10 | 0 | 0 |

| Category | Entries |
|---|---|
| Models | 33 (28 open, 5 proprietary) |
| Tools & repos | 85 (previous run, with GitHub) |
| Releases | 2 |
| Papers | 23 |
| News | 21 |

No release cycle in the list started in the last 30 days (endoflife.date).
Both releases are GitHub minor releases.

**Top 5 per category** (generic ranking, before personal relevance):

- **Models, open:**
  - [d1-3B](https://huggingface.co/LiquidAI/d1-3B)
  - [GEV-26B-Decide](https://huggingface.co/autotrust/GEV-26B-Decide)
  - [JEV-27B-VL](https://huggingface.co/autotrust/JEV-27B-VL)
  - [clef](https://huggingface.co/Cloudflare/clef)
  - [VisionHOPE](https://huggingface.co/PSRben/VisionHOPE)
- **Models, proprietary:**
  - [Claude Haiku 5.5 on AWS](https://aws.amazon.com/blogs/machine-learning/introducing-claude-haiku-5-5-on-aws/)
  - [Mistral Large 4](https://mistral.ai/news/mistral-large-4/)
  - [GPT-6](https://openai.com/index/gpt-6-for-everyone)
  - [GPT-6 Astra](https://blogs.nvidia.com/blog/gpus-openai-gpt-6-astra-ultrafast/)
  - [Gemini 3.8 Live with Live Avatar](https://deepmind.google/blog/introducing-gemini-38-live-with-live-avatar/)
- **Tools & repos** (previous run):
  - [shaders](https://github.com/shader-effects-inc/shaders)
  - [golive-skill](https://github.com/mikehasa/golive-skill)
  - [AIHOT](https://github.com/KKKKhazix/AIHOT)
  - [jevgrep](https://github.com/dzhng/jevgrep)
  - [omnirush-gui](https://github.com/omnirush-ai/omnirush-gui)
- **Releases:**
  - [Next.js 16.4](https://github.com/vercel/next.js/releases/tag/v16.4.0)
  - [React 19.3](https://github.com/react/react/releases/tag/v19.3.0)
- **Papers:**
  - [Recursive Game Creator](https://huggingface.co/papers/2610.08621)
  - [DecepEval](https://huggingface.co/papers/2610.07967)
  - [RunningTab](https://huggingface.co/papers/2610.10444)
  - [Long-WAM](https://huggingface.co/papers/2610.10528)
  - [GRACE](https://huggingface.co/papers/2610.10524)
- **News:**
  - [Bigwords.page](https://news.ycombinator.com/item?id=49994443)
  - [Agent.reviews](https://news.ycombinator.com/item?id=49995539)
  - [AI search for every photo and every frame of video on macOS](https://news.ycombinator.com/item?id=49952111)
  - [Made an open-source Lego AI generator](https://news.ycombinator.com/item?id=49937916)
  - [Audionaut](https://news.ycombinator.com/item?id=49931031)

**Relevant to me** (the owner's context, mirrored for this audit from
skills already public on the portfolio, kept out of the repo):

- ready skills: Laravel, PHP, Next.js, TypeScript, React, Angular,
  Supabase;
- role families: backend, full-stack, payments, e-invoicing, ERP,
  API integration, data analyst, LLM integration;
- the derived release list.

| Item | Reasons |
|---|---|
| [shaders](https://github.com/shader-effects-inc/shaders) | TypeScript · ready skill, React · ready skill, LLM integration · role family, 361 stars/day |
| [golive-skill](https://github.com/mikehasa/golive-skill) | TypeScript · ready skill, Backend · role family, Payments · role family, 83 stars/day |
| [AIHOT](https://github.com/KKKKhazix/AIHOT) | TypeScript · ready skill, LLM integration · role family, 699 stars/day |
| [open-instinct](https://github.com/mariagorskikh/open-instinct) | TypeScript · ready skill, LLM integration · role family, 53 stars/day, New this week |
| [Next.js 16.4](https://github.com/vercel/next.js/releases/tag/v16.4.0) | Next.js · ready skill, Next.js · your releases, Official release, New this week |
| [React 19.3](https://github.com/react/react/releases/tag/v19.3.0) | React · ready skill, React · your releases, Official release |
| [DecepEval](https://huggingface.co/papers/2610.07967) | LLM integration · role family, 56 upvotes, New this week |

These rows show how the ranking used the owner's profile. They say nothing
about the products themselves beyond what the sources publish.

## Not in 16.0/16.1

Jev/Laya provider work (16.2), the prompt-injection lab (16.3), issue leads
(16.4) and LinkedIn import (16.5).
