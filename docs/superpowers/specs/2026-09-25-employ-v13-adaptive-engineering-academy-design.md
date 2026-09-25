# Employ — v13 Adaptive Engineering Academy

**Date:** 2026-09-25
**Status:** Approved — ready for implementation
**Supersedes:** v11 Phase B (static Learning Lab)
**Mission:** Develop the user into a complete end-to-end software engineer, from fundamentals to staff-level judgment — adaptively, measurably, never the same session twice.

---

## 1. Principles

1. **Adaptive, not static.** What you see depends on your current level, your weak spots, your upcoming interviews, and what is due for review.
2. **Doing, not filling blanks.** Most activity is building, debugging, designing, operating and defending under realistic constraints.
3. **Measured on multiple axes.** Every attempt is scored on correctness, time, complexity (time + space), performance/latency, code quality, and effectiveness — with specific guidance to improve.
4. **Never the same twice.** Problems are parameterized and regenerated; AI-generated variants are validated before they are served.
5. **Zero cost.** All execution runs in the browser (Web Workers, PGlite, Pyodide); AI via existing free tiers.

## 2. Skill graph

A DAG of competencies spanning the full lifecycle. Each skill has prerequisites and levels **0–5**:
`0 Unassessed · 1 Novice · 2 Beginner · 3 Competent · 4 Proficient · 5 Expert`.

| Domain | Skills (examples) |
|---|---|
| Foundations | complexity analysis, arrays/hashing, linked structures, trees/graphs, recursion/DP, sorting/searching, bit manipulation |
| Languages | JS/TS runtime model, async/event loop, Python, PHP/Laravel idioms, type systems |
| Data | SQL querying, schema design & normalization, indexing & query plans, transactions & isolation, caching |
| Backend | API design (REST/idempotent APIs), auth (authN/authZ), validation, error handling, background jobs, pagination |
| Frontend | rendering model, state management, accessibility, performance (CWV) |
| Concurrency & distributed | race conditions, locking/optimistic concurrency, idempotency, retries/backoff, queues, consistency models, consensus basics |
| Architecture | layering, hexagonal, event-driven, modular monolith vs services, principles (SOLID, DRY/KISS/YAGNI), reusability & shared structure |
| System design | capacity estimation, load balancing, caching tiers, sharding/replication, rate limiting, feeds, notifications, search |
| Performance | latency budgets, p50/p95/p99, profiling, memory, N+1, backpressure |
| Security | OWASP Top 10, secrets, crypto basics, threat modeling; **sandboxed offensive** (SQLi, XSS, IDOR, SSRF, auth-logic) |
| Quality | unit/integration/e2e testing, TDD, code review, refactoring, maintainability metrics |
| Operations | CI/CD, containers, observability (logs/metrics/traces), incident response, rollbacks, SLOs |
| Collaboration | version control (rebase/merge/bisect), estimation, technical writing, design docs, trade-off communication |

Stored as versioned data (`content/academy/skills.json`) — adding a skill is data, not code.

## 3. Level model (adaptive core)

### 3.1 Ratings
- Each **skill** has a user rating (Elo/Glicko-style: `rating`, `deviation`, `lastPracticedAt`).
- Each **exercise variant** has a difficulty rating, calibrated from all attempts.
- Level is derived from rating bands; deviation shrinks as evidence accumulates and grows with inactivity (skill decay).

### 3.2 Placement
Initial ratings seeded from existing data — profile skills, `stack_weights`, years of experience, CV evidence — then refined by a short adaptive diagnostic (8–12 items, binary-search on difficulty per domain).

### 3.3 Adaptive selection
Next exercise chosen to maximize learning value:
- Target success probability ≈ 0.65–0.75 (zone of proximal development)
- Boost: weak skills, skills with high deviation, prerequisites of goals, **skills mapped to upcoming interview stages** (≤ 7 days), items due for spaced review
- Penalize: repetition of the same template, over-practiced skills
- Respect user's daily time budget and mode preference (quick drill / deep session / interview sprint)

### 3.4 Daily plan
Each day: a generated plan of ~3–6 items mixing one stretch challenge, one weakness drill, reviews, and one applied scenario. Regenerates if the user's situation changes (new interview scheduled, streak at risk).

## 4. Evaluation — every attempt, multi-dimensional

```ts
type AttemptEvaluation = {
  correctness: { passed: number; total: number; hiddenPassed: number }   // 0–100
  time: { elapsedSec: number; parSec: number; score: number }            // vs par, not a race
  complexity: {
    measuredTime: 'O(1)'|'O(log n)'|'O(n)'|'O(n log n)'|'O(n^2)'|'O(2^n)'|'unknown'
    measuredSpace: same
    targetTime: …; targetSpace: …
    score: number
  }
  performance?: { p50Ms: number; p95Ms: number; p99Ms: number; throughput?: number; budgetMs: number; score: number }
  quality: { cyclomatic: number; maxFnLength: number; nesting: number; duplication: number; namingIssues: number; score: number; aiReview?: string[] }
  effectiveness: { attempts: number; hintsUsed: number; approachOptimal: boolean; score: number }
  composite: number          // weighted by exercise type
  improvements: string[]     // concrete next steps
}
```

### 4.1 Empirical complexity measurement
Run the user's solution in a Web Worker against generated inputs at sizes `n ∈ {2^8 … 2^16}` (capped by timeout); fit timing curves against `1, log n, n, n log n, n², 2^n` (least squares on log-log with model selection). Space estimated by instrumented allocation counters for arrays/maps/objects in the harness (and `performance.memory` where available). Report measured vs target with a chart.

### 4.2 Performance & latency
Scenario exercises (APIs, caches, queues) run in a simulator producing request-level latencies → p50/p95/p99, throughput, error rate, all compared to a stated budget.

### 4.3 Code quality
Parse submitted JS/TS with a lightweight parser (acorn) to compute cyclomatic complexity, function length, nesting depth, duplication; optional AI review (signal-gated, logged, rateable) for naming, readability, principle violations.

### 4.4 SQL
Correctness via result-set diff; efficiency via PGlite `EXPLAIN (ANALYZE)` cost/rows vs the reference query; index design exercises scored on plan change.

## 5. Exercise formats

| Format | What you do | Scored on |
|---|---|---|
| **Coding challenge** | Solve with hidden tests (JS/TS; Python via Pyodide) | correctness, complexity, time, quality |
| **Optimization** | Given a working but slow solution, make it meet a complexity/latency budget | complexity delta, perf, correctness preserved |
| **Refactoring kata** | Improve design while tests stay green | quality delta, tests green, diff size |
| **Debugging** | Failing program + stack trace/logs → minimal fix | time to fix, diff minimality, regression tests |
| **Code review** | Review a PR; flag bugs, security issues, principle violations | recall/precision of findings |
| **SQL lab** | Queries, schema design, indexing in in-browser Postgres | correctness, plan cost |
| **Concurrency simulator** | Step through interleavings of threads/workers; find the race; apply locking/idempotency; replay | reaching safe end-state, minimal locking |
| **Distributed scenario** | Retries, duplicates, partial failures, queues, cache stampede — tune strategies against a traffic model | error rate, duplicate side-effects, latency |
| **System design canvas** | Drag components (LB, app, cache, DB, replica, queue, CDN) → simulator drives traffic → metrics + cost + SPOF analysis; AI grades trade-off write-up | latency, throughput, availability, cost, rubric |
| **Incident drill (real-time)** | Timed "production is on fire": simulated dashboards, logs, deploy history; run commands, mitigate, find root cause | time-to-mitigate, correct RCA, blast radius, comms |
| **Security CTF (sandboxed)** | Exploit a deliberately vulnerable **in-browser** toy app, then patch it | exploit found, patch correctness, no regressions |
| **Estimation** | Back-of-envelope capacity/cost | error vs reference band |
| **Git scenario** | Real git in the browser (isomorphic-git): resolve conflicts, bisect, recover lost work | end-state correctness, commands used |
| **Flashcards** | Spaced repetition for concepts | recall quality (SM-2) |

**Safety:** offensive exercises target only in-browser sandboxed toy apps; every one ends with remediation.

## 6. Never the same twice

- **Parameterized templates**: each exercise template declares generators (input shapes, constraints, schemas, traffic profiles, incident timelines) → fresh variant each time.
- **AI-generated variants**: the AI proposes a new problem + reference solution + tests; the harness **runs the reference solution against the tests** and checks complexity before the variant is ever served. Failed validation = discarded. Every accepted variant gets a difficulty rating that calibrates from attempts.
- **Adaptive difficulty knobs**: input size, constraints, time budget, hint availability, number of concurrent actors, traffic intensity.

## 7. Gamification

- **XP** per attempt, weighted by difficulty and composite score
- **Engineer rank** (overall): Intern → Junior → Mid → Senior → Staff → Principal, derived from skill-level distribution (not grindable by volume alone)
- **Skill radar** chart; per-domain levels
- **Streaks** (shared core with v12.1), daily quests, weekly challenges
- **Badges/achievements** (e.g. "Found the race", "Sub-linear", "p99 under budget", "Incident commander")
- **Boss battles**: tier capstones combining multiple skills (e.g. design → schema → API → tests → deploy → survive an incident)
- **Personal bests** leaderboard (you vs past you) per exercise family

## 8. Curriculum path ("scratch to end-to-end")

Tiers with gates (level thresholds across required skills) and a capstone each:
1. **Foundations** — complexity, core data structures, SQL basics, git basics
2. **Builder** — APIs, validation, auth, testing, refactoring
3. **Operator** — CI/CD, observability, debugging, incident response, performance
4. **Architect** — system design, distributed correctness, security, trade-offs
5. **Staff** — cross-cutting design reviews, capacity planning, technical leadership scenarios

The user can follow the path or go free-roam; the adaptive engine uses the path as a default goal.

## 9. Integration with the job journey

- Interview stage kind → skill targets (e.g. `system_design` → System design + Performance; `live_coding` → Foundations + Languages; `tech_screen` → Foundations + Data)
- Prep pack shows "Practice plan for this interview" from the adaptive engine
- CV Scoring (v12.0) gaps map to skills → "close this gap" drills
- Mock interview (v12.4) weak areas feed skill deviations
- Dashboard next-best-action can be a practice item when an interview is near
- Weekly digest: rank, XP, streak, skills leveled up

## 10. Data model (new tables)

```
academy_skill_ratings    (user_id, skill_id, rating, deviation, level, last_practiced_at)
academy_variants         (id, template_id, params jsonb, generated_by, difficulty_rating, validated_at, retired_at)
academy_attempts         (id, user_id, variant_id, started_at, submitted_at, submission jsonb, evaluation jsonb, composite, xp_awarded)
academy_reviews          (user_id, card_id, ease, interval_days, due_at)          -- SM-2
academy_plans            (user_id, date, items jsonb, generated_at, reason)
academy_achievements     (user_id, achievement_id, earned_at)
academy_user_state       (user_id, xp, rank, streak_days, last_active_date, time_budget_min, mode)
```
Skill graph, templates and achievement catalog: versioned JSON under `content/academy/`.

## 11. Surfaces

- `/learn` — Academy home: today's plan, rank + XP, streak, radar, due reviews, "for your upcoming interview"
- `/learn/path` — tiered curriculum map with gates and capstones
- `/learn/skills/[skill]` — level, history, recommended next items
- `/learn/play/[attemptId]` — the workbench (prompt · editor/canvas/simulator · live metrics · evaluation panel)
- `/learn/review` — spaced repetition
- `/learn/stats` — trends: composite score, complexity optimality, latency, time-to-solve, quality over time
- Existing `/playground/decisions` stays as a lab tool under Learn

## 12. Phasing

- **13.0 Core engine** — skill graph, ratings, placement (seeded from CV/profile + diagnostic), adaptive selector, daily plan, attempt/evaluation framework, XP/rank/streak/achievements core, Academy home + radar
- **13.1 Coding workbench** — Web Worker runner, hidden tests, empirical complexity fit, acorn quality metrics, optimization + refactoring + debugging formats, Pyodide
- **13.2 SQL lab** — PGlite runner with EXPLAIN-based efficiency, schema/indexing exercises
- **13.3 Simulators** — concurrency interleaving, idempotency/retries/distributed failures with latency percentiles
- **13.4 System design canvas** — component graph + traffic simulator + cost/SPOF + AI rubric
- **13.5 Incident drills + code review + security CTF + git scenarios**
- **13.6 Generation** — parameterized templates everywhere + validated AI variants + difficulty calibration
- **13.7 Path, capstones, boss battles, stats page, journey integrations**

## 13. Constraints
- Zero cost; in-browser execution; strict worker timeouts and memory caps
- AI calls signal-gated, prompt-versioned, logged, rateable; every generated variant validated before use
- Lint 0 errors, typecheck, tests, eval, build all green per phase
