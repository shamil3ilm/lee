# lee: engineering, architecture, CTO and scoring review (2026-10-10)

Review of local `main` at `7bd17b55`. Read-only: no app code was changed. Personas: senior engineer, software architect, CTO, plus a deep audit of every score lee shows. All job postings below are **synthetic** (written for this review, modelled on public Careem-style wording); no personal data or production rows were read. Production was not contacted and `.env.local` was not read.

Scores in this file were measured with lee's own code: `tests/eval/discovery-match.ts` (`runDiscoveryMatchFixture`, the same path `pnpm eval` uses) driven by a scratch probe script with synthetic profiles and postings, run under `tsx`.

## Executive summary

| Perspective | Score | One line |
|---|---|---|
| **Scoring system** | **5.1 / 10** | Explainable and well engineered, but not calibrated: about 35–45 of the 100 points do not depend on what the job *is*, so a non-tech Dubai role with zero matching skills lands at 42, and with two generic skills (Excel, SQL) at 62–73, above a real Senior Go backend role (53). |
| **Senior engineer** | **7.0 / 10** | Solid, typed and well tested: about 3,460 unit and integration cases, 118 e2e tests, 5 CI jobs and a real-Postgres smoke. The 10-09 security debt is mostly paid (SSRF resolve-then-check, token vault, Next 16.3.8). Still open: no backups, no `statement_timeout`, and silent catches up from 49 to 74. |
| **Software architect** | **6.5 / 10** | The queue (SKIP LOCKED, idempotency, dead letters, HMAC worker) and the outbound fetch layer are excellent. But match and relevance import each other, the score columns are named backwards, the default sort cannot use an index, and every posting is stored once per user. |
| **CTO** | **5.5 / 10** | Fine for one user, not ready for 100. Invite gating does not exist, and the cron budget is 4–16× short. The feature freeze was ignored (+31k lines and 9 new domains in 3 days) while the core ranking still promotes non-tech roles. Bus factor 1. |

Compared with the 2026-10-09 review (engineering 6.6): the same perspective now scores **7.0** (+0.4). Security rose from 6.0 to 7.5 and testing from 7.0 to 7.5. Process and focus did not improve: the deploy gate is not enforced and there was no freeze. Of the 11 fixes tracked from 10-09 (its top 10 plus constant-time cron auth), 3 are fully done, 3 partial and 5 open (§2.0). The earlier review never probed non-tech titles. That gap is why the main finding of this review was missed then.

**Root cause of the Careem roles (short version).** Three things stack up:

1. **The gate fails open by design.** The titles "Operations Associate", "Category Executive" and "Training & Quality Executive" are in no non-tech domain list. The domain rule therefore never has "positive evidence of an unrelated field". It passes them with an "Uncertain fit — review" chip (`lib/discovery/relevance/domain-rule.ts:85`). That chip only moves the sort (−15 rank). The row still has status `new`, so it lands in the New column.
2. **The Match Score treats them as software jobs.** Two generic business words in the JD (Excel + KPIs, dashboards or reports) make `familiesFromEvidence` read the posting as "Data Analyst" (`roles.ts:367`). One mention of SQL makes it read as "Backend", because `'sql'` is in `BACKEND_SKILLS` (`roles.ts:23`). As a result:
   - `roleComponent` gives 7/10, labelled "general software engineering", to a Category Executive (`match/role.ts:57-61`), or 8/10 "Backend (from the JD, new title)" to an Operations Associate.
   - `score.ts:47` marks the posting as a tech role.
3. **About 40 points do not depend on the role:**
   - seniority: 15 when the years fit;
   - region: 10, +5 for a starred region;
   - work mode: 5 when the preference is "any" (`fit.ts:135-136`);
   - visa: up to +5;
   - domain: +5 because Careem's "About us" boilerplate says "payments" or "wallet" (`signals.ts:118-131`).

   On top of that, generic skills (Excel, SQL, KPI dashboards) count as stack requirements, and with only 2–3 requirements, one hit is worth 18–23 of 35 points.

   These Match Scores (62–69) are then averaged 50/50 with a low AI score (`blend.ts:22`). That gives the 31–52 seen in production. For example, Match 69 with AI 35 gives 52.

The fix is not one more domain word. Add a **role-relevance ceiling** next to the language and title-only ceilings, scale the context components by role relevance, and stop JD-only family inference from generic business words. See P0-1 to P0-4.

---

# Part 1: Scoring audit

## 1.0 Inventory: every score lee computes or shows

| Score | Where computed | Where shown / used | Stored as |
|---|---|---|---|
| Match Score (deterministic, 0–100) | `lib/discovery/match/score.ts:45` | Card "Fit", "Why this score" popover, sort | `discoveries.fit_score`, `fit_detail`, `fit_key` |
| AI score (0–100) | `lib/ai/prompts/score-job` + `applyCaps` `lib/discovery/scoring.ts:13` | Popover "AI 80", blend input, **notifications and weekly digest on their own** | `discoveries.match_score` |
| Fit (blend + ceiling + growth nudge) | `blend.ts:18-39`; SQL twin `blendedSql` `lib/db/queries/discoveries.ts:287` | Card badge, bands, "Match" sort, min-score filter | computed |
| Relevance gate (pass / filtered + chips + `rank_adjust`) | `lib/discovery/relevance/gate.ts:188` | New vs Filtered, chips, sort nudge (−60…+20) | `status`, `filter_reason`, `relevance_notes`, `rank_adjust` |
| Benefits score, "Combined" sort | `scoring.ts:113`, `discoveries.ts:325-330` | Benefits sort; Combined = **default** sort | `benefits_score` |
| Best CV / cv-fit, CV Score | `lib/cv-fit/*`, `lib/cv-score/*` | Best-CV chip, CV Score page | `best_cv`, `cv_scores` |
| Company fit, hire likelihood, company growth | `lib/company-discovery/fit.ts`, `hire-likelihood.ts`, `growth/*` | Companies tab; growth nudge on Fit (opt-in) | company rows, `discoveries.company_growth` |
| Shortlist rank | `lib/apply/rank.ts` | Daily shortlist order | computed |
| Scam Shield | `lib/scam/engine.ts` | Risk chip, quarantine | `risk_*` columns |
| Reputation | `lib/reputation/*` | Company reputation card, shortlist rank input | reputation rows |

The secondary scores (benefits, cv-fit, CV score, company, growth, shortlist, Scam Shield, reputation) are covered in §1.8.

## 1.1 Match Score: component by component

The total is a plain sum, clamped to 0–100 (`score.ts:63-67`). It is versioned `m4` (`version.ts:12`).

| Component | Range | What it measures | Right thing? | Weight basis | Problems found |
|---|---|---|---|---|---|
| Skills | 0–35 | Weighted share of JD skills the ready profile covers (must 2, mentioned 1, nice ½; concepts; ½ for siblings) (`skills.ts:82-85`) | Yes for tech roles | Arbitrary (no labelled data; `docs/match-score.md:24` states the rule, not why) | **No small-sample shrinkage.** 1 of 2 requirements met gives 18–23/35. **Generic business skills count as stack** (Excel, "KPI dashboards", spreadsheets: `lexicon.ts:39,49`), so ops JDs match a data-flavoured profile. No-stack tech JD gives a neutral 18 (`skills.ts:20,74-75`). |
| Responsibilities | 0–10 | Share of duty lines naming a ready skill **or sharing 2 content stems with any ready line** (`coverage.ts:31-38,79-82`) | Partly | Arbitrary | Re-counts the same skills as the Skills component (double count). The 2-stem overlap is lexical ("manage", "team", "process"). "Not stated" with a full JD gives 5 free points (`coverage.ts:78`). |
| Role | 0–10 | Title/JD family vs targets (`role.ts:33-65`) | Yes | Arbitrary ladder | **Root cause of the Careem scores.** If the JD reads as *any* family, the posting counts as "tech" (`role.ts:57`), and a title with no family then gets **7 "general software engineering"** (`role.ts:60-61`) even when `classifyRole(title).engineering === false`. A non-tech title can also get 8 "from the JD" when Excel+SQL coverage is ≥ 0.5 (`role.ts:53-55`). |
| Seniority | 0–15 | Title level / years asked vs targets and years (`fit.ts:98-109`) | Yes | Arbitrary (the 1.5 exponent is reasoned in a comment) | Independent of role: 15/15 for any 1–3 yr ask. "Not stated" gives 12/15 (`fit.ts:106`). The strength offset (+3) fires on boilerplate "payments" / "dashboards" (`strengths.ts:22,35`, `fit.ts:57-65`). |
| Region | 0–10 (+5/+3 starred) | Place / remote eligibility vs regions (`region.ts:58-98`) | Yes | Arbitrary ladder | Independent of role. Starred +5 grows the max to 15 (`region.ts:36`), so a perfect posting sums to 113 before the clamp. **Known bug:** a remote country list is read as a time-zone window, giving 9 "hours fit your time zone" (`location-rule.ts:126-128` checks `windowFits` *before* `if (named) fail`). This is being fixed by another agent. |
| Work mode | 0–5 | Posting mode vs preference (`fit.ts:131-139`) | Yes | Arbitrary | **With preference "any" every posting gets 5/5** (`MODE_POINTS` has no `any` row, so `points = max`, `fit.ts:135-136`). A constant 5 adds nothing to the ranking and only inflates the absolute number. Unknown mode gives 3. |
| Pay | −5…+5 | Stated pay vs floor (`signals.ts:32-41`) | Yes | Arbitrary | Fine. Stated pay with no floor gives +2 (rewards disclosure, not fit). |
| Language | −25…+3 | Required languages vs levels (`signals.ts:58-90`) | Yes | Set after the 2026-10-09 review | Good. A mandatory language also triggers the 34 ceiling (`score.ts:37-40`). |
| Visa | −15…+5 | GCC sponsorship signals (`signals.ts:100-116`) | Yes | Arbitrary | Independent of role. Adds +5 to any GCC posting that says "visa provided", including non-tech ones. |
| Domain | 0…+10 | Payments / e-invoicing terms anywhere in title + 8,000 chars of JD, with ready evidence (`signals.ts:118-131`) | Partly | Arbitrary | **One term anywhere is enough**, including company boilerplate ("manage payments", "Careem Pay wallet") and benefits ("wallet credits"). `PAYMENTS_TERMS` includes `wallet`, `reconciliation` (`evidence.ts:50-56`). The same hit also lowers the seniority penalty (strength offset) in both the score and the gate (`gate.ts:253`): one word counted three times. |

**Ceilings.** There are only two (`score.ts:37`): mandatory language unmet (34) and title only (55). There is **no ceiling for "not a tech role"**, "role outside targets" or "remote eligibility outside your regions". The AI side does have the last two (`scoring.ts:89-90`, role 50 and location 30), but the deterministic side, which ranks every row, does not.

### 1.1.1 Measured: the context floor

The probe script (synthetic profile below) shows how many points a posting earns without matching anything about the job:

| Synthetic posting (Dubai unless stated) | Skills | Resp | Role | Sen | Region | Mode | Visa | Domain | **Match** | Gate |
|---|---|---|---|---|---|---|---|---|---|---|
| Category Executive, no data skills in profile, no star | 0 | 0 | 7 "general software engineering" | 15 | 10 | 5 | 0 | 5 (boilerplate) | **42** | pass, "Uncertain fit" |
| Training & Quality Executive, same | 0 | 0 | 7 | 15 | 10 | 5 | 0 | 5 | **42** | pass, "Uncertain fit" |
| Category Executive, profile with Excel/SQL/Power BI, UAE starred | 23 | 3 | 7 | 15 | 15 | 5 | 0 | 5 | **73** | pass, "Uncertain fit" |
| Senior Operations Associate – Shops, same profile | 23 | 1 | 8 "Backend (from the JD, new title)" | 7 (+3 "strong payments match") | 15 | 5 | 5 | 5 | **69** | pass, info **"Backend · new title"** |
| Senior Product Designer (JD mentions SQL + Excel), same profile | 22 | 0 | 8 "Backend (from the JD)" | 7 | 15 | 5 | 5 | 5 | **67** | pass, "Uncertain fit" |
| Senior Product Designer (no SQL/Excel) | 0 | 0 | 7 | 7 | 15 | 5 | 5 | 5 | **44** | filtered "domain: Product/Design" |
| Customer Support Executive, **Kuwait** | 18 | 5 | 7 | 15 | 15 | 5 | 0 | 0 | **65** | filtered "domain: Customer service" |
| **Senior Backend Engineer (Go, Kafka, K8s), Dubai** | 9 | 5 | 10 | 4 | 15 | 5 | 5 | 0 | **53** | pass |
| Backend Developer (PHP/Laravel, payments), Dubai | 35 | 10 | 10 | 15 | 15 | 5 | 5 | 5 | **100** | pass |

Synthetic profile: ready skills PHP, Laravel, MySQL, PostgreSQL, REST APIs, SQL, Excel, Power BI, Git, Webhooks; domains payments and ZATCA; targets backend, full-stack, API/integration, payments, e-invoicing, ERP; Junior–Mid; 2 years; based in India; sponsorship for all GCC countries; UAE and Kuwait starred "top"; work mode "any".

What this shows:

- **The floor is about 37–42** for any non-tech posting in a target city with an achievable years ask: seniority 15 + region 10 + mode 5 + role 7, plus up to 5 visa and 5 domain. The "Weak" band starts below 35 (`blend.ts:54-59`). So **a non-tech job can never look weak on the Match side.**
- **Ranking inversions.** Category Executive (73) and Customer Support Executive (65) outscore a stretch-but-relevant Senior Go backend role (53). The weights are not wrong one by one; the problem is the missing interaction between "is this my kind of job" and everything else.
- The gate and the score disagree. The gate filters Customer Support Executive, but its Match is 65. Today that is harmless, because filtered rows are hidden. But "Show anyway" restores them with that score, and any surface that reads `fit_score` without `status` will rank them high.

### 1.1.2 Root-cause trace for the four Careem roles

| Role (prod Fit) | Why it passed the gate | Why Match was high | How the shown Fit comes out |
|---|---|---|---|
| Senior Operations Associate – Shops (52) | No domain title matches: `project_ops` lists "operations manager/specialist", not "associate" (`domains.ts:192`). The JD names SQL, so `inferFamilies` → backend (`roles.ts:23,350-353`). Ready-skill overlap ≥ 2 (SQL, Excel) → `jdTech` → PASS with info "Backend · new title" (`domain-rule.ts:73-76`). | Skills 23 (SQL, Excel of 3), role 8 "Backend from the JD" (`role.ts:53-55`), region 15, mode 5, visa 5, domain 5 (boilerplate), seniority 7 with "strong payments match". **69** | 69 with AI ≈ 35 → `round((69+35)/2)` = **52** |
| Senior Product Designer (51) | The title is in the `product_design` domain (`domains.ts:180`), so the evidence is strong. But the overlap is ≥ 2 when the JD mentions SQL/Excel/APIs, so it gets "Uncertain fit" instead of filtered (`domain-rule.ts:78-83`). | 67 measured with that JD | 67 with AI ≈ 35 → **51** |
| Category Executive (40) | No domain matches "category", "buyer" or "executive". `NON_ENGINEERING_TITLE` lists `officer`, `assistant`, `coordinator`, but not `executive` / `associate` (`roles.ts:320-330`). Falls through to "Uncertain fit" (`domain-rule.ts:85`). | 68–73 | 68 with AI ≈ 12 → **40** |
| Training & Quality Executive (31) | Same. `trainer` is listed, `training` and `quality` are not. | 62–66 | 62 with AI ≈ 0 → **31** |

The AI values are back-solved. They fit the formula and are plausible, but they were not read from production.

**What the gate knows but does not use.** `classifyRole` already returns `engineering: false` for all four (the measured `eng=false fam=[]`). `roleReason` deliberately ignores non-engineering postings (`gate.ts:168`: `if (!engineering || families.length === 0) return null`) and leaves them to the domain rule. The domain rule only filters on *positive* evidence of a listed field. So **a non-engineering title in an unlisted field is never filtered.** "Unknown titles pass if the JD matches" (memory rule) is implemented as "unknown titles pass even if the JD does *not* match": the fall-through at `domain-rule.ts:85` passes with only a penalty chip.

**Why the "Uncertain fit" chip does not help.** It sets `rank_adjust` −15 (`soft-rules.ts:47-51`). That moves the sort only (`discoveries.ts:318,328`). It does not change the Fit badge, the band, the New column, notifications or the AI cap.

**Starred-region boost.** The +5 is real but not the cause. It adds 5 to every UAE/Kuwait posting, tech or not. The rank surfaces add their own +6 / +4 (`preferred.ts:38`) on top, so a starred region counts twice in the shortlist (see §1.8).

**Skill synonyms.** `excel` (aliases: spreadsheets, advanced excel), `dashboards` (aliases: kpi, kpis, kpi reporting) and `sql` are skills (`lexicon.ts:39,49`). They are also the vocabulary of every operations, category and finance job in the GCC. With a data-flavoured profile they are the second engine of inflation.

### 1.1.3 Remote country list (Fit 72) — review of the other fix

Measured. "Remote – Indonesia, Philippines, Thailand, Vietnam … GMT+7 hours" gives region 9 ("Remote, hours fit your time zone"). The cause is that `remoteOutcome` returns PASS on `windowFits` before the `named` check (`location-rule.ts:126-129`). India is +5:30 and GMT+7 is inside ±4 h, so a posting that *names* other countries passes as long as it also names a nearby time zone.

The right order is: named places that exclude you → fail, even if the hours fit. Hours should rescue only postings that name **no** places. The eligibility ceiling being added should also apply on the deterministic side: a remote posting restricted to named places outside your regions caps the Match at 30. That mirrors `PREFERENCE_CAPS.location`, which today exists for the AI score only (`scoring.ts:56`).

Add regression fixtures for both forms:
- the location field ("Remote – ID, PH, TH, VN");
- the JD sentence ("open to candidates located in Indonesia, the Philippines…"). Today this second form is **not** caught by `RESTRICTION_PATTERNS` (`gate.ts:78-89`): there is no "open to candidates located in" pattern without "only".

## 1.2 AI score and the blend

- **Formula.** `round(0.5 × Match + 0.5 × AI)`, then the ceiling, then the optional growth nudge (`blend.ts:18-39`). The equal weights are a judgement call; the comment says so (`blend.ts:11-13`).
- **The TS and SQL twins agree** on the blend and the ceiling (`discoveries.ts:287-300`). Rounding is the same for non-negative values.
- **Drift, minor.** The min-score filter uses `blendedSql()` without the growth nudge (`discoveries.ts:345-347`), but the card shows the nudged Fit (`blend.ts:65-66`). With "growth in Fit" on, "Fit ≥ 60" can hide a card showing 61 or show one at 58.
- **Drift, major: the "one number" is not one number.**
  - New-discovery notifications filter and sort on **`match_score` = the AI score alone** (`lib/notifications/discovery.tsx:82,91,97`).
  - The weekly digest's "top discoveries" does the same (`lib/digest/weekly.ts:230-234`).
  - Both ignore the deterministic score, the ceiling and the blend. A title-only row capped at 55 can be emailed as "80". A row with no AI score is never emailed at all.
  - Analytics bucket outcomes by the AI score as well (`lib/analytics/service.ts:75,279`), so the only calibration data lee collects is about the half of the blend that is not deterministic.
- **Naming hazard.** The column `match_score` holds the **AI** score and `fit_score` holds the deterministic **Match** score (`schema.ts:494,538`). The UI says the opposite ("Match" is deterministic, "Fit" is the blend). Every new query is a chance to pick the wrong column, and the notification code above did. Rename via a view or a typed accessor (P1).
- **Disagreement is averaged away.** When the AI says 0–15 ("not this person's job") and the Match says 65, the mean of 40 sits in the "fair" band. When the two disagree by more than about 30 points, the blend should take the lower value, or flag "scores disagree". Today it averages.
- **Double counts across the halves:**
  - the AI gets +5 for any GCC/India posting that passes (`scoring.ts:94-95`) on top of the Match's region 10 (+5 starred);
  - the AI's +8 e-invoicing bonus (`scoring.ts:96-101`) stacks on the Match's +5 domain;
  - the AI cap reads `profile.skills` (legacy settings skills, `scoring.ts:98`) while the Match reads *ready* evidence (`evidence.ts:95`). The two halves disagree about what the user knows.
- **Staleness.** The Match is re-scored whenever `fit_key` changes (`match/service.ts:114-138`). The AI score is not: it keeps the profile and prompt it was computed under. After a preferences change, half of the blend is current and half is old. Store an AI key (profile hash + prompt version) and show "AI score from an older profile" or drop it from the blend when stale.

## 1.3 Relevance gate

- **Strengths:**
  - Asymmetric by design, with readable reasons and a learned-titles loop (`domain-rule.ts:60-66`).
  - Versioned (`RELEVANCE_RULES_VERSION = 'r8'`, `prefs.ts:32`), and the key includes taxonomy, rules and prefs (`prefs.ts:237-277`).
  - It shares detectors with the score ("the score and the gate never disagree about what a posting is", `fit.ts:13-16`), which is true for region and seniority.
- **Weaknesses:**
  - Fail-open for non-engineering titles in unlisted fields (§1.1.2). The `DOMAINS` list (`domains.ts:109-207`) will never be complete. GCC titles like "Executive", "Associate", "Specialist", "Officer", "Category", "Merchandising", "Fleet", "Captain", "Quality", "Training" or "Growth" are endless. **Invert the default:** when the title is non-engineering (`classifyRole(title).engineering === false`) and the JD does not *strongly* read as a target family, the outcome should be a hard "role: not a tech role" in `hard` mode. Today that case is "Uncertain fit". Keep "Uncertain fit" only for titles that are *unknown* (neither engineering nor non-engineering).
  - **`'sql'` in `BACKEND_SKILLS`** (`roles.ts:23`) means "SQL is a plus" in any JD gives backend evidence. Move `sql` to the data list or require ≥ 2 backend terms for JD-only inference (as the DevOps guard already does at `role.ts:27`).
  - **`familiesFromEvidence` accepts 2 generic data words** (`roles.ts:367`): `excel`, `reports`, `reporting`, `kpi`, `dashboards`. Require at least one real tool (Power BI, Tableau, Looker, pandas, dbt) or the title.
  - `rankAdjust` is clamped −60…+20 and is in Fit points (`gate.ts:294`), but it is added only to the sort. Users see a Fit that the sort contradicts: a Fit 52 card can sit below a Fit 40 card.

## 1.4 Calibration, monotonicity, explainability

- **Explainability: excellent.** Every component carries a human label and points ("Role: general software engineering", "Domain: payments"). That is exactly why the Careem bug can be diagnosed from the popover. Keep it.
- **Monotonicity:**
  - Mostly monotonic per component. Seniority takes the stricter of title and years (`fit.ts:107-108`).
  - Region is not ordered by how good the outcome is: "hours fit your time zone" (9) beats "remote worldwide" (8) and "India, city not stated" (7).
  - "Remote, eligibility unclear" (5) equals "location not stated" (5).
- **Calibration: not done.** No weight was fitted to labels. `docs/match-score.md` states the rules but no rationale or data. The bands (75 / 55 / 35, `blend.ts:53`) are not tied to outcomes. Fit 70 does not mean the same across sources:
  - title-only email alerts are capped at 55 but get a neutral 18 on skills (`skills.ts:74`) and 12 on seniority;
  - full JDs earn 5 "responsibilities not stated" (`coverage.ts:78`);
  - remote rows earn 5 work-mode points for any user with preference "any";
  - GCC rows can earn +5 visa that Indian rows can never earn. A Kochi posting and a Dubai posting with the same job content differ by up to 5 visa + 5 star, about 10 points, purely from geography that the region component already rewarded.

## 1.5 Gaming and failure modes

| Mode | Example | Effect |
|---|---|---|
| Boilerplate keywords | "About Careem: … payments … wallet" | +5 domain, +3 seniority offset, softer gate penalty for **every** posting from that employer |
| Generic skill words | "Excel", "KPIs", "dashboards", "SQL is a plus" | Skills 18–23/35 and role family inference |
| Small denominator | 2 extracted requirements | 1 hit = 50 % of the skills points |
| Neutral credit | No stack named + JD inferred "tech" | 18/35 free (`skills.ts:74-75`) |
| Constant components | Preference "any" | 5/5 work mode on every row |
| Double counting | Skills ↔ responsibilities; region ↔ visa ↔ star ↔ AI region bonus ↔ shortlist star; domain ↔ strength offset ↔ AI e-invoicing bonus | Ranking driven by geography and one keyword |

## 1.6 Re-score and versioning

- **Good:**
  - `fit_key` = rules version + an FNV hash of every profile input (`key.ts:23-47`).
  - The batched, idempotent backfill (`service.ts:114-138`) runs after each save via `after()` (`enqueue.ts:173-188`).
  - `match_applied_key` avoids rescans.
- **Gaps:**
  1. Version bumps are manual. Nothing fails CI when `lexicon.ts`, `roles.ts`, `domains.ts` or a weight changes without a bump. The tests pin `MATCH_SCORE_VERSION === 'm4'` (`tests/unit/discovery-match-review-probes.test.ts:144`), which forces nothing. **Hash the rule tables into the version** (P1, S).
  2. The gate and the match have separate versions (`r8`, `m4`) but share `roles.ts` and `domains.ts`. A change to one table must bump both.
  3. The AI score is never invalidated (§1.2).
  4. `fnv1a` over 32 bits is fine for change detection at this scale.

## 1.7 Tests and the eval set

- **Unit tests.** 227 test cases across 17 `discovery-match-*` / `discovery-relevance-*` unit files.
- **Fixtures.** 48 `discovery-match` fixtures, enforced in CI (`.github/workflows/ci.yml:35` runs `pnpm eval`; `tests/unit/discovery-match-eval.test.ts` runs them under `pnpm test`).
- **But** the fixtures are exact-expectation checks, not a measured set:
  - only **14 of 48** bound the Match Score at all (`"min"/"max"` in 14 files);
  - **none** of the non-tech fixtures (`04-not-engineering`, `30-talent-acquisition-riyadh`, `31-treasury-operations-accounting`) asserts a Match ceiling;
  - there are no precision, recall or band-agreement metrics, so a change that moves 20 rows by 10 points passes CI;
  - the base fixture profile has no data or Excel skills and no starred region (`tests/eval/discovery-match.ts:73-94`), so it cannot see the two inflation engines measured above.

## 1.8 Secondary scores

### Benefits score and "Combined": 1 / 10

- **The benefits score is always 0 (or NULL).**
  - `scoreJobRow` reads `row.normalized.benefits` (`lib/discovery/ingest.ts:174-176`). No adapter in `lib/discovery/adapters` ever sets a `benefits` field, and `NormalizedJob` has none. I verified this by grep.
  - Weights come from `DEFAULT_BENEFIT_PREFS` (`lib/profile/service.ts:28-39`) and never get anything to weigh.
- **Combined is the default sort** (`lib/discovery/filter-options.ts:21`, `discoveries.ts:323-331`).
  - With benefits always 0, Combined is really `0.6·Fit + rank_adjust + nudge`. Against Fit, `rank_adjust` and the growth nudge count 1.67× as much as in the "Match" sort: one "Uncertain fit" chip costs the equivalent of 25 Fit points.
  - Unscored rows (Fit NULL → 0) can outrank weakly scored rows on `rank_adjust` alone.
  - "Why this score" shows "Benefits 0" on every row (`components/discovery/match-why.tsx:118-120`). That reads as "no benefits", when the truth is "never measured".
- **A must-have benefit caps every AI score.** `applyCaps` caps the AI score at 25 when any must-have benefit is missing (`scoring.ts:34-40`) and reads the same empty object. If a user sets a must-have benefit, **every** AI score drops to ≤ 25.
- **`compensation_meets_floor`** is true whenever any compensation number exists (`scoring.ts:149-155`). It never compares against the floor.
- **Dead code:** `combinedScore()` (`scoring.ts:183`) is never called.
- **Unknowns.** `lib/compare/score.ts:4-31` already does it right: it leaves unknowns out and reports coverage.

### Best CV / cv-fit: 6.5 / 10

- **Formula and strengths.** Coverage 60 · responsibilities 20 · region 15 · CV quality 5 (`lib/cv-fit/score.ts:32`). Ties are broken deterministically and the winner's reasons are stated. Well tested: 27 unit cases, integration tests and the e2e `best-cv.spec.ts`.
- **Stale key.** `bestCvKey` (`lib/cv-fit/key.ts:34-39`) does not include `MATCH_SCORE_VERSION` (the line checks are borrowed from Match) or the CV Score `SCORER_VERSION`. Bumping either leaves best-CV rows stale.
- **Wrong sort column.** `openForMatrix` sorts by `fit_score` (Match only), not the blended Fit (`lib/db/queries/bestCv.ts:103`).
- **Third "fit" number.** Its absolute value is shown next to Fit, so users see a third number labelled "fit" with a different meaning.

### CV Score: 7 / 10

- **Strengths.** Versioned, flagged as outdated in the UI, with 13 calibration fixtures and parse/scoring accuracy tests.
- **Shifting totals.** When the AI requirement-fit step is skipped, the remaining weights are renormalised (`lib/cv-score/headlines.ts:15,45-51`), so totals move with AI availability. Fixture `08` documents this.
- **Fourth job-fit number.** "Total Match" in JD mode is a fourth job-fit number.

### Company fit, hire likelihood, growth: 6 / 10

- **Company fit is an explainable chip sum** (`lib/company-discovery/fit.ts:37-56,207-222`): region 22, starred +10/+6, domain 22, tech 13, stage 8, hiring 15, warm intro 10, growth 10.
  - It can reach 110 before the clamp, so top companies tie.
  - Location can contribute 32 points (region 22 + starred 10).
  - **It is not refreshed when search preferences are saved** (`app/(authed)/settings/profile/search-actions.ts:8-9`). Only the weekly run, enrich or growth refresh recompute it (`service.ts:233-248`). It has no version or key.
- **Hire likelihood** drops `amenity=money_transfer` / `bureau_de_change` even when the place has an `office` tag (`hire-likelihood.ts:132,143`). That throws away exchange houses, which are relevant payments employers in the Gulf.
- **Growth** (`growth/combine.ts`) is good. It averages only known signals and gates confidence. The TS and SQL nudges agree (`combine.ts:52-58` vs `discoveries.ts:306-309`).
- **But the nudge has three consistency problems:**
  - it is applied **after** the ceiling, so a row capped at 55 can show 60 (`match-why.tsx:130`, `discoveries.ts:318`);
  - it is missing from the min-score filter (`discoveries.ts:344-348`);
  - it is missing from the shortlist (`lib/apply/rank.ts:122-126`).

### Shortlist rank: 5 / 10

- **Formula.** `0.5·cappedFit` (0–50), plus role +12, region +8/+4, starred +6/+4, reputation ±10, pay, soft rules, freshness up to +10, caution −5, feedback and the comparison with the current job; clamped to 0–100 (`rank.ts:8-32,96-111`).
- **Location is counted 3–4 times.** For a top-priority in-region posting, location is worth about 16.5 rank points ≈ 33 Fit points:
  - Match region with its +5 star (+2.5 after the ×0.5);
  - the AI's +5 region bonus;
  - rank's region +8;
  - rank's starred +6.
- **Role** is counted twice: rank's +12 on top of the Match role component.
- **Visa offered** is counted three times: Match +5, gate boost +5, shortlist +3.
- **Non-Fit parts can outweigh Fit.** They can add up to about +63, against Fit's maximum of 50. Example: Fit 60 + role + region + star + posted today gives 66. Fit 90 posted 10 days ago with no family hit gives 60.
- **The same chips weigh differently in two places.** Soft rules are −5/+3 per chip in rank (`rank.ts:185-204`) but −15/+5 in the inbox (`soft-rules.ts:47-53`).
- **The pre-limit cuts on another number.** It keeps the top 300 by `coalesce(blended,50) + rank_adjust` (`lib/apply/candidates.ts:116-120`) before freshness and region are known.
- **Freshness falls back to `createdAt`** (`rank.ts:215-222`). An old posting first seen today gets +10.
- **Feedback learning is shallow.**
  - "Not for me" learns a company (−15 after one dismissal) and a role or region (−8 after two) (`lib/apply/feedback.ts:56-87`).
  - The `seniority`, `pay` and `stack` reasons only generate suggestions.
  - Region feedback uses the coarse `gcc` tag (`triage.ts:51`), so dismissing Kuwait jobs lowers UAE jobs too.
  - Inbox dismissals record no reason (`app/(authed)/discoveries/actions.ts:71-81`).
  - `ai_call_logs.user_action` is written and never read.

### Scam Shield: 7 / 10

- **Strengths.** Pure, versioned, with stale rows re-assessed on a version bump (`lib/db/queries/riskAssessments.ts:222`). It has 47 fixtures (25 scam, 22 legit) and good Gulf agency-fee negation (`lib/scam/rules/gulf.ts:60-61`).
- **Payments JDs are at risk of false positives.** This user's domain is payments, and these rules fire with no job-context exclusion:
  - `money.upfront_fee` (45) fires on "processing fees" and "verification charges" (`lib/scam/rules/money.ts:9-18`);
  - `money.cheque_cashing` (45) fires on any "Western Union" or "money orders" mention (`money.ts:28-35`);
  - the Gulf visa-fee rule fires on "Visa fees" (`gulf.ts:27`).

  So "reconcile processing fees; integrate Western Union payouts" could reach likely-scam and quarantine. No legit fixture uses remittance vocabulary.
- **Network facts never age out.** A young-domain finding (+30, already "caution") never re-checks until the rules version changes.

### Reputation: 6 / 10

- **Formula.** Environment = `(avg−1)/4×100` ± pros/cons; stability = 50 + Wikidata age and size (`lib/reputation/criteria.ts`). It is explainable and returns null when nothing is known.
- **Rating scale skews positive.** 3.0/5 maps to the neutral 50 (`:90`), but review averages cluster near 3.5–4, so most employers get a positive rank boost.
- **Doc and code disagree.** The shortlist doc says only *confirmed* criteria count (`rank.ts:21`), yet unconfirmed Wikidata facts move stability (+15 for 20+ years, +10 for 1,000+ staff, `criteria.ts:126,137`). That biases against startups.
- **Fraud is counted three times:** stability −30, scam +30 (`lib/scam/rules/reputation.ts:11`), and the resulting caution −5 in the shortlist.

### Other numbers on screen

- **Compare verdict** (`lib/compare/score.ts`, `verdict.ts`): a weighted mean over known factors with coverage. Good (8/10). But the compare benefit extractor counts "valid UAE residence visa" as sponsorship **Yes** (`lib/compare/benefits.ts:61`), while the gate reads the same phrase as "presence required" (`relevance/signals.ts:224`). That is two visa detectors that disagree.
- **Discovery calibration chart** (`components/analytics/discovery-calibration-card.tsx`): calibrates the **AI score only** (`lib/analytics/service.ts:258-281`). Nothing calibrates the Fit the user actually sees.
- **Radar "what's new" rank** (`lib/radar/new/rank.ts`) and **coverage status** (`lib/coverage/compute.ts`) are unrelated to job fit.

**Score sprawl.** A posting can show up to five different "fit" numbers: Fit, Match, AI, Best-CV fit and CV Score Total Match. On top of that, the shortlist has its own rank and the company card its own fit. Each is defensible on its own, but together they undermine the "one number" principle the UX audit asked for.

## 1.9 Scoring scorecard

| Dimension | Weight | Score | Evidence |
|---|---|---|---|
| Explainability (labels, popover, evidence quotes) | 10 % | **8.5** | Every component has a label and points (§1.1); the Careem bug is readable straight from the popover |
| Correctness on role relevance (non-tech, eligibility) | 20 % | **3.0** | Non-tech floor 42, inversions 73 vs 53 (§1.1.1); remote country list read as a time-zone window (§1.1.3) |
| Calibration (weights from evidence, same meaning across sources) | 15 % | **3.0** | No fitted weights; constant components; geography counted 3–4 times; only the AI score is calibrated |
| Gate design | 10 % | **6.0** | Good reasons and learning; fails open for non-engineering titles in unlisted fields (`domain-rule.ts:85`, `gate.ts:168`) |
| AI blend and caps | 10 % | **5.0** | Sensible 50/50 with the ceiling; averages disagreement away; AI score never re-scored; double region/domain bonuses |
| One-number consistency (TS ↔ SQL ↔ notifications ↔ shortlist) | 10 % | **5.0** | Blend twins agree; notifications and digest use the AI score only; nudge after the ceiling; different chip weights in rank and inbox |
| Versioning and re-score | 10 % | **7.0** | `fit_key` with profile hash and idempotent backfill; manual version bumps; best-CV and company fit keys miss upstream versions |
| Tests and eval | 10 % | **6.0** | 227 match/relevance unit cases, 48 CI-gated fixtures; only 14 bound the score, no metrics, no non-tech ceiling assertions |
| Secondary scores (benefits, cv-fit, CV, company, shortlist, scam, reputation) | 5 % | **5.5** | Benefits 1, cv-fit 6.5, CV 7, company 6, shortlist 5, scam 7, reputation 6 |
| **Overall** | 100 % | **5.1** (5.08) | |

## 1.10 Calibration plan

### Step 1: a labelled eval set (about 150 synthetic postings)

Location: `tests/eval/fixtures/discovery-calibration/*.json`. Each file holds `{ job, expectBand: 'strong'|'good'|'fair'|'weak'|'filtered', expectColumn: 'new'|'filtered', why }`, scored against **two** fixed synthetic profiles:

- "backend-payments" (the user's shape: Laravel, payments, ZATCA, plus Excel/SQL/Power BI, UAE and Kuwait starred, preference "any");
- "backend-only" (no data skills, no stars).

Suggested mix (counts):

| Slice | n | Examples | Expected |
|---|---|---|---|
| On-target backend / full-stack / API / payments / ZATCA / ERP, GCC | 30 | Laravel payments Dubai, ZATCA integration Riyadh, Odoo developer Kuwait | strong / good |
| On-target, India and remote (worldwide, APAC, India-eligible) | 20 | Kochi Laravel, remote EMEA API engineer | strong / good |
| Stretch (Senior, 5+ yrs, adjacent stack Go/Java/Node) | 15 | Senior Go Dubai, Java payments Riyadh | fair |
| Adjacent tech, not targeted (frontend, DevOps, QA, data analyst, mobile) | 15 | React dev Dubai, SRE Bangalore | fair / weak / filtered |
| **Non-tech GCC with tech-ish words** (ops, category, CX, training, quality, finance, product design, PM) | 30 | Careem-style ops, Talabat category, Noon CX, bank operations analyst with "SQL a plus" | **filtered or weak** |
| Eligibility traps (remote country lists, US hours, nationals only, mandatory Arabic, presence required) | 20 | "Remote – ID/PH/TH/VN", "Kuwaiti nationals", "must reside in KSA" | filtered or weak |
| Thin inputs (title only, email alerts, watch links) | 10 | "PHP Developer – Dubai" alert | ≤ 55, "~" |
| Boilerplate traps (employer "About us" with payments/fintech words, benefits with "wallet") | 10 | Any Careem/Tabby/Tamara non-tech role | no domain points |

Every label is written before running the scorer. Keep labels in bands, not points. A recruiter (or the user) agrees on a band much more reliably than on a number.

### Step 2: metrics (computed by `pnpm eval`, printed as a table and stored as JSON)

- **Non-tech false-pass rate:** share of the 30 non-tech postings with status `new` *and* Fit ≥ 35. Target: **0 %** for Fit ≥ 55, **≤ 5 %** for `new`.
- **Precision@k for New:** among the top 10 / 20 by the default sort, the share labelled strong or good. Target ≥ 0.9 @10, ≥ 0.8 @20.
- **Shortlist precision:** the same on `lib/apply/rank.ts` output, top 5. Target ≥ 0.9.
- **Band agreement:** exact band match ≥ 70 %, within one band ≥ 95 %; quadratic-weighted kappa reported.
- **Eligibility recall:** 100 % of eligibility traps filtered or weak.
- **Monotonic pairs:** about 20 hand-made pairs (same JD; Senior vs Mid, starred vs not, a skill added) where the direction is asserted.

### Step 3: CI gate

`pnpm eval` fails when:
- the non-tech false-pass rate is above 5 %;
- precision@10 is below 0.9;
- band agreement drops by more than 3 points against the committed baseline (`tests/eval/baselines/discovery-calibration.json`);
- or any eligibility trap passes.

The baseline is updated only by a commit that also bumps `MATCH_SCORE_VERSION`, enforced by a test that hashes the rule tables.

### Step 4: tuning from the user's own feedback

- **Data.** Every shortlist, save, apply, dismiss ("not my field", "too senior", "location") and "Show anyway" already exists as an event. Snapshot `fit_detail.components` at decision time: an append-only table `score_feedback(user_id, discovery_id, components jsonb, ai_score, action, reason, at)`.
- **Model.** Fit a per-user logistic regression on the component points (plus the AI score) to predict save/apply vs dismiss. About 10 parameters with L2 regularisation toward the current hand weights, so that 30–50 labels move weights gently and not wildly. Re-fit nightly in the retention cron (no extra cron slot). Shrink toward the global weights while n < 50.
- **Use.** Do not let the model replace the explainable score. Use it to:
  1. propose weight changes to the developer (the user), shown as a diff;
  2. report calibration: the AUC of today's score against the user's own decisions, and the dismiss rate per band. A "good" band with a 60 % dismiss rate is miscalibrated.
- **Dismiss reasons as hard data.** A "not my field" dismiss of a title already becomes a learned title (`learned.ts`). Extend this to learned *employers' boilerplate* (strip the "About <company>" paragraph before term scans), and count "not my field" dismisses on rows with `status = new` as gate false passes in a weekly metric.

---

# Part 2: Engineering, architecture and CTO review

Method: static analysis only (grep, wc, git log). No test runs, no network, no database. "Since the last review" means the 66 commits after the 2026-10-09 review commit `c8fd032b`.

## 2.0 What changed since the 2026-10-09 review

| 10-09 fix | Status | Evidence |
|---|---|---|
| Next ≥ 16.3.8, dependency bot | **Half** | `package.json:65` `"next": "16.3.8"`; no Dependabot/Renovate config, no `pnpm audit` in `ci.yml` |
| Encrypt Google tokens; dedicated key | **Tokens done; key open** | AES-GCM `enc:v1` vault (`lib/crypto/token-vault.ts:25-67`); key still HKDF of `AUTH_SECRET` (`lib/lab/crypto.ts:28-40`) |
| One `safeFetch` (resolve, check, pin, cap) | **Done, well** | `lib/net/ssrf.ts:102-118`, `lib/net/safe-fetch.ts:127-156`, `adapters/http.ts:37-46`, guard test `tests/unit/outbound-fetch-guard.test.ts` |
| Deploy gated on CI; AI eval snapshots | **Open** | `ci/**` staging branches exist (`ci.yml:4-6`) but `vercel.json` has no gate; no snapshots under `tests/eval` |
| Beta tenancy T1–T4 | **T1–T3 done, T4 open** | Global throttle resumes if *any* user resumed it (`lib/usage/throttle.ts:92`); `setThrottlesResumedAction` and `refreshUsageAction` are not owner-gated (`app/(authed)/settings/usage/actions.ts:23-29,72-94`) |
| Feature freeze | **Not done** | +31k TS lines; 9 new `lib/` domains (63 → 72), e.g. company-discovery, linkedin-posts, regions, coverage |
| Nightly `pg_dump`; README fix | **Open** | `README.md:149` still claims 7-day PITR on Neon Free; no backup workflow |
| Privacy processor list | **Done** | `lib/net/outbound-hosts.ts` single registry |
| Lint boundaries; split schema | **Open, worse** | No `no-restricted-imports`; `lib/db/schema.ts` 1,633 → 1,736 lines |
| Constant-time cron auth | **Partial** | `lib/queue/cron.ts:15-18` is constant-time; `app/api/cron/{discover:32,reminders:16,retention:16}` still compare with `!==` (verified) |

Net: the security debt was paid quickly and well. The two process fixes (enforced deploy gate, feature freeze) were not done.

## 2.1 Senior engineer: 7.0 / 10 (was 6.6)

| Area | Score | Evidence |
|---|---|---|
| Code quality | 7.5 | About 2 `any` in about 184k lines; comments explain *why*. Silent `.catch(() => undefined…)` went up from 49 to 74 sites; 39 non-trivial ones, e.g. orphaned Drive files at `lib/drive/uploads.ts:103,162` and swallowed DB reads at `lib/digest/weekly.ts:385` and `lib/apply/batch.ts:38` |
| Testing | 7.5 | Unit: 271 files, about 2,395 cases. Integration: 154 files, about 1,064 cases. E2E: 41 specs, about 118 tests. 5 parallel CI jobs, including a real-Postgres smoke. But coverage thresholds (`vitest.config.ts:49`) are never enforced (CI runs `pnpm test` without `--coverage`, `ci.yml:59`), there are no AI eval snapshots, and e2e uses `retries: 1` (`playwright.config.ts:30-32`). Flake history: 1 commit tagged "flak" (`055a4c1f`), none since the review |
| Security | 7.5 | SSRF, token vault, Next patch and tenancy T1–T3 are done. Auth helpers: 77 of 83 route handlers call one directly; the other 6 delegate correctly; 52 of 53 `'use server'` files call `requireUserId`. The capture endpoint is solid: form-POST only, streaming body cap, HMAC key with per-user version revocation, constant-time check (`lib/linkedin-posts/capture.ts:34-50`), but it has no rate limit. Open: no CSP or security headers app-wide (`next.config.ts:76-80` covers the playground only), the shared `AUTH_SECRET` key, and 3 non-constant-time cron checks |
| Reliability | 7.0 | Every adapter fetch has a timeout (`adapters/http.ts:16-25`); per-source errors are recorded and a source is auto-skipped after 5 (`lib/discovery/service.ts:60,149`); upserts are idempotent (`uq(source_id, source_job_id)`). No backups, and no `statement_timeout` (`lib/db/client.ts:60`, grep finds none) |
| Observability | 6.0 | 411 logger calls; redaction; a system-events sink; client error reports. No external error tracker or alerting: dead jobs are visible only inside the app |
| Maintainability | 6.0 | About 14k lines of Markdown docs citing code (excellent). But `schema.ts` (1,736) and `lib/analytics/service.ts` (989) break the 800-line rule, and there are 27 files over 400 lines |

## 2.2 Software architect: 6.5 / 10

| Area | Score | Evidence |
|---|---|---|
| Modularity | 6.0 | `lib` never imports `app` or `components` (0 hits). But 9 `app`/`components` files import `@/lib/db/client` directly (e.g. `components/dashboard/widgets.tsx`). `lib/discovery/match` ↔ `lib/discovery/relevance` import each other (`relevance/gate.ts:16`, `relevance/prefs.ts:15-16`, `relevance/domain-rule.ts:1` ↔ `match/profile.ts:4-5`, `match/jd.ts:2`): one scoring kernel split in two. That is also why the Careem bug needs fixes in both. `lib/queue/handlers.ts:2-22` imports 18 domains that import `queue` back. No cycle check in CI |
| Data model | 7.0 | 48 migrations (`0000`–`0047`), none destructive (only `DROP NOT NULL` in `0021`). All tables are user-keyed. Hazards: `match_score` = AI score and `fit_score` = Match score (`schema.ts:494,538`), the opposite of the UI's wording, which has already caused one bug (§1.2). `buildCommand: "pnpm db:migrate && pnpm build"` changes the production schema even when the build fails, so expand/contract is mandatory but not written down |
| Query performance | 6.0 | Indexes `(user_id,status,fit_score)`, `(user_id,status,match_score)`, `(user_id,status,created_at)`, GIN `region_ids` (`schema.ts:556-582`). The default sort orders by an expression (CASE/LEAST/JSONB + `rank_adjust` + nudge, `discoveries.ts:287-330`) that no index can serve, so every page sorts all of the user's rows. Fine at a few thousand rows; a stored `blended_score` column fixes it. `list` + `countList` cost 2 statements per page; one connection per instance (`max: 1`, `client.ts:84-94`) serialises `Promise.all` queries; `@neondatabase/serverless` is an unused dependency |
| Async / queue | 8.5 | `FOR UPDATE SKIP LOCKED` (`lib/queue/queue.ts:126-178`), idempotency keys (`:60`), backoff with jitter, dead letters (`:285-314`), stale-lock recovery (`:324-336`), HMAC worker with constant-time check (`lib/queue/signature.ts:23-41`). The best-designed part of the system |
| Integration security architecture | 8.0 | One outbound `safeFetch`, an outbound-host registry, a versioned token vault |
| Scalability | 4.5 | Discoveries are unique per *user's* source (`schema.ts:556`), so the same posting is stored and polled once per user. Cron capacity is fixed (below). The global throttle is shared across users |

## 2.3 CTO: 5.5 / 10

| Area | Score | Evidence |
|---|---|---|
| Risk posture | 7.0 | The security findings of 10-09 were mostly closed within a day |
| Cost fit (zero-cost) | 5.5 | Vercel Hobby allows daily crons only, firing within the hour; 4 drains × 240 s × concurrency 2 ≈ **1,920 lane-seconds a day** (`vercel.json`, `lib/queue/cron.ts:10-12`). The GitHub Actions drain is manual-only behind a variable (`.github/workflows/queue-drain.yml:17-38`). Neon Free is 0.5 GB. Hobby is non-commercial use only. Owner-only env AI keys; invitees bring their own (`lib/auth/owner.ts:32-39`), which is the right call |
| Scale to about 100 invitees | 4.0 | About 16 sources × 100 users ≈ 1,600 source jobs a day at 5–20 s each ≈ 8k–32k lane-seconds: **4–16× the cron budget.** Storage of 50–100 MB per user × 100 ≈ 5–10 GB against 0.5 GB. Needs a shared posting store plus a scheduled worker before invites. Invite gating itself does not exist: one `ALLOWED_EMAIL` (`lib/auth/allowed-email.ts:3-8`, verified), `allowDangerousEmailAccountLinking: true` justified only by that single-email gate (`lib/auth/edge-config.ts:28`), and JWT sessions with no revocation version |
| Delivery process | 5.5 | Staging branches exist but are not enforced; agent worktree merges land directly on `main` |
| Focus | 4.0 | The freeze recommended on 10-09 was ignored: 9 new domains and +31k lines in 3 days, while the core ranking still shows Category Executives |
| Legal / ToS | 7.0 | `docs/job-sources.md` (948 lines) is careful: LinkedIn, Indeed, Glassdoor, Bayt, Naukri and GulfTalent are alerts-only; robots.txt is respected (SmartRecruiters excluded, `:100`); licensed open data (Overpass ODbL, GLEIF CC0). Grey zones: Workday CXS POST (`:96`), Phenom widgets (`:99`), SuccessFactors (`:98,351`). Per-user polling multiplies each employer's request volume by up to 100×, which contradicts the "about once a day" User-Agent claim (`lib/discovery/adapters/http.ts:8`) |
| Bus factor | 3.0 | 716 commits in about 28 days, all by one person under two identities (no `.mailmap`), with no reviewer except agents |

---

# Part 3: Fix list

Scoring correctness comes first. Effort: S < 1 day, M 1–3 days, L > 3 days.

## P0: scoring correctness (do before anything else)

| # | Problem | Evidence | Fix | Effort |
|---|---|---|---|---|
| P0-1 | **No role-relevance ceiling.** Non-tech postings score 42–73 on Match | `score.ts:37-43` has only the language and title-only ceilings; probe §1.1.1 | Add `CEILINGS.notTech = 25` when `classifyRole(title).engineering === false` and the JD does not read as a target family with real tools, and `CEILINGS.offTarget = 45` when the role family is outside the targets. Store it in `fit_detail.ceiling` so `blendedSql` and `cappedFit` apply it unchanged. Bump to `m5` | S |
| P0-2 | **Role component calls non-tech titles "general software engineering"** (7/10) or "Backend from the JD" (8/10) | `role.ts:53-61`; `score.ts:47` | `tech` must require `classifyRole({title}).engineering` *or* a generic / unknown title; a title on `NON_ENGINEERING_TITLE` gets 0. Use the same rule for `techRole` in `score.ts:47` (no neutral 18 skills points) | S |
| P0-3 | **JD-only family inference from generic business words** | `'sql'` in `BACKEND_SKILLS` (`roles.ts:23`); 2 data words make data_analyst (`roles.ts:367`) | Move `sql` out of backend evidence (or require ≥ 2 backend terms for JD-only inference, like the DevOps guard at `role.ts:27`). For data_analyst, require a real tool (Power BI, Tableau, Looker, pandas, dbt), not `excel`, `kpi` or `reports` | S |
| P0-4 | **The gate fails open for non-engineering titles in unlisted fields** | `domain-rule.ts:85` fall-through; `gate.ts:168`; `NON_ENGINEERING_TITLE` lacks executive, associate, category, quality, training, operations (`roles.ts:320-330`) | When `classifyRole(title).engineering === false` (a recognised non-engineering title) and the JD does not strongly read as a target family, return `hard: 'role: not a tech role'` in hard mode. Keep "Uncertain fit" only for truly unknown titles. Add the missing GCC title words. Bump `RELEVANCE_RULES_VERSION` to `r9` so existing New rows are re-gated | S |
| P0-5 | **Remote eligibility: a country list is read as a time-zone window** (Fit 72) | `location-rule.ts:126-129` (`windowFits` before `named`); no "open to candidates located in …" pattern (`gate.ts:78-89`) | (Fix in progress elsewhere.) Named places that exclude you fail first; hours rescue only postings that name no place. Mirror the AI's `location` 30 cap as a deterministic ceiling. Add both fixture forms | S |
| P0-6 | **Boilerplate and benefits text drive domain points and seniority offsets** | `signals.ts:118-131`, `strengths.ts:47-51`, `PAYMENTS_TERMS` includes `wallet`, `reconciliation` (`evidence.ts:50-56`) | Strip "About <company>" and benefits paragraphs before term scans (the JD parser already splits sections in `jd.ts`). Require the term in requirements or responsibilities lines, or ≥ 2 distinct terms | S |
| P0-7 | **Calibration eval with non-tech traps, gated in CI** | Only 14/48 fixtures bound Match; none of the non-tech fixtures does (§1.7) | Build the 150-posting set and metrics in §1.10, starting with 30 non-tech GCC traps and 10 boilerplate traps; fail CI when the non-tech false-pass rate is above 5 % | M |
| P0-8 | **Benefits score is always 0, yet "Combined" is the default sort** | `ingest.ts:174-176`, no `benefits` in any adapter; `filter-options.ts:21`; `discoveries.ts:323-331` | Make "Match" (blend + `rank_adjust`) the default now (S). Later, compute benefits from `lib/compare/benefits.ts` with NULL for unknown and a coverage weight (M). Hide "Benefits 0" in the popover | S / M |

## P1

| # | Problem | Evidence | Fix | Effort |
|---|---|---|---|---|
| P1-1 | Notifications and weekly digest use the AI score alone | `lib/notifications/discovery.tsx:82,91,97`; `lib/digest/weekly.ts:230-234` | Use `blendedSql()` with the ceiling and status `new`. One shared "displayed Fit" SQL and TS helper used by the card, sort, filter, notifications, digest and shortlist, with a TS↔SQL parity test | S |
| P1-2 | Column names inverted (`match_score` = AI) | `schema.ts:494,538` | Rename to `ai_score` / `match_score` via migration + typed accessors, or a view; lint against raw column use outside `lib/db/queries` | M |
| P1-3 | Blend averages strong disagreement away | `blend.ts:22` | If \|Match − AI\| > 30, take `min` and show "scores disagree", or weight 0.7 on the lower value | S |
| P1-4 | Context components ignore role relevance; constant work-mode points | `fit.ts:131-139`; `region.ts`; `signals.ts:100-116` | Scale seniority, region, work mode and visa by role relevance (`× role/10`, or add them only when role ≥ 7). Pref "any" → 0 work-mode points and a max of 0 | S |
| P1-5 | Geography counted 3–4 times; role twice; visa three times | `rank.ts:140-162`, `scoring.ts:94-101`, `region.ts:31-37` | One owner per signal: drop the AI region and e-invoicing bonuses (the Match has them), and drop rank's region and starred chips (Fit has them) | S |
| P1-6 | Small-denominator skills; generic skills | `skills.ts:82-85`; `lexicon.ts:39,49` | Bayesian shrinkage: `points = 35 × (earned + k·prior)/(total + k)` with k = 2 and prior 0.3. Mark Excel, KPIs and spreadsheets as "soft" skills worth ½ weight | S |
| P1-7 | Version bumps are manual; the AI score is never re-scored; keys miss upstream versions | `version.ts:12`; `cv-fit/key.ts:34-39`; company fit has no key | A test that hashes `roles.ts`, `domains.ts`, `lexicon.ts` and the weights and fails unless the version changes. Store an AI key (profile hash + prompt version) and drop stale AI scores from the blend. Include `MATCH_SCORE_VERSION` and `SCORER_VERSION` in `bestCvKey` | S |
| P1-8 | Growth nudge applied after the ceiling; missing from filter and shortlist | `match-why.tsx:130`; `discoveries.ts:318,346`; `rank.ts:122` | `least(blend + nudge, ceiling)` in the single helper (P1-1) | S |
| P1-9 | Scam Shield false positives on payments JDs | `lib/scam/rules/money.ts:9-18,28-35`; `gulf.ts:27` | Require a candidate-directed ask or an amount; exempt duty context ("integrate", "reconcile"); add 5 legit payments fixtures | M |
| P1-10 | Invite gating and dangerous account linking (before the first invite) | `lib/auth/allowed-email.ts:3-8`; `edge-config.ts:28` | An `invites` table checked in `signIn` with a verified email; `allowDangerousEmailAccountLinking: false`; a `session_version` claim | M |
| P1-11 | Tenancy T4: one user can lift the global throttle | `lib/usage/throttle.ts:92`; `settings/usage/actions.ts:23-29,72-94` | Owner-gate the actions; read only the owner's row; add a two-user test | S |
| P1-12 | Capacity: about 1,920 lane-seconds a day; per-user posting copies | `vercel.json`; `queue-drain.yml:17-38`; `schema.ts:556` | Scheduled Actions drain every 2 h (S), alert on queue age > 24 h. Shared `postings` store keyed by provider/tenant/job, with per-user discoveries holding only state (L) | S + L |
| P1-13 | No backups; README overstates PITR | `README.md:149` | Nightly `pg_dump` from Actions to private storage plus a restore drill | S |
| P1-14 | No `statement_timeout`; non-constant-time cron checks; legacy cron routes | `lib/db/client.ts:60`; `app/api/cron/{discover,reminders,retention}` | `connection: { statement_timeout: 15000 }`; `isCronAuthorized` everywhere; delete `cron/discover` and `cron/sync-all` | S |
| P1-15 | Deploy not gated on CI; no dependency audit; coverage not enforced | `vercel.json`; `ci.yml:59` | `git.deploymentEnabled` off for main + a deploy hook from green CI; Dependabot + `pnpm audit --audit-level high`; a coverage job | S |
| P1-16 | Dedicated encryption key | `lib/lab/crypto.ts:28-40` | `ENCRYPTION_KEY` with an `enc:v2` envelope and lazy re-encryption | S–M |

## P2

| # | Problem | Evidence | Fix | Effort |
|---|---|---|---|---|
| P2-1 | Feedback learning is shallow | `lib/apply/feedback.ts:56-125`; `triage.ts:51`; inbox dismiss has no reason (`discoveries/actions.ts:71-81`) | Snapshot components at decision time; per-user logistic fit as a calibration report and weight proposal (§1.10 step 4); region feedback on the specific `regionId` | M |
| P2-2 | Only the AI score is calibrated against outcomes | `lib/analytics/service.ts:258-281` | Calibrate the displayed Fit and the shortlist rank | M |
| P2-3 | Score sprawl: Fit, Match, AI, Best-CV fit, CV "Total Match", shortlist rank, company fit | §1.8 | Show one Fit; demote the others to the popover with distinct names ("CV choice", "Résumé quality") | M |
| P2-4 | Shortlist: soft rules re-weighted; pre-limit by another order; freshness from `createdAt` | `rank.ts:185-222`; `candidates.ts:116-120` | Use `rank_adjust × 0.5`; pre-limit by displayed Fit; freshness from `postedAt` only | S |
| P2-5 | Compare reads "valid UAE residence visa" as sponsorship Yes | `lib/compare/benefits.ts:61` vs `relevance/signals.ts:224` | One shared visa detector | S |
| P2-6 | Company fit stale after preference saves; can sum to 110 | `company-discovery/service.ts:233-248`; `fit.ts:222` | Enqueue `refreshFits` on save; add a version; rescale to 100 | S |
| P2-7 | Reputation centred at 3.0; unconfirmed Wikidata facts | `lib/reputation/criteria.ts:90,126,137` | Centre at about 3.6; count only confirmed facts in rank | S |
| P2-8 | match ↔ relevance cycle; no boundary lint; 2 files over 800 lines | §2.2 | One `lib/discovery/scoring-kernel` (roles, domains, lexicon, detectors); `no-restricted-imports`; dependency-cruiser in CI; split `schema.ts` | M |
| P2-9 | Unindexable default sort | `discoveries.ts:287-330` | Stored `blended_score` (written with scores) + `(user_id,status,blended_score)` index | M |
| P2-10 | Silent catches (39 non-trivial) | §2.1 | A `logged(label)` helper + a lint rule | S–M |
| P2-11 | No CSP; no rate limit on capture and AI actions | `next.config.ts:76-80`; `app/api/capture/route.ts` | Nonce CSP via `proxy.ts`; a counter-table rate limiter | M |
| P2-12 | Feature freeze, bus factor | §2.3 | Freeze new domains until P0 and P1 scoring are done and the calibration gate is green; `.mailmap`; required checks on `main` | S |

## Top 10, in order

1. P0-1: role-relevance ceiling (not tech ≤ 25, off-target ≤ 45).
2. P0-2: no "general software engineering" credit for non-engineering titles.
3. P0-3: stop JD-only family inference from `sql`, `excel`, `kpi` and `reports`.
4. P0-4: gate filters recognised non-engineering titles; add GCC title words; bump `r9`.
5. P0-5: remote eligibility — named places beat time-zone windows; deterministic location ceiling.
6. P0-6: strip employer boilerplate and benefits before domain and strength scans.
7. P0-7: the calibration eval set with a CI gate on the non-tech false-pass rate.
8. P0-8: make "Match" the default sort until benefits are actually extracted.
9. P1-1: one displayed-Fit helper for card, sort, filter, notifications, digest and shortlist.
10. P1-4 + P1-5: scale context points by role relevance and count geography once.
