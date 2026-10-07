# Playground: the adaptive engine (phases 13.0 and 13.1)

Spec: `docs/superpowers/specs/2026-09-25-employ-v13-adaptive-engineering-academy-design.md`
(with v17 §0 for the Playground name, §5 for CV evidence and §9 for data).
This page covers what phase 13.0 "Core engine" ships and how it works.

## Content: versioned data, not code

Everything under `content/academy/` is data, validated when it loads
(`lib/academy/content/catalog.ts`) and by `tests/unit/academy-graph.test.ts`:

| File | What |
|---|---|
| `skills.json` | The skill graph: 14 domains, 43 skills, prerequisites (a DAG), `aliases` (exact match on profile skill names and keywords), `textAliases` (whole-word match in highlight text) and descriptors for levels 1–5. |
| `items.json` | Built-in items in two formats, `concept_check` and `predict_output` (one correct choice). At least two per skill, each with a difficulty on the rating scale and a par time. |
| `cards.json` | One concept card per skill for spaced review. |
| `achievements.json` | Achievement rules (`attempts`, `high_scores`, `streak`, `skill_level`, `domains`, `reviews`, `rank`, `placement_done`). |
| `manifest.json` | The pack name and version. **Bump it whenever any content file changes.** |

Validation rejects duplicate ids, unknown domains, missing prerequisites,
prerequisite cycles, items or cards for unknown skills, and out-of-range
answers. Adding a skill means editing JSON and running `pnpm test`.

## Levels and ratings

- Levels: `0 Unassessed · 1 Novice · 2 Beginner · 3 Competent · 4 Proficient · 5 Expert`.
  They come from rating bands (`lib/academy/levels.ts`): below 1200, 1200, 1400, 1600 and 1800.
- Ratings are Glicko-1 (`lib/academy/rating.ts`). Each attempt is a game against the item.
  Deviation shrinks with evidence and grows back with inactivity: a settled skill drifts
  back to full uncertainty in about two years idle.
- Engine version `ACADEMY_ENGINE_VERSION` (`lib/academy/version.ts`). Bump it when scoring,
  rating or selection changes.

## Placement and the readiness flags

Placement reads the master profile (`user_profile.resume`, `lib/resume`) and its
**private** readiness flags. It never writes them (`lib/academy/placement/`).

| Profile item | Effect |
|---|---|
| `interviewReady` (any depth) | Full evidence: the skill is seeded at **Competent**. More independent sources mean lower deviation, never a higher level. |
| `depth: own`, `domainReady` only | Weak evidence: seeded at **Beginner** with high deviation. |
| `ai_assisted` / `learning`, not interview-ready | **Study target only.** It never raises a rating, even when it is domain-ready, because owning the design is not owning the implementation. |
| Work keywords | Count only when that job has an interview-ready highlight. |
| Certificates | Not used: they carry no readiness flags. |

Every seed explains itself and is stored with the rating, for example
"Seeded at Competent from: Cert-Ed (own)".

Seeds apply only to skills with no attempts, because practice outranks the
profile. They are recomputed when the evidence fingerprint changes. An
unpractised seed whose evidence disappears is removed. Every change is
snapshotted in `academy_rating_history` (kind `placement`).

**Diagnostic.** The diagnostic covers up to 6 domains, 2 items each (8–12 in
practice). Domains come in this order:
1. domains of upcoming interviews;
2. domains of profile evidence and study targets;
3. defaults.

Each item aims at about 50% success for the skill's current estimate, so every answer
moves the uncertain rating like a binary search. Diagnostic attempts are
ordinary attempts (`mode = 'diagnostic'`).

**Study list.** The study list is the profile's AI-assisted and learning items. Each one
is mapped to skills, carries its notes and target date, and goes into the daily
plan, earliest target first.

Marking an item interview-ready stays the user's decision. Once the mapped skill
reaches Competent, the hub only *suggests* it, with a link to Settings › Profile
› Study list. Nothing in the Playground sets the flag.

## The daily plan

`lib/academy/selector/` is pure and deterministic. It builds one plan per local
day (the user's time zone). Candidates come in this priority order, and every
item records its reason ("Why this?"):

1. **Placement**, until the placement check is done.
2. **Review**: concept cards that are due.
3. **Interview prep**: stages within 7 days. Stage kinds map to domains (§9):

   | Stage kind | Domains |
   |---|---|
   | `system_design` | system design, performance |
   | `technical` | foundations, data, languages |
   | `tech_screen` | foundations, data |
   | `live_coding` | foundations, languages |
   | `take_home` | quality, backend |
   | `onsite` | system design, foundations, collaboration |
   | `final` | system design, collaboration |
   | phone, recruiter and behavioral screens | collaboration |

   The plan picks the weakest or least-certain mapped skill.
4. **Study list targets**, by target date.
5. **Weak spot**: the lowest assessed rating.
6. **Calibrate**: a skill whose deviation is still high.
7. **Stretch**: the next skill on the path, or a harder item in the strongest skill.

Items are chosen near 70% expected success (60% for stretch) with a
repetition penalty. The time budget and mode (quick, balanced, deep,
interview sprint) cap the plan; it always offers at least one item.

The plan regenerates when its inputs change: day, budget, mode, interviews,
study targets, due cards or placement status. Finished items are always kept.

## Attempts and evaluation

`lib/academy/evaluation/` holds the multi-axis evaluation interface. The axes
are correctness, time vs par, complexity, performance, quality and
effectiveness. An axis a format cannot measure is `n/a` with a reason. The
13.0 choice evaluator scores correctness, time and effectiveness, and
correctness gates the composite.

Choices are shuffled per attempt with a stored seed. The answer reaches the
browser only after submit. Submitting runs in one transaction and counts
**exactly once**. It does the following:
- scores the attempt;
- updates the Glicko rating;
- writes a history snapshot;
- enrols the skill's cards for review;
- ticks the plan item;
- applies XP, streak, rank and achievements.

Every attempt records `content_version` (`academy-core@<manifest version>`),
`engine_version` and its seed (§10.1).

## Gamification

- XP depends on difficulty and composite score, with a small floor.
- Reviews give 1 XP each.
- The streak counts local days with any practice or review.
- Rank (Intern → Principal) comes from how many skills sit at which level, so
  volume alone never raises it.
- Achievements come from `achievements.json`.

## Data model (migration `0031_academy_core`)

| Table | Rows |
|---|---|
| `academy_skill_ratings` | (user, skill): rating, deviation, level, attempts, last practised, placement explanation (≤ 1 KB) |
| `academy_attempts` | Append-only attempts: item, skill, format, mode, plan link, content and engine versions, seed, timings, submission (≤ 1 KB), evaluation (≤ 2 KB), composite, XP, rating before/after |
| `academy_rating_history` | Snapshot after every attempt and placement change |
| `academy_reviews` | SM-2 state per card |
| `academy_plans` | One plan per user per local day (items ≤ 6 KB) |
| `academy_achievements` | Earned achievements |
| `academy_user_state` | XP, rank, streak, time budget, mode, reviews done, placement progress, evidence fingerprint |

All tables cascade on user deletion and are included in `pg_dump` backups.
Exporting them is part of v17 §9.2's "export all my data", which is not built
yet.

## Storage on Neon Free

History is kept forever and **never deleted** to save space.

The retention step `academyHistory` (`lib/db/retention/academy.ts`) compacts rows in place:
- **Attempts older than 180 days** keep every score. They drop per-axis detail
  and improvement text, which can be recomputed from the item, seed and
  submission.
- **Plans older than 60 days** keep what was planned and done. They drop the
  reason text; the reason code stays.

Rough size: 10 attempts a day for five years is about 7 MB, history included.

## Logs

The new `playground` category in `lib/logs` has these events:
- `academy_attempt_submitted`
- `academy_level_up`
- `academy_placement_seeded`
- `academy_placement_completed`
- `academy_plan_generated`
- `academy_achievement_earned`

They log ids and numbers only, never answers, profile text or study notes.

## Surfaces

| Route | Shows |
|---|---|
| `/playground` | The hub |
| `/playground/play/[attemptId]` | The workbench |
| `/playground/review` | SM-2 review |
| `/playground/history` | Timeline |
| `/playground/skills/[skill]` | One skill |
| `/playground/problems` | Problem set, daily problem, pick one for me (13.1) |
| `/playground/problems/[slug]` | The coding workbench |
| `/playground/problems/plans`, `/mock`, `/mock/[id]`, `/stats` | Study plans, mock assessments, coding stats |

Models and Decisions keep their own tabs.

## Phase 13.1: the coding workbench

A LeetCode-style problem set under `/playground/problems`, with every line of
user code run **in the browser**, never on the server.

### Problems: versioned content

`content/academy/problems/` holds the set as typed data modules (one per
topic group) plus `manifest.json` (`academy-problems`, bump on any change)
and `study-plans.ts`. The problems are written for lee: classic ideas, our
own stories, wording, examples and tests. Nothing is copied from LeetCode
or any other site.

- **55 problems:** 49 function problems and 6 SQL.
  - **Topics:** arrays and hashing, two pointers, sliding window, stacks,
    strings, trees, graphs, DP and intervals.
  - **Backend set:** idempotency-key dedup, token bucket, LRU cache, retry
    backoff, ledger reconciliation, webhook signature check, schedule merging,
    JSON flattening, access-log summary, bill splitting, outbox ordering and
    cursor pagination.
- **Each problem has:**
  - a Markdown statement, constraints and visible samples (shown as examples);
  - **hidden tests**, a reference solution (JavaScript or SQL) and its approach;
  - the target complexity, progressive hints, the skill it rates, topic tags
    and role tags (backend, payments, APIs, data).
- **Function problems** declare a signature (`fn`). Starter code for
  JavaScript, TypeScript, Python (snake_case) and PHP is generated from it
  (`lib/academy/problems/starter.ts`). Trees are `{ val, left, right }` objects
  and graphs are `n` plus an edge list. "Design" problems take a list of
  operations, so they are one function in every language.
- **`scale`** declares seeded input generators for the complexity fit
  (`lib/academy/runner/generate.ts`).
- **CI gate** (`tests/unit/academy-problems-content.test.ts`):
  - every reference passes every sample and hidden test in Node (SQL through
    PGlite);
  - every JavaScript starter compiles;
  - every scale generator produces inputs the reference accepts.

### Languages and runners

Each runner is a Web Worker (`lib/academy/runner/workers/`), built from
same-origin bundled scripts and created on the first Run of that language.
One warm worker per runtime is kept, so a runtime loads once per page.

| Language | Runtime | First load |
|---|---|---|
| JavaScript | the worker's own engine | none |
| TypeScript | `typescript`'s `transpileModule` (types stripped, not checked), lazy chunk | ≈ 1 MB, once |
| Python 3.13 | Pyodide 0.29.5 from jsDelivr | ≈ 10 MB, browser-cached |
| PHP 8.3 | `@php-wasm/universal` + `@php-wasm/web-8-3` 3.1.57 (WordPress Playground, maintained) from jsDelivr | ≈ 18 MB wasm (≈ 5 MB compressed), cached; ≈ 5 s cold start |
| SQL (Postgres) | PGlite 0.5.8 from jsDelivr, in memory | ≈ 3 MB |

- **Timeouts:**
  - **Hard timeout:** Run 6 s and Submit 12 s, counted from "runtime ready".
    On expiry the worker is **terminated** (an infinite loop cannot hang the
    page) and the next job starts a fresh one.
  - **Runtime download:** gets 120 s of its own.
- **Memory:** wasm runtimes are bounded by their linear memory. JavaScript has
  no per-worker memory cap in browsers; the timeout and worker termination
  are the guard. Memory is reported where measurable: PHP
  `memory_get_peak_usage`, Chromium JS heap.
- **No network:** after the runtime loads, `lockNetwork()` replaces `fetch`,
  `XMLHttpRequest`, `WebSocket`, `EventSource`, `importScripts`, nested
  workers, `BroadcastChannel` and `sendBeacon` with non-configurable stubs.
  - Dynamic `import()` cannot be removed from a worker, so the JS/TS runner
    rejects it (and `importScripts`) at parse time with acorn.
  - PHP has no TCP-over-fetch and a refusing WebSocket shim.
  - Python can import the standard library only (no `micropip`).
  - **Known residual:** code that builds `import()` through `eval` can still
    reach the network from the worker. It is the user's own code in their own
    browser and session, and it can never reach the server's secrets.
- **Harness** (`js-harness.ts`, `python-harness.ts`, `php-harness.ts`,
  `sql-harness.ts`):
  - calls the user's function with deep-copied arguments;
  - compares outputs with `compare.ts`: deep equality, optional float
    tolerance and unordered top-level/inner arrays per problem; PHP's `[]`
    equals `{}`;
  - SQL accepts one SELECT/WITH per run, inside a rolled-back transaction per
    dataset, and compares column names plus ordered or unordered rows.

### Run, Submit and hidden tests

- **Run:** the samples (plus an optional custom input) in the worker, judged
  in the browser.
- **Submit, step 1 — `beginSubmitAction`:** creates the `academy_attempts` row
  (format `coding`) and returns the judge pack. The pack holds the hidden
  **inputs** only (they must run in the browser), plus the scale generators.
- **Submit, step 2:** the worker runs samples and hidden inputs, then a
  separate timing job at n = 256 … 65 536. The timing job stops early when
  calls get slow.
- **Submit, step 3 — `finishSubmitAction`:** sends the **outputs**. The server
  judges them against the hidden **expected values**, which never leave the
  server, then:
  - fits the complexity curve;
  - scores quality (acorn metrics from the worker for JS/TS, line-based
    metrics on the server for Python/PHP);
  - records everything in one transaction through the 13.0 pipeline:
    rating, history, XP, streak, achievements, plan tick, the submission,
    progress, retention and the daily problem.
- **Verdicts** (`lib/academy/runner/verdict.ts`): the first failing case in
  test order decides.
  - Accepted, Wrong Answer, Time Limit Exceeded, Runtime Error, Compile Error.
  - A failing **visible** sample shows its input, expected value and your
    output.
  - A hidden one is "Hidden case N failed" plus at most the error type (error
    text can echo input values).
- **What never reaches the browser before solving:** hidden expected values
  and the reference solution.
  - The public projection (`lib/academy/problems/public.ts`) is the boundary.
  - `tests/unit/academy-problems-leak.test.ts` checks every problem's public
    view and judge pack.
  - `pnpm check:bundle` checks the client build.
  - The reference unlocks after an accepted submission, or by giving up,
    which is recorded.
- **Trust model:** single user. The browser reports outputs and timings, the
  server judges and scores them. A user can always fool their own scores;
  hidden expectations still never leak.

### Evaluation (`lib/academy/evaluation/coding.ts`)

| Axis | How |
|---|---|
| Correctness | Accepted, or the share of tests passed |
| Complexity | Accepted runs only: timings fitted (least squares on log-log, one constant per model) to O(1) / O(log n) / O(n) / O(n log n) / O(n²); 100 at or under the target, 85 one class over within timer noise (n vs n log n), 60 one class over, 25 worse |
| Quality | Longest function, nesting depth, cyclomatic complexity and single-letter names (acorn for JS/TS; line-based for Python/PHP) |
| Time | Against the problem's par, as in 13.0 |
| Effectiveness | Minus hints opened and earlier wrong submissions |
| Performance | n/a (latency percentiles arrive with the 13.3 simulators) |

- Correctness gates the composite: a rejected submission scores at most 30.
- The Glicko outcome is 1 for Accepted, otherwise at most 0.4 times the pass
  rate.
- Engine version `13.1.0`.

### Extras

- **Daily problem:** one per local day from the adaptive picker
  (`lib/academy/problems/select.ts`, near 70% expected success, unsolved and
  not recent first), fixed once chosen. Solving it extends the daily streak.
  It is also the daily plan's new `coding` item (skipped in Quick mode, and
  inside the time budget like every item).
- **Pick one for me:** the same picker, varied among the best five.
- **Study plans:** Backend interview essentials, Payments & reliability,
  SQL 30, Hard mode; each with a progress bar.
- **Mock assessment:** 2–3 problems, each a step harder, with a 60/75/90-minute
  timer. Submissions are tagged with the mock. The score is weighted by
  difficulty (unsolved counts half its best pass rate) and saved when you
  finish or the timer runs out.
- **Stats:** solved by difficulty, your acceptance rate, a 26-week submission
  calendar (from the append-only attempts), the language breakdown and the
  daily streak.
- **Achievements:** first solve, 10 and 40 solved, daily streaks of 3 and 7.
- **Workbench:** Ctrl+Enter runs, Ctrl+Shift+Enter submits. Drafts are
  autosaved per problem and language in localStorage, and every access is
  try/catch, so it still works when storage is blocked. At phone widths the
  panes stack behind Problem / Code / Result tabs.

### Data (migration `0033_coding_workbench`)

| Table | Rows |
|---|---|
| `academy_problem_progress` | (user, problem): status, submissions, accepted, best runtime and language, hints used, gave-up and first-solved times (≈ 150 B) |
| `academy_submissions` | Code (≤ 16 KB, `octet_length` check), language, verdict, passed/total, runtime, memory, attempt and mock links |
| `academy_daily_problems` | (user, day): problem, solved time (≈ 80 B) |
| `academy_mock_assessments` | Problems, duration, start/end/finish, score, results (≤ 1 KB) |

**Retention:** submissions keep the latest 20 per problem plus the fastest and
the latest accepted ones. The submit path prunes as it goes, and the nightly
`codingSubmissions` retention step catches the rest. Attempts (the scored
history) are never deleted.

### Content-Security-Policy

lee sends **no CSP today**: there is none in `proxy.ts`, `next.config.ts` or
`vercel.json`. So nothing had to change for workers, wasm or the jsDelivr CDN.

If a CSP is added later, the workbench needs:
- `worker-src 'self'`;
- `script-src 'wasm-unsafe-eval'` for Pyodide, PHP and PGlite;
- `script-src https://cdn.jsdelivr.net` (the runtimes are imported as modules
  inside the workers);
- `connect-src https://cdn.jsdelivr.net` (wasm and stdlib fetches);
- `'unsafe-eval'` for the JS runner's `new Function`, ideally scoped to the
  worker scripts' own CSP response header.

COOP/COEP are not needed: no SharedArrayBuffer is used.

### Performance budgets

`pnpm check:bundle` runs after the build in CI.
- It fails if any runner is in a route's initial JS.
- It fails if a Playground route's own initial JS (beyond the shared app
  shell) exceeds 200 KB gzipped.
- It fails if any reference solution text appears in the client output.

At this phase:

| Route | Route-own initial JS (gzipped) |
|---|---|
| `/playground/problems` | 1.5 KB |
| The workbench | 13.7 KB (CodeMirror is lazy-loaded) |
| The shared shell | 215 KB |

E2E (`tests/e2e/problems.spec.ts`) checks that no worker and no CDN request
happen until Run.

## Not in 13.0 (later phases)

- **Shipped in 13.1** (above): the coding workbench (Web Worker runners, hidden tests, complexity fit, quality metrics, Pyodide, PHP, SQL problems).
- **Still to come**:
  - the optimization, refactoring and debugging formats (13.1 scope not yet built);
  - coding items in the placement diagnostic (placement stays choice-based; coding ratings feed the same skills);
  - the SQL lab's EXPLAIN-based efficiency (13.2);
  - the simulators;
  - the system design canvas;
  - incident drills;
  - all formats beyond the built-in choice items.
- **13.S lee Sim** (the discrete-event engine) and **13.F Playground Forge**
  (agents generating and validating content).
- **AI-generated variants and difficulty calibration (13.6)**:
  - `academy_variants`;
  - item difficulty learned from attempts.

  Any future AI use must be signal-gated, prompt-versioned and logged like the
  existing AI calls. 13.0 makes no AI calls.
- Replays (`academy_attempt_replays`), attempt notes, then-vs-now comparisons,
  `/playground/changelog`, `/playground/path`, `/playground/stats` and the
  checkpoint exam.
- CV suggestions from Playground work (v17 §5), data export (v17 §9.2) and the
  skill-gap loop (v17 §4).
