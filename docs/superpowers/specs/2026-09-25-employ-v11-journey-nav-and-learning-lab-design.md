# lee — v11 Journey Navigation + Learning Lab

**Date:** 2026-09-25
**Status:** Approved — ready for implementation
**Scope:** Two phases — (A) navigation + journey restructure, (B) Learning Lab
**Depends on:** v1–v10.1

---

## 1. UX audit (current state)

| Problem | Evidence |
|---|---|
| Sidebar overload | 22 items across 5 sections; grouping reflects build order, not usage |
| Mixed concerns in "Pipeline" | Dashboard, Analytics, Applications, Todos, Documents, Merge, Discovery in one list |
| Actions posing as destinations | `Merge` is a verb — belongs as a button on Documents |
| Sub-pages as nav items | Expenses Overview / Budgets / Import take 3 slots — should be tabs |
| Settings scattered | Profile, Integrations, Notifications, Sources are settings; CV and Digest are work surfaces but live beside them |
| No journey | No onboarding, no "next best action", no sense of progression through a job search |
| Dashboard is a widget pile | Needs-attention, sync status, discoveries, funnel, kanban stacked with no hierarchy |
| Playground stranded | One item, no hub, no connection to interview prep |

## 2. Phase A — Journey navigation

### 2.1 The journey model

A job search is a loop, not a list. Navigation follows it:

```
  SET UP ──► FIND ──► APPLY ──► INTERVIEW ──► DECIDE
     ▲                                           │
     └────────────── REFLECT ◄── LEARN ◄─────────┘
```

### 2.2 New sidebar (8 top-level, collapsible)

```
Home                         /                  (journey dashboard)

▸ Find                                          (collapsible)
    Discovery                /discoveries
    Companies                /companies
▸ Apply
    Applications             /applications
    Documents                /documents         (Merge + New LaTeX become header actions)
    Contacts                 /contacts
▸ Plan
    Todos                    /todos
    Digest                   /digest
▸ Insights
    Analytics                /analytics
▸ Learn
    Lab                      /learn             (hub)
    Decisions                /playground/decisions
▸ Money
    Expenses                 /expenses          (tabs: Overview · Budgets · Import)

─────────────── footer ───────────────
Settings                     /settings          (tabs: Profile · CV · AI · Sources · Integrations · Notifications)
[avatar] email
```

22 items → 13 leaf items + 1 settings entry, grouped by journey stage.

### 2.3 Sidebar behaviour
- Each group collapsible; open/closed state persisted in `localStorage` (per-viewer convenience, wrapped in try/catch)
- The group containing the active route auto-expands
- **Rail mode**: a toggle collapses the whole sidebar to a 56px icon rail (tooltips on hover); state persisted
- Mobile: existing Sheet drawer reuses the same grouped component
- Badges: Discovery shows count of `new` discoveries; Todos shows overdue count (single lightweight count query in the layout)

### 2.4 Settings consolidation
- New `/settings` layout with a tab bar: **Profile · CV · AI · Sources · Integrations · Notifications**
- `AI` tab = AI model selector + decision provider selector (moved off the Profile page)
- Existing `/settings/*` routes keep working (they become the tab targets); `/settings` redirects to `/settings/profile`

### 2.5 Expenses tabs
- `/expenses` layout with tab bar: **Overview · Budgets · Import**; routes unchanged

### 2.6 Documents header actions
- `/documents` header gains **New LaTeX CV** and **Merge PDFs** buttons; `Merge` removed from nav (route stays)

### 2.7 Journey dashboard (`/`)
Top-to-bottom hierarchy:
1. **Setup checklist** (only while incomplete) — profile imported · master CV saved · ≥1 source · Google connected · first application. Progress bar + one-click links. Dismissible once complete.
2. **Next best action** — single highlighted card, computed server-side from state in priority order: overdue todo → interview in next 48h without prep pack → completed stage without debrief → follow-up due → high-match discovery unreviewed → "add an application".
3. **Journey strip** — horizontal stage counts: Found (new discoveries) → Applied → Interviewing → Offers, each clickable.
4. Existing widgets below, grouped: *This week* (needs-attention, todos) · *Pipeline* (kanban, funnel) · *Signals* (discoveries, sync status).

### 2.8 Page-level journey cues
- Breadcrumbs on detail pages (`Apply › Applications › Stripe — Senior BE`)
- Each list page empty state points to the previous journey step (e.g. empty Applications → "Find roles in Discovery")

## 3. Phase B — Learning Lab

### 3.1 Goal
A practice surface for interview readiness and ongoing engineering growth — tied into the journey: an upcoming `system_design` stage recommends system-design modules.

### 3.2 Content model (content-as-data, not a page per topic)

```
Track  (e.g. "Concurrency")
  └─ Module (e.g. "Race conditions")
       └─ Exercise[]  (typed)
```

Stored as versioned JSON in `content/learn/<track>/<module>.json` (reviewable in git, no CMS). Adding a topic = adding JSON.

**Exercise types** (each a renderer + grader):

| Type | Runs where | Grading |
|---|---|---|
| `concept` | static card (markdown + diagram) | read-to-complete |
| `quiz` | MCQ / multi-select | deterministic |
| `sql` | **PGlite in the browser** (already a dependency) with a seeded dataset | compare result set to expected |
| `code-js` | Web Worker sandbox (no DOM, timeout) | run hidden test cases |
| `code-py` | Pyodide (WASM, CDN, lazy) | run hidden test cases |
| `bug-hunt` | read a snippet, pick the faulty line(s) + explain | deterministic line match + AI feedback on explanation |
| `simulation` | interactive visualizer (race condition, idempotency, retries) | reach the stated safe end-state |
| `design` | free-text + Mermaid diagram answer | AI rubric grading (signal-gated, logged, rated) |
| `flashcard` | spaced repetition (SM-2) | self-graded recall |

### 3.3 Tracks (initial catalogue)

| Track | Modules (initial) |
|---|---|
| **Coding** | arrays & hashing, two pointers, recursion, complexity analysis |
| **SQL** | joins, aggregation & window functions, indexing & EXPLAIN, transactions & isolation |
| **System design** | URL shortener, rate limiter, notification system, feed; scalability fundamentals |
| **Architecture** | layering, hexagonal/ports & adapters, event-driven, monolith vs services |
| **Software principles** | SOLID, DRY/KISS/YAGNI, simplicity, reusability & shared structure, maintainability |
| **Concurrency & correctness** | race conditions, idempotency, locking & optimistic concurrency, exactly-once myths, retries & backoff |
| **Security** | authentication (sessions, JWT, OAuth), authorization (RBAC, ABAC, IDOR), OWASP Top 10, secrets |
| **Offensive security (sandboxed)** | SQL injection, XSS, IDOR, auth-logic flaws, SSRF — each against a deliberately vulnerable **in-browser** toy app, followed by the fix |
| **Debugging** | reading stack traces, bisection, logging strategy, heisenbugs |
| **DevOps** | CI/CD, containers, observability, deploy strategies, rollbacks |
| **Version control** | branching, rebase vs merge, conflict resolution, bisect, history rewriting safety |
| **Tricks & gotchas** | JS/SQL/HTTP gotchas, floating point, time zones, Unicode |

"Loopholes"/hacking content is **defensive and sandboxed only**: every offensive exercise runs against a toy target inside the browser, never a real host, and ends with the remediation.

### 3.4 Progress + spaced repetition
New tables:
- `learn_progress (user_id, exercise_id, status, attempts, best_score, last_attempt_at)`
- `learn_reviews (user_id, card_id, ease, interval_days, due_at)` — SM-2
- Streak computed from `learn_progress.last_attempt_at`

### 3.5 AI tutor
- "Explain", "Hint", and "Grade my design" via the existing provider abstraction
- Signal-gated (v10): no grading of empty/trivial answers
- Every call logged with `kind='learn_*'`, prompt version, and 👍/👎 (v10/v10.1)

### 3.6 Journey hooks
- Prep pack for a stage → "Recommended practice" list (stage kind → track mapping: `system_design`→System design, `live_coding`→Coding, `tech_screen`→Coding+SQL, `behavioral`→none)
- Dashboard next-best-action can suggest a module when an interview is ≤ 3 days away
- Weekly digest: modules completed + streak

### 3.7 UI
- `/learn` hub — track grid with progress rings, "due for review" count, recommended-for-upcoming-interview row
- `/learn/[track]` — module list
- `/learn/[track]/[module]` — exercise stepper (left: prompt; right: editor/runner/visualizer)
- `/learn/review` — flashcard review queue

## 4. Other feature candidates (backlog, not in v11)
- Offer comparison + negotiation helper (total comp, equity, cost-of-living adjusted using Expenses data)
- Mock interview (Whisper voice in, AI interviewer, rubric scoring)
- ATS match score for a CV against a JD
- Networking cadence (contacts not touched in N days)
- Weekly goals + streaks for applications and learning
- Referral tracker
- Installable PWA with offline read access

## 5. Phasing

**Phase A (v11.0) — Journey navigation**
A1 grouped collapsible sidebar + rail mode + badges · A2 settings tabs + AI tab · A3 expenses tabs + documents header actions · A4 journey dashboard (checklist, next-best-action, journey strip) · A5 breadcrumbs + journey empty states

**Phase B (v11.1) — Learning Lab foundation**
B1 content model + loader + Zod schema · B2 progress + SM-2 tables · B3 renderers: concept, quiz, flashcard · B4 SQL runner (PGlite) · B5 JS worker runner · B6 simulation framework (race condition + idempotency) · B7 AI tutor + design grader · B8 hub/track/module/review pages · B9 prep-pack + dashboard hooks · B10 seed content: SQL, Concurrency, Security, System design, Software principles (≥2 modules each)

**Phase C (v11.2) — More tracks**
Pyodide runner, offensive-security sandbox app, remaining tracks' content.

## 6. Constraints
- Zero cost: all runners in-browser (PGlite, Web Worker, Pyodide via CDN); AI via existing Groq key
- No new paid services; new deps limited to what runners need
- All existing tests keep passing; routes keep working (no broken bookmarks)
