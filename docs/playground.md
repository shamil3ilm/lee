# Playground: the adaptive engine (phase 13.0)

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

Models and Decisions keep their own tabs.

## Not in 13.0 (later phases)

- **13.1+ runners**:
  - the coding workbench (Web Worker runner, hidden tests, complexity fit, quality metrics, Pyodide);
  - the SQL lab;
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
