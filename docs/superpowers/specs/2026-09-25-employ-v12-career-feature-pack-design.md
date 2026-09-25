# Employ — v12 Career Feature Pack (CV Scoring first)

**Date:** 2026-09-25
**Status:** Approved — ready for implementation
**Priority order:** 12.0 CV Scoring → 12.1 Weekly goals & streaks → 12.2 Networking cadence + referrals → 12.3 Offer comparison → 12.4 Mock interview → 12.5 PWA
**Depends on:** v1–v11 Phase A

---

## 12.0 — CV Scoring (PRIORITY)

### Goal
Score any CV — generally, or against a specific job — across explainable dimensions, show exactly what to fix, and track the score over time and across tailored versions.

### Inputs
- A CV source: `master_cv`, `tailored_cv`, `latex_cv` (compiled → text), or an uploaded PDF/DOCX
- Optional target: an application's job (`parsedMeta` requirements, tech stack, seniority, description)

### Scoring dimensions

Deterministic dimensions run first (free, instant, explainable). AI dimensions run only if signal checks pass (v10), and are logged, versioned and rateable (v10.1).

| Dimension | Weight (with JD / without) | Method |
|---|---|---|
| **Keyword & skill coverage** | 25 / — | Normalize JD skills + tech stack (synonym map: `postgres`=`postgresql`, `js`=`javascript`, …); match against CV text; report matched / missing / partial |
| **Requirement fit** | 20 / — | AI: for each JD requirement → `met / partial / missing` + evidence quote from the CV (quotes verified to exist verbatim in CV text; unverifiable quotes downgraded) |
| **Impact & quantification** | 15 / 25 | % of bullets containing metrics (numbers, %, $, time, scale); strong action verbs; flags weak openers ("Responsible for", "Worked on") |
| **ATS parseability** | 15 / 20 | Text extractable; single column (heuristic from PDF text order); standard section headings; no tables/images-as-text; contact info detectable; file type |
| **Structure & length** | 10 / 20 | Page count vs seniority, section order, bullet count per role, date consistency/gaps, reverse chronology |
| **Clarity & readability** | 10 / 20 | Bullet length distribution, passive voice ratio, jargon density, repetition, tense consistency |
| **Seniority alignment** | 5 / 15 | Years + scope signals (lead, architect, owned, mentored) vs JD seniority; without JD vs profile seniority |

### Headline scores (what the user sees)

The dimensions above are inputs. The result exposes **eight headline scores**, each `0–100` with a grade, breakdown and its own findings:

| Headline score | Needs a JD | Built from |
|---|---|---|
| **Total Match** | — | Weighted blend of the scores below (becomes **CV Quality** without a JD) |
| **Role Match** | yes | AI requirement fit (verified evidence) + title / responsibility alignment |
| **Skills Match** | yes | Hard-skill coverage — matched / partial / missing, required vs nice-to-have |
| **Experience Match** | yes | Relevant years vs required, seniority, domain/industry fit |
| **ATS Score** | no (richer with JD) | Parseability, standard headings, contact, file type, JD keyword presence |
| **Impact Score** | no | Quantified achievements, action verbs, weak openers |
| **Readability Score** | no | Bullet length, passive voice, tense, repetition, pronouns |
| **Structure Score** | no | Length vs seniority, chronology, gaps, bullets per role, section order |

**Total Match weights** — with JD: Role 25 · Skills 20 · Experience 15 · ATS 20 · Impact 10 · Readability 5 · Structure 5. Without JD (CV Quality): ATS 35 · Impact 30 · Readability 20 · Structure 15. Weights renormalize when a score is skipped (e.g. AI requirement fit signal-gated), and the result states what was skipped and why. Weights are returned with the result so the UI can explain the Total.

Output: headline scores, per-dimension details, and a list of **findings** (each tagged with the headline score(s) it affects):
```ts
type CvFinding = {
  dimension: string
  severity: 'critical' | 'major' | 'minor'
  message: string              // "7 of 12 bullets lack a measurable outcome"
  location?: { section: string; index?: number; excerpt: string }
  suggestion?: string          // concrete rewrite
  autoFixable: boolean         // can be applied to master CV JSON in one click
}
```

### Comparison & tracking
- **Tailoring delta**: score master vs tailored CV against the same JD side by side → "Tailoring raised your score from 64 → 81"
- **History**: every scoring run stored; line chart per CV and per application
- **Batch mode**: score master CV against all active applications → heatmap of fit per role (where to tailor first)

### One-click fixes
- `autoFixable` findings (e.g., rewrite a weak bullet, add a missing keyword to Skills when evidence exists elsewhere) apply to the master CV as a new version, never silently — preview diff first
- Never invent experience: a missing skill with no supporting evidence becomes a finding ("gap"), not an auto-add

### Data model
```sql
create table cv_scores (
  id uuid pk, user_id uuid fk,
  document_id uuid fk null,        -- scored CV document (null for uploaded file)
  application_id uuid fk null,     -- target job (null = general score)
  source_kind text not null,       -- master_cv | tailored_cv | latex_cv | upload
  overall smallint not null,
  grade text not null,
  dimensions jsonb not null,       -- {keyword: {score, weight, details}, ...}
  findings jsonb not null,         -- CvFinding[]
  scorer_version text not null,    -- bump when rules change (comparability)
  ai_call_id uuid fk null,
  created_at timestamptz default now()
);
index (user_id, application_id, created_at desc)
```

### Surfaces
- `/cv-score` page: pick CV + optional application → score → dimension cards, findings list (filter by severity), apply-fix flow, history chart
- Application detail: "CV fit" card with latest score for that job + "Score now" + tailoring delta
- Documents library: score badge on CV rows
- Dashboard next-best-action: "Your CV scores 58 for Stripe — tailor before applying" when applying soon
- Journey checklist: "CV score ≥ 70" as a readiness item

### Evaluation (v10.1 harness)
Eval fixtures: strong CV, weak CV, keyword-stuffed CV, two-column PDF text, missing-contact CV, CV vs matching JD, CV vs mismatched JD. Deterministic dimensions must be exactly reproducible.

---

## 12.1 — Weekly goals, streaks & achievements
- Goals per week: applications sent, outreach sent, learning minutes, exercises completed (user-set, with suggested defaults)
- Streaks: application streak, learning streak (shared gamification core with Learning Lab v13)
- Achievements catalog (first offer, 10 applications, 7-day learning streak, CV ≥ 85…)
- Dashboard widget + weekly digest section

## 12.2 — Networking cadence + referral tracker
- Per-contact cadence (e.g., recruiters every 14d, mentors monthly); "going cold" list
- Last-touch computed from activities (email sync, outreach docs, manual log)
- Referrals: `referrals` table (contact, company, application, status: asked → agreed → submitted → outcome); referral-sourced conversion in analytics

## 12.3 — Offer comparison
- `offers` table: base, bonus, equity (grant, vesting, strike/valuation), sign-on, benefits, location, remote, start date, deadline
- Normalized annual total comp (currency conversion via static table, user-editable)
- Cost-of-living adjustment using **your actual Expenses data** (monthly burn) → "net monthly savings" per offer
- Weighted decision matrix (comp, growth, team, stack fit, commute, visa) + negotiation helper (AI drafts counter using competing offers; signal-gated)

## 12.4 — Mock interview
- Modes: behavioral, technical Q&A, system design walkthrough
- Voice in via Groq Whisper (existing), AI interviewer asks follow-ups based on answers + CV + JD
- Per-answer rubric: structure (STAR), relevance, depth, conciseness, filler-word rate, speaking pace (words/min from transcript timing)
- Session report + links weak areas to Learning Lab skills

## 12.5 — PWA
- Installable manifest + service worker; offline read of dashboard, applications, documents list; queued quick-adds sync when back online

## Constraints
- Zero cost (existing Groq/Gemini free tiers, in-browser processing)
- Every AI dimension signal-gated, prompt-versioned, rated
- All suites green: lint (0 errors), typecheck, test, eval, build
