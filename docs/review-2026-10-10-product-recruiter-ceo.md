# lee review: product design, recruiter, CEO and daily workflow (2026-10-10)

Scope: four perspectives on lee at `main` 7bd17b55. They are a senior product designer (UI/UX), a senior GCC and India tech recruiter, the CEO (product strategy) and the end user's day-to-day workflow. The technical, architecture and scoring-internals review is a separate document.

The user is a backend engineer (Laravel/PHP, payments, e-invoicing/ZATCA, data), Junior–Mid with 2–3 years, based in Kerala. They target the GCC (UAE and Kuwait first), Indian cities and remote work, and need visa sponsorship.

## 0. Method and evidence

| Source | What |
|---|---|
| The user's production screenshot | `/discoveries?tab=jobs&view=board`, 1920 px, light. The subtitle says "886 new" but the New column holds 6 cards, all Careem Dubai non-tech roles. The coverage strip reads "none" three times. The board columns are mostly empty. |
| Local run | `next dev` with the e2e seed (PGlite, fixture AI, test sign-in) on ports 3400/3497–3499. Nothing touched production, and `.env.local` was not read. |
| Screenshots | 156 full-page captures: 26 pages × 390/768/1280 px × light/dark. They are in the session scratchpad at `scratchpad/review-2026-10-10/`, named `<width>-<theme>-<page>.png`, with per-page measurements in `notes.jsonl`. None are in the repo. No page had horizontal overflow at any width. |
| Gate probe | `.e2e/review/probe-gate.ts` and `probe2.ts` (gitignored) ran the real `evaluateRelevance` on the six Careem titles with Careem-style JDs and backend/fullstack targets. Results are in §3.2. |
| Earlier reviews | `docs/ux-audit-2026-10-08.md` (UX re-scored to 7.3 after its fixes) and `docs/review-2026-10-09-engineering-and-recruiting.md` (recruiter 6.2). |

**Caveat.** The seed has India-city preferences, 6 tech jobs and no GCC sources. It cannot reproduce the production inbox, which had 886 rows ingested from a Careem board. Section 3 explains the production symptoms from code and from probes run on the real gate code. It ends with the SQL to confirm them on production. I did not run that SQL, because I was told not to connect.

---

## 1. Scores

| Perspective | Score | Earlier | One line |
|---|---|---|---|
| Senior product designer | **6.3** | UX 7.3 (Oct 8, after fixes) | The components are good, but the composition fails on real data. The board wastes ~70% of its width, the header stack pushes content to y≈455–480, and the sidebar mixes a dev lab into a job app. |
| Senior recruiter (GCC/India) | **5.4** | 6.2 (Oct 9) | Tailoring and honesty are still best-in-class. But the inbox in the screenshot is 100% wrong roles, and a Fit of 52 for an Operations Associate destroys trust in every other number. |
| CEO | **5.6** | — | A strong core (explainable fit, fact-locked tailoring, GCC-aware rules) is buried under feature sprawl: Playground, Radar, Models, Decisions, Expenses, LaTeX. Not ready for a 100-person beta until triage precision is fixed. |
| End-user workflow | **6.2** | — | Prepare → apply is excellent (8). Daily triage, the core loop, is 4.5 when the inbox is noise. |
| **Overall (equal weights)** | **5.9 / 10** | ~6.6–7.3 | Down from the earlier reviews. They judged the seeded build, while this one weighs the production inbox, where precision is the whole product. |

Why the scores dropped: the Oct 8 audit scored seeded tech jobs, where every card is a backend role. The production screenshot shows what a real ATS board does to the inbox. Of ~886 postings, the gate removed ~880 correctly but let 6 non-tech roles through. Those 6 are now *the entire inbox*, with Fit scores of 29–52. A product whose promise is "we find the right roles" is judged by its first screen.

### 1.1 Designer sub-scores (6.3)

| Area | Score | Evidence |
|---|---|---|
| IA and navigation | 5.5 | There are 7 sidebar groups and 17 items (`components/nav/nav-config.ts:44-95`). Playground/Radar/Models/Decisions and Money/Expenses sit next to Applications. At 1280×900 the nav overflows: "Decisions" is clipped under the Settings footer (`1280-light-*.png`, sidebar at y≈795). Shortlist and Discovery›New show the same 6 jobs in two places. Discovery has a "Companies" tab and there is also a separate Companies page. |
| Visual hierarchy | 5.5 | The Discovery header is 5 buttons, a Jobs/Companies tab, the defaults banner, the coverage strip and a filter row. The first card starts at **y≈455 at 1280** (`1280-light-discovery-jobs-board.png`), at **y≈680 on a phone** (`390-light-discovery-jobs-board.png`), and at ~480 in production at 1920. |
| Density | 5.5 | Board cards are ~105 px tall but carry only title, company, place, mode and Fit, with no reason. List rows carry Save/Dismiss/compare/open/expand plus chips. List rows show more information than board cards. |
| Board and list | 4.5 | Board columns get equal widths whatever they hold. Empty Shortlisted and Applied columns take ~2/3 of the width ("Drop a card here" in 11 px). Dismissed is a vertical strip. The "Applied" column is the `saved` status (`components/discoveries-board.tsx:48-53`): moving a card there creates a *Saved* application, not an applied one. The label is wrong. Board cards hide the relevance chips the list shows ("Uncertain fit — review" renders only in `components/discovery-row.tsx:161-170`). The Applications board at 768 shows one column and a sliver (`768-dark-applications-board.png`, "10 total" with 3 visible). |
| Consistency | 7.0 | One Fit badge everywhere (an Oct 8 fix), tokens and dark mode are solid. But the word "Fit" also means CV fit ("Best CV: India · Backend (fit 30)") on Prepare and Shortlist, so one word carries two meanings. |
| Mobile | 6.5 | No overflow on any of 26 pages. The board is a horizontal scroller with the next column peeking, which works, but the header buttons wrap into 3 rows. Résumé settings is 10.6k px on a phone and Search preferences 6.3k px. |
| Accessibility | 8.0 | Axe-clean per the Oct 8 work. Keyboard drag instructions are present. |
| Empty states | 6.0 | "Shortlist promising roles here / Drop a card here" fills a 700 px empty column. Applications/CV Score/Digest pages are a single screen tall. That is fine, but the empty board column should collapse. |
| Copy | 6.0 | "**None coverage**" badge, "**Only 0** Kochi sources switched on" (`lib/coverage/compute.ts:86`), "886 new" (§3.1), "vs current: pay ? · growth ? · benefits ≈" (cryptic), "Applied" for saved. |

### 1.2 Recruiter sub-scores (5.4)

| Area | Score | Evidence |
|---|---|---|
| Relevance precision | 3.5 | In production, 6 of 6 New are non-tech. By design, unknown non-tech titles pass with only a −15 rank penalty (§3.2). |
| Relevance recall | 5.5 | Unknown from production. The gate is careful not to drop tech roles with odd titles ("Payments Operations Technologist" passes on JD skills), which is good. But GCC volume still depends on email alerts for LinkedIn/Bayt/NaukriGulf (Oct 9 finding, unchanged). |
| Fit credibility | 4.0 | Fit for a non-tech job is mostly *context* points: seniority 0–15, region 0–10, work mode 0–5, visa +5, pay +5 (`lib/discovery/match/score.ts:13-33`). A Dubai, senior, on-site role scores 30–40 before any skill matches, and a JD that says "SQL and Excel" adds skill points. So "Operations Associate · Fit 52" is the expected output, not a bug. A recruiter would put it at 5. |
| CV tailoring | 7.5 | Fact-locked ("Every change only picks, orders or re-words what your profile already holds"), shows gaps honestly, adds them to a study list (`1280-light-application-prepare.png`). Weak spots: "Best CV … (fit 30) · Covers 0 of 1 must-haves" gives no next step beyond "Add to study list", and the Photo: Avoid / India-variant logic is good but unexplained. |
| GCC and India realism | 6.0 | Visa, nationals-only, language and relocation rules exist (`lib/discovery/relevance/discovery-prefs.ts:48-57`). Notice periods are collected but "used later in outreach" (`discovery-prefs.ts:143`). Degree attestation, agency-fee scams and allowances (housing/transport/air ticket) remain unmodelled (Oct 9). |
| Outreach | 5.0 | There are contacts, referral hints from the LinkedIn export, and a follow-up todo auto-scheduled after applying. There is no recruiter/agency pipeline and no message drafting tied to a contact plus a job. |

### 1.3 CEO sub-scores (5.6)

| Area | Score | Notes |
|---|---|---|
| Value proposition | 7.0 | "Only roles you can actually get, explained, and a fact-locked CV for each" is a real wedge for GCC-bound Indian engineers. The honesty features (no invented skills, interview-ready flags) are a moat. |
| Focus vs sprawl | 3.5 | 70 routes. Playground (problems, mock interviews, models arena, decisions), Radar (AI news watch), Expenses/budgets, a LaTeX editor and merge, plus Analytics/performance. Each is fine alone, but together they dilute the core loop and the maintenance budget. |
| Invite-beta readiness | 5.0 | Invitees get "no Gmail" (memory), yet Home leads with a "**Gmail not connected** … Connect Gmail" banner (`1280-light-home.png`), which is a dead end for them. The inbox precision problem in §3.2 will hit every non-engineering-heavy board (Careem, Talabat, noon, Emirates NBD). |
| Differentiation | 7.0 | Explainable Fit, GCC rules, Best-CV-per-job and the Prepare flow are not in LinkedIn/Naukri. |

**Cut or hide for the beta:** hide Playground, Radar, Models, Decisions and Expenses behind a "Labs" switch in Settings, off by default. Fold Compare into the discovery detail. Fold Digest into Home's "This week". Merge Discovery›Companies and Companies.

**Top 3 bets:**
1. **Inbox precision ≥ 90%** for the target families: the New lane holds only roles with positive tech evidence, and "Uncertain" goes to a separate Review lane. This is the product.
2. **GCC supply.** Make LinkedIn/Bayt/NaukriGulf/GulfTalent alerts and the 56-employer watch a guided 5-minute setup, led by Kuwait/UAE (the newest commits started this). Show per-country supply, not per-city "none".
3. **Apply-to-interview loop.** The Prepare flow is already the best surface. Add notice period, visa status and an attestation-ready flag to the CV and cover letter, plus a recruiter/agency follow-up track.

### 1.4 Workflow sub-scores (6.2)

| Journey | Score | Steps / friction |
|---|---|---|
| First run | 5.5 | Home "Get set up 5 of 8". Step 1 is "Kinds of role [Backend] Save" plus "All preferences". The Discovery banner "Filtering is using defaults from your profile · Backend · Confirm · Set preferences" repeats the same thing on 3 pages (Home, Discovery, Shortlist). Preferred regions (UAE/Kuwait top) are not part of first run, so the coverage line falls back to the "weakest regions" (§3.3). Gmail connect is presented as a fault. Portfolio sync is in Settings›Portfolio, outside the checklist. |
| Daily triage | 4.5 | Open Discovery → read "886 new" → see 6 → board cards show no reason → open each card or switch to List to see the "Uncertain fit" chip → dismiss. That is 2–3 clicks per card on noise. The Shortlist page shows the same jobs ranked, so the user triages twice. |
| Deciding on one job | 7.0 | "Why this score" sheet, Best CV and the comparison card are strong. The detail page is 3.4k px. "vs current: pay ↑ 265% est." is useful, but "pay ? · growth ?" is noise. |
| Applying | 8.0 | Prepare: 5 numbered steps on one surface (Résumé variant → Tailored CV → Cover letter → Before you apply → Mark applied). Clear "Nothing is sent". |
| Follow-ups | 6.5 | An overdue follow-up is the "Next best action" on Home (good). Todos are separate from the application timeline. |
| Finding companies (Kuwait/UAE) | 6.0 | The Discovery›Companies tab plus the GCC employer watch (56 employers, "0 watched") exist, but they are three places: the Companies page, the Discovery tab and Settings›Sources›Employer watch. |
| Weekly review | 6.0 | Digest, Analytics and the Home funnel overlap and disagree. Home says "2 Applied". The Shortlist "Apply funnel" says "7 Shortlisted → 0 Applied" while its header says "6 to review" (`1280-light-shortlist.png`). Shortlist ranks jump #5 → #7. |

---

## 2. Screenshot problems: root causes

### 2.1 Why "886 new" when the board shows 6

The subtitle is **not an inbox count**. It is the sum of `last_result.new` across sources polled within 24 h of the latest poll:

- `app/(authed)/discoveries/page.tsx:51-54` (`lastCheckedLine`) → `lib/discovery/poll-stats.ts:72-83` (`lastCheck` sums `readSourceLastResult(...).new`).
- `stats.new` counts **rows inserted**, before and regardless of the relevance gate: `lib/discovery/ingest.ts:62-66` (`tallyIngest`) is called at `ingest.ts:118` with `inserted.length`. Gated rows are inserted with `status: 'filtered'` (`lib/discovery/relevance/service.ts:28-39`), and quarantined rows are counted too.
- The New column and the sidebar badge count `status = 'new'`, non-quarantined (`app/(authed)/discoveries/data.ts:170-186` → `countByStatus`, `lib/db/queries/discoveries.ts:571-588`).

So "886 new" means "886 postings fetched for the first time". About 880 of them were filtered on arrival, and 6 reached New. The board isn't hiding anything. The subtitle uses the word "new" for a different number. The seeded build shows the same mismatch in miniature: "5 new" in the subtitle vs 6 in New.

**Fix:** report outcomes, not inserts: "Last checked 5 h ago · 886 fetched · 6 to triage · 880 filtered (see why)". Use `countByStatus` (already loaded for the board) or store `kept`/`filtered` in `SourcePollStats` at ingest.

### 2.2 Why non-tech Careem roles land in New

The board is showing the right status (`new`), so this is not a different filter. The six roles pass the relevance gate. The gate was run on them with the real code (`.e2e/review/probe-gate.ts`, backend/fullstack targets, saved preferences, Dubai):

| Title | Gate | Reason |
|---|---|---|
| Senior Operations Associate – Shops | **pass**, "Uncertain fit — review" (−15 rank) | No domain title matches: `project_ops` lists "operations manager/specialist/coordinator" but not "operations associate". |
| Category Executive | **pass**, Uncertain | No domain knows "category", "assortment" or "merchandising executive". |
| Training & Quality Executive | **pass**, Uncertain | No training/quality domain. |
| Senior Strategy and Care Transformation Manager | **pass**, Uncertain | No strategy/transformation domain. "Care" ≠ "customer care". |
| Account Manager | pass, *or* filtered if the JD says "revenue targets"/"closing deals" | Sales titles include "key account manager" but not plain "account manager" (`domains.ts` sales). |
| Senior Product Designer (Design Systems) | filtered with a pure design JD. **Passes, Uncertain**, when the JD names ≥2 of the user's ready skills (e.g. Git, REST, JavaScript: `probe2.ts`) | The "mixed evidence" branch. |

The code paths:

1. **The role rule never filters non-engineering roles.** `lib/discovery/relevance/gate.ts:168`: `if (!engineering || families.length === 0) return null`. The role rule only rejects *engineering* roles in the wrong family, so all non-tech exclusion falls to the domain rule.
2. **The domain rule filters only on positive evidence, and the default is pass.** `lib/discovery/relevance/domain-rule.ts:70-85`. `strong` needs a domain title word or ≥2 exact duty phrases (`:71`). An unknown title with weak evidence falls through to `:85`: `return { ...PASS, penalty: UNCERTAIN_FIT }`, which passes into New. This is the deliberate "filter by JD evidence, not titles" policy. Its cost is that every unlisted non-tech title gets in.
3. **The mixed branch lets designers in on generic skills.** `domain-rule.ts:83`: a strong domain title plus `overlap ≥ 2` gives Uncertain, not filtered. `skillOverlap` (`:51-57`) counts *any* ready skill, so generic ones (git, rest, sql, excel, javascript) qualify a Product Designer or an Ops Associate who "uses SQL".
4. **Domain vocabulary has gaps for GCC super-app boards** (`lib/discovery/relevance/domains.ts:23-120`): operations associate/executive, category/assortment, account manager, training, quality, strategy/transformation, partner/merchant success, fleet/captain operations, and growth (non-marketing).
5. **The UI hides the signal.** The penalty chip exists but renders only in list rows (`components/discovery-row.tsx:161-170`). Board cards (`components/discoveries-board.tsx:64-99`) show only Fit, so an Uncertain card looks like a normal one.
6. **Fit doesn't reflect the gate.** The badge shows `fitScore` (`discoveries-board.tsx:76-83`). `rankAdjust` (−15) affects only ordering, and with only 6 rows ordering is irrelevant. Fit is mostly context points for a non-tech role (§1.2), hence 52/51/40.

**Why only 6 and all Careem:** the remaining ~880 rows from the same polls were filtered (most Careem titles are drivers, captains, sales and so on, which the domain lists know). The New lane holds whatever *escaped*, and with no GCC tech supply that escape set is the whole inbox.

**Confirm on production** (read-only):

```sql
-- quarantine is a join on job_risk_assessments (lib/db/queries/riskAssessments.ts:181), so it is ignored here
select d.status, d.filter_override, d.relevance_notes->'penalties' as pen, d.title, d.fit_score, s.name as source
from discoveries d join sources s on s.id = d.source_id
where d.user_id = '<you>' and d.status = 'new';
select status, count(*) from discoveries where user_id = '<you>' and created_at > now() - interval '2 days' group by 1;
```

Expect `pen = ["Uncertain fit — review"]` on all six and `filter_override = false`. A `true` would mean "Show anyway" was clicked.

### 2.3 Why the coverage strip says "none" for Qatar, Calicut and Hyderabad

- **Which regions are shown:** `lib/coverage/view.ts:44-49` (`lineRegions`). Starred (top/preferred) regions are shown if any. Otherwise the line shows the **weakest three**, red first. The production profile evidently has no starred regions, so the line shows the three worst regions. That is why UAE and Kuwait, the user's top targets, aren't there. The strip is designed to show the worst news.
- **Why "none":** `lib/coverage/compute.ts:76-80`. The status is red when region-specific sources = 0 **and** yielding = 0 **and** kept = 0. `components/coverage/coverage-line.tsx:11` maps red → "none".
  - Broad sources (Adzuna India, remote boards) count only as `broadSources` and don't change the status.
  - Worldwide sources and email alerts are classed as `setup` (`lib/coverage/source-reach.ts:86`). The line shows only `regionSources`, hence "0 sources" while sources that do reach the region are on.
- **City granularity:** selecting Kerala/Karnataka/Telangana expands into *city* playbooks (`lib/coverage/for-user.ts:35-52`: Kochi, Trivandrum, Calicut, Bengaluru, Hyderabad…). Activity is counted per city via `unnest(region_ids)` (`lib/db/queries/coverage.ts:28-60`), so a Kerala-wide or India-wide posting never counts for "Calicut". Calicut has almost no dedicated boards, so it is permanently red, by construction.
- **Repetition:** the same strip renders on the Jobs list, the board and the Companies tab (`page.tsx`: three `CoverageLine` calls). The local seed shows the identical pattern (Calicut/Hyderabad/Chennai: none).

**Fix:** show starred regions only, and ask for them in first run. Roll cities up to state/country for the line. Count broad and alert sources ("UAE: 4 sources incl. 2 alerts · 12 jobs this week"). Say "no dedicated source" instead of "none". Hide the line when every starred region is green. Keep the full matrix in Settings›Sources›Coverage. Fix "Only 0 X sources" and "None coverage".

---

## 3. Prioritised fix list

Board and Discovery fixes come first. Effort is S (≤½ day), M (1–2 days) or L (more than 2 days).

### P0

| # | Problem | Evidence | Fix | Effort |
|---|---|---|---|---|
| 1 | Unknown non-tech titles enter New by default | §2.2. `domain-rule.ts:85`, `gate.ts:168`. Production: 6/6 New are non-tech | When the user has saved tech targets, a posting with **no positive tech evidence** (title family, tech title, or JD engineering with ≥2 *core* ready skills) gets a new `review` disposition, not `new`. Show it in a collapsed "Needs a look (n)" group under New, never in the New count or badge. Keep "Show anyway" / "Not my field" learning. | M |
| 2 | Generic skills qualify non-tech roles | `domain-rule.ts:51-57,73,83-84`. `probe2.ts` (designer passes on git/REST/JS) | Weight overlap by skill specificity: core stack (php, laravel, mysql, payments, zatca…) = 1, generic (git, rest, sql, excel, javascript, agile) = 0.25. Require ≥2 *weighted* for `jdTech` and for the mixed branch. | S |
| 3 | Domain vocabulary misses GCC super-app roles | `domains.ts:23-120` | Add an `ops_business` domain: operations associate/executive/analyst (non-tech), category/assortment, account manager, partner/merchant success, training, quality (non-QA), strategy, transformation, fleet/captain/courier ops, city launcher. Add "account manager" to sales. Add Careem/Talabat/noon titles to the eval set (`tests/eval`). | S |
| 4 | "886 new" vs 6 | §2.1. `page.tsx:51-54`, `poll-stats.ts:72-83`, `ingest.ts:62-66` | Change the subtitle to "886 fetched · 6 to triage · 880 filtered". Add `kept`/`filtered` to `SourcePollStats`, or reuse `countByStatus`. Link "filtered" to `?status=filtered`. | S |
| 5 | Board cards show no reason; Fit ignores the gate | `discoveries-board.tsx:64-99`, `discovery-row.tsx:161-170`, `match/score.ts:13-33` | Render the first penalty/boost/info chip and the top-1 "why" line on the card. Cap Fit for postings with role = 0 and no tech evidence (e.g. ≤35, "Not your field?"), so a non-tech job never shows a mid-band Fit. | M |
| 6 | Board layout wastes the screen | `1280-light-discovery-jobs-board.png`; production at 1920 | Empty Shortlisted/Applied columns collapse to 64 px drop rails. They expand on drag-over. New gets the remaining width as a 2–3 column card grid. Rename "Applied" to "In pipeline" (it is `saved`, `discoveries-board.tsx:48-53`). Default Discovery to **List** on first visit, with the board opt-in. | M |
| 7 | Coverage strip is alarming, repetitive and misleading | §2.3. `view.ts:44-49`, `compute.ts:76-90`, `coverage-line.tsx:11`, `source-reach.ts:86` | Show starred regions only, rolled up to country/state, counting broad and alert sources. Hide when green. Show it once (the Jobs list), not on the board and Companies tab. Fix "None coverage" and "Only 0". | S |
| 8 | First card at y≈455–480 | Header stack: 5 actions, tabs, defaults banner, coverage, filters | One toolbar row: the [Jobs \| Companies] tab, filters and the view toggle. Move AI Mode and Paste into a single "Add jobs" menu. Merge the defaults banner and coverage into one dismissible notice. Target the first card at ≤ y 280 (desktop) and ≤ 420 (phone). | M |

### P1

| # | Problem | Evidence | Fix | Effort |
|---|---|---|---|---|
| 9 | Dev lab in the job app's nav; nav overflows | `nav-config.ts:79-94`. "Decisions" clipped at 1280×900 | Add a Settings›Labs switch (off by default for invitees) that hides Playground/Radar/Models/Decisions/Expenses. The nav scrolls independently of the footer. | S |
| 10 | Preferred regions are not asked for in first run | Coverage falls back to "weakest" | First-run step 1 gets "Where first?" chips (UAE, Kuwait, Kerala, Remote…) that write `preferredRegions`, and they drive the coverage line, the Discovery default region and Home's supply summary. | S |
| 11 | Gmail banner for invitees who cannot use Gmail | `1280-light-home.png`. Beta policy: no Gmail for invitees | Hide the banner when Gmail is unavailable to the account. Offer "Forward alerts to lee" or the Google Alerts path instead. | S |
| 12 | Shortlist duplicates Discovery›New | Same 6 jobs on both; ranks skip #6; funnel 7 vs "6 to review"; Home says 2 applied vs funnel 0 | Make Shortlist "Top N of New with Prepare buttons", or merge it into Discovery as a "Top picks" section. Number only the visible cards. Use one funnel definition across Home, Shortlist and Analytics. | M |
| 13 | "Fit" means two things | "Best CV … (fit 30)" on Prepare and Shortlist | Rename the CV metric to "CV match 30 · covers 0/1 must-haves". | S |
| 14 | Cryptic comparison chip | "vs current: pay ? · growth ? · benefits ≈" | Hide unknowns. Show only known deltas ("pay ↑ 2.6× est."). Hide the chip entirely without a current job. | S |
| 15 | GCC realism gaps | Oct 9 review and this one | On the CV/cover letter: visa status, notice period and "attested degree" fields. On the scam rules: an agency-fee flag. In Fit: allowances (housing/transport/ticket) read as pay. | M |
| 16 | Applications board at tablet width | `768-*-applications-board.png` | Below `lg`, default to List, or use a stage-tabs layout instead of horizontal columns. | S |

### P2

| # | Problem | Fix | Effort |
|---|---|---|---|
| 17 | Long settings pages (Résumé 7.8k px desktop / 10.6k phone, Search 4.3k / 6.3k) | Section tabs or accordions with a sticky in-page index. | M |
| 18 | Three company surfaces (Companies page, Discovery›Companies, Employer watch) | One Companies area with "Watching / Suggested / All" tabs. | M |
| 19 | Digest, Analytics and the Home funnel overlap | Fold Digest into Home "This week" plus an email. Keep Analytics for trends only. | M |
| 20 | Follow-ups split between todos and the timeline | Show the application's todos inline on its detail and its board card ("Follow up due Oct 12"). | S |
| 21 | Outreach | Contact × job message drafts with referral hints; an agency/recruiter pipeline. | L |

---

## 4. Top 10 (one line each)

1. Send no-tech-evidence postings to a "Needs a look" group, not New (P0-1).
2. Weight skill overlap so git/REST/SQL/Excel can't make a designer or Ops role relevant (P0-2).
3. Add an ops/business domain plus "account manager" to sales; add Careem/Talabat/noon titles to the eval set (P0-3).
4. Replace "886 new" with "fetched · to triage · filtered" (P0-4).
5. Show the reason chip on board cards and cap Fit for non-tech postings (P0-5).
6. Collapse empty board columns, rename "Applied" to "In pipeline", default to List (P0-6).
7. Coverage line: starred regions only, rolled up, counting broad and alert sources, shown once (P0-7).
8. Cut the header stack so the first card is at ≤ y 280 (P0-8).
9. Hide Playground/Radar/Models/Decisions/Expenses behind Labs and fix the nav overflow (P1-9).
10. Ask for preferred regions (UAE/Kuwait) in first run and drop the Gmail banner for invitees (P1-10, P1-11).
