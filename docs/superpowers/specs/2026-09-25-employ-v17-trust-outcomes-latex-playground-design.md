# Employ — v17 Scam Shield, Outcome Loops, LaTeX Studio, Playground

**Date:** 2026-09-25
**Status:** Approved — ready for implementation
**Depends on:** v5 LaTeX editor, v10 AI trust infra (signal gates, call logs), v11 journey nav, v12 CV scoring, v13 Academy, v14 model routing, v16 Radar

Constraints carried forward: **zero cost**, settings in the UI (no env flips), AI **suggests**, the user **confirms** — nothing is sent, posted, deleted or rewritten automatically.

---

## 0. Naming: "Playground", not "Lab"

- The whole hands-on area is **Playground** (`/playground`). It replaces "Lab" (v11 nav item `/learn`) and "Model & Agent Lab" (v14).
- Sections: **Practice** (the v13 adaptive Academy engine: exercises, simulations, boss battles), **Models** (v14 arena), **Agents** (v14 agent runs), **Decisions** (existing decision playground), **Radar** (v16).
- "Academy" survives only as the name of the progression system (ranks Intern → Principal, XP, tiers), not a page.
- `/learn` permanently redirects to `/playground`. Doc/spec references to "Lab" read as Playground from now on.
- Done in the integration pass after the v14.0 worktree merges (it adds lab routes; renaming before would conflict).

## 1. Scam Shield — detect fraudulent job postings and recruiter messages

Applies to every discovery, manually added job, and recruiter email (Gmail) linked to an application.

### 1.1 Signals — deterministic first
| Group | Signal |
|---|---|
| Money | asks for fees (training, registration, visa processing, "refundable deposit"), equipment purchase + reimbursement, cheque cashing, crypto/gift cards |
| Identity harvesting | asks for Aadhaar/PAN/passport/bank details/OTP before an offer; "fill this Google Form with your ID" |
| Channel | Telegram/WhatsApp-only contact, interview by chat only, offer without any interview |
| Sender/domain | free-mail recruiter (gmail/outlook) claiming a big company; lookalike domain of a real company (edit distance / homoglyphs vs the company's known domain); domain age < 90 days (RDAP, free); no MX records (DNS-over-HTTPS, free) |
| Content | pay far above role/location norm (vs salary log §6.5), vague duties, urgency/pressure, "no experience, work from home, ₹50k/day", task-based "like videos / rate hotels" schemes |
| Cross-check | same text posted under different company names; company has no web presence; URL flagged by Google Safe Browsing (free for non-commercial use) |

Rules produce a **risk score (0–100) + reasons with evidence spans**. The v10 decision chain (Groq/Laya) is only a second opinion on the *posting text*, never able to lower a rule-based high risk — v16 prompt-injection lesson: scam text is untrusted input.

### 1.2 UX
- Badge on discovery/job/application: `Safe` · `Caution` · `Likely scam`, with "why" drawer listing each signal and its evidence.
- Likely-scam items are **quarantined** (hidden from the inbox, never auto-deleted); user can mark "not a scam" (feeds a local allow-list) or "confirmed scam".
- "Report it" panel with official channels as plain text: India cybercrime portal (cybercrime.gov.in, helpline 1930), the job board's report link, FTC ReportFraud for US postings.
- Playground security domain gets a **scam-spotting drill** built from anonymised confirmed cases.

### 1.3 Data
`job_risk_assessments` (target type/id, score, level, signals JSON, rules version, decided_by, user_verdict). Rules versioned like prompts (v10.1) with an eval suite of labelled scam/legit fixtures in `pnpm eval`.

## 2. Email → status suggestions

- Gmail sync already links threads to applications (`lib/gmail/matcher.ts`). New classifier labels each new inbound message: `received`, `rejection`, `interview_invite`, `assessment`, `offer`, `recruiter_outreach`, `other`.
- Deterministic phrase rules first; decision chain only when rules abstain; signal-gated (no body → skip).
- Produces a **suggestion card**: "Mark *Acme — Backend* as Rejected?" / "Interview invite for Tue 14:00 — add calendar hold?" One tap to accept; nothing changes without it.
- Accepted/declined suggestions become labelled data for the eval suite and Laya threshold fitting (v16 §2.0).
- Also runs Scam Shield (§1) on recruiter outreach.

## 3. Outcome learning

- Every application records what went out: CV document + version, CV score at send time (v12), cover letter y/n, source, channel (referral/direct/board), day/time applied.
- Analytics › **What works**: response rate and time-to-reply by each factor, with counts and a "too few to say" state below n=10 per bucket (no fake certainty).
- Feeds next-best-action ("Tailored CVs scoring ≥ 75 got 3× replies — tailor before applying to X").

## 4. Skill-gap loop

- Aggregate required/preferred skills across saved and applied jobs (existing JD extraction) → compare with CV evidence + Playground ratings.
- **Gap board:** skill, demand (how many target jobs ask), current level, evidence status.
- Each gap → Playground plan items + a **portfolio project brief** (scope, acceptance criteria, stretch goals) the user can build and push to GitHub (v15 tracks it).

## 5. CV suggestions from Playground work

When the user earns something verifiable in the Playground, the CV gets a *suggestion*, never an automatic edit:
- **Triggers:** reaching level ≥ 3 in a skill, clearing a boss battle, finishing a capstone/portfolio project, merged OSS contribution (v15/v16), solved issue.
- **Suggestion:** section (Skills / Projects / Certifications-style "Achievements"), proposed bullet, **evidence link** (attempt record, repo, PR), and **score delta** from v12 ("adds +6 Skills Match for 4 saved jobs").
- **Honesty rules:** practice is never presented as employment experience; metrics in a bullet must come from measured attempt data (e.g. p95 latency, complexity) — the v12 no-new-digits rule applies; the user edits and approves.
- Suggestions go to the master CV; tailoring picks them up per job.

## 6. Job-search additions

1. **Ghost-job & duplicate detection:** reposted > N times, age > 30 days, no salary and no named contact, same text across boards → `stale`/`duplicate` flags; duplicates merge into one discovery with all sources listed.
2. **Grounded company brief** before an interview stage: fetched pages only (site, careers, engineering blog, recent news via HN/GitHub org), verbatim-citation check (v16 rules); sections: what they do, product, stack signals, recent news, likely interview focus, questions to ask.
3. **Rejection review:** patterns over rejected applications (stage reached, recurring missing skills, time-to-rejection) → one concrete next action.
4. **Relocation & location filters:** visa sponsorship mention, time-zone overlap, remote region eligibility, cost-of-living index (from Expenses, v12.3) on discoveries.
5. **Salary log:** record quoted/posted ranges (role, company, location, currency, source); used by offer comparison (v12.3) and Scam Shield's "too good to be true" signal. Stored in the posting's currency; expenses stay INR.

### 6.6 Opportunity Score — how good is this job *for me*
CV Match (v12) answers "how well do I fit them". The Opportunity Score answers the other half: "how well do they fit me". Today discoveries use `combinedScore = 0.6·match + 0.4·benefits` (lib/discovery/scoring.ts); this replaces that blend.

**Criteria (each 0–100, with evidence and a confidence):**
| Criterion | What feeds it (all free) |
|---|---|
| Growth & development | learning budget, mentorship, scope/ownership, promotion path, tech stack vs the user's skill-gap targets (§4) and Playground goals |
| Role quality | clear responsibilities, seniority fit, impact, on-call load, title vs duties |
| Compensation | stated range vs the user's floor and salary log (§6.5), equity, pay transparency |
| Benefits | existing benefit weights and must-haves (health/family cover, visa, relocation, leave, 4-day week) |
| Company structure & stability | size, stage (startup/scale-up/enterprise), funding and layoff news, team and reporting structure, engineering maturity (eng blog, GitHub org activity via v15) |
| Environment & culture | remote/hybrid policy, working hours and time-zone overlap, work-life-balance signals ("fast-paced", "hustle", weekend work), the user's own interview impressions (debriefs) |
| Location & logistics | commute or remote, visa, relocation, cost of living from Expenses → estimated monthly savings in INR |
| Hiring process | rounds, take-home burden, response speed and transparency (from the user's own application history with that company) |
| Mission & interest | match to the user's stated industries and interests |

**Rules:**
- **Unknown is not zero.** Missing information shows as "Unknown" and lowers the confidence, not the score. Each unknown generates a **question to ask** the recruiter or interviewer; answers recorded later update the score.
- **Evidence:** every criterion lists its reasons. Quotes from the posting must be verbatim (v16 citation check); inferred values are labelled as inferred.
- **The user sets the weights** in Settings › Preferences, with sliders and presets (Growth first, Money first, Stability, Relocation, Balanced). Must-haves stay hard caps, reusing `applyCaps`.
- **Trust gates:** a Scam Shield `likely_scam` item (§1) gets no Opportunity Score, and a ghost/stale posting (§6.1) is flagged.
- **Deterministic first:** rule-based extraction; AI only fills criteria that rules can't, and never overrides a cap or trust gate. Versioned like prompts, with an eval suite of labelled postings.

**Where it shows:**
- Discovery and application cards: an Opportunity badge next to CV Match, plus a breakdown drawer.
- **2×2 view**, CV Match × Opportunity: *Apply now* (both high), *Stretch* (great opportunity, weaker fit → tailor or learn first), *Backup* (good fit, weaker opportunity), *Skip*.
- The dashboard's next-best-action prefers high-opportunity items.
- **Offer comparison (v12.3)** reuses the same criteria with the offer's real numbers.
- **Learning loop:** when the user later rates an application or offer ("would take it / wouldn't"), the app suggests weight adjustments. The user accepts or ignores them; weights are never changed silently.

Data: an `opportunity_scores` table (target, per-criterion score/confidence/evidence, weights snapshot, total, rules version, created_at), plus `opportunity_prefs` on the profile (weights, preset, must-haves).

## 7. Capture & habits

1. **Share to Employ:** PWA share-target (after v12.5) — share a job URL/text from any phone app into Discovery. Keeps the v1 "no browser extension" decision.
2. **Telegram bot (free Bot API):** digest + reminders delivered; reply to capture a todo or paste a job link. Chat id linked from Settings › Notifications with a one-time code; webhook verified by secret token.
3. **Weekly review:** Sunday 10-minute ritual — moved / stalled / next week's three goals; feeds v12.1 goals and streaks.
4. **Energy check-ins:** 1–5 energy and mood tap on the dashboard; burnout warning when low energy streaks coincide with high rejection counts → suggests a lighter week (fewer applications, more Playground).

## 8. LaTeX Studio — general-purpose, not only CVs

Today: 14 templates, kinds `cv | cover_letter`, documents `master_cv | tailored_cv | cover_letter`.

### 8.1 Document kinds & templates
Add `latex_document` as a free-form kind plus templated kinds:
- Job search: **thank-you / follow-up letter, reference list, statement of purpose, portfolio one-pager, recommendation request, resignation letter, offer negotiation letter**
- Learning: **notes / cheat sheet** (math, complexity tables), **system-design write-up**, **research paper / report** (article class + bibliography)
- Other: **blank document**, **invoice** (freelance), **certificate**
Each template has an SVG preview like the existing ones and fills from profile data where relevant (escaped with `escapeLatex`).

### 8.2 Standalone editor
- `/documents/new?kind=…` and "New LaTeX document" in the Documents header; not tied to an application (nullable `applicationId` already allowed).
- Multi-file projects (`main.tex` + includes + `.bib`), file tree, existing asset store.
- Snippet palette per kind, outline view (sections), friendly compile errors (existing `lib/latex/errors.ts`), side-by-side PDF preview, version history + diff, export PDF/.tex/.zip.
- AI assist (suggest-only): rewrite selection, fix compile error, convert Markdown → LaTeX; always shows a diff.
- Playground link: LaTeX drills (tables, math, bibliography) in the tricks domain.

### 8.3 Parity with a normal LaTeX editor
Already there (v5): asset upload (images, PDFs, other files), drop files onto the editor, insert image/photo/logo/PDF/`\input` snippets, friendly compile errors, 14 templates.

Add:
- **Language support in Monaco:** LaTeX syntax highlighting (Monarch tokenizer), autocomplete for commands, environments, `\ref`/`\label` keys and `\cite` keys from the project's `.bib`, snippet tab-stops, auto-closing `\begin{…}`/`\end{…}`, bracket and environment matching, folding by section, find/replace, go to label, word count.
- **Images, fully:** paste an image from the clipboard, drag from the desktop, **figure wizard** (caption, label, width, placement `htbp`, subfigures side by side), live thumbnail on hover over `\includegraphics`, SVG converted to PNG in the browser (the compile service cannot render SVG), `graphicx` added to the preamble automatically when missing.
- **Tables:** grid editor ↔ `tabular`/`tabularx`/`booktabs`; paste CSV or spreadsheet cells to get a table.
- **Math:** visual math editor (MathLive, MIT) that emits LaTeX; KaTeX hover preview for inline/display math; symbol picker.
- **References:** `.bib` manager; add by DOI (free doi.org content negotiation / Crossref API) or paste BibTeX; `\cite` autocomplete.
- **Packages:** detect commands that need a package and offer to add the `\usepackage` line.
- **Compile:** engine choice pdfLaTeX / XeLaTeX / LuaLaTeX (latexonline supports all three, free), auto-compile after typing pauses, click an error to jump to its line.
- **Projects:** multi-file (§8.2), import an Overleaf-style ZIP, export ZIP.

### 8.4 Drag-and-drop building blocks — everywhere it helps
One shared **Blocks palette** (`components/blocks/`), built on the already-installed dnd-kit:
- A block = `{ id, label, icon, category, insert, requires? }`; `insert` is text with tab-stops or a structured payload; `requires` lists packages or setup it needs (added automatically).
- Three ways to use every block: **drag** it to a drop position, **click** to insert at the cursor, or type `\` / `/` / Ctrl+K to search it. Keyboard and touch sensors on, so nothing depends on a mouse.
- Adapters: Monaco (drop at the pointer's text position), plain textarea, and dnd-kit sortable lists.

LaTeX palette categories: Structure (section, subsection, paragraph), Text (bold, italic, lists, quote, footnote, hyperlink), Figures (image, figure, subfigures, wrapfigure), Tables, Math (equation, align, matrix, fraction, sum/integral, symbols), References (cite, ref, label, bibliography), Layout (columns, page break, spacing, margins), CV entries (experience, education, skill group), Letter parts (opening, closing, signature).

Wherever else it applies:
| Place | Drag-and-drop |
|---|---|
| Playground — coding | palette of language constructs and data-structure skeletons (starting points; evaluation still judges the result on correctness, time, complexity and quality) |
| Playground — SQL lab | drag tables/columns from the schema browser into the query |
| Playground — system design | drag components (load balancer, cache, queue, DB, CDN, worker) onto the canvas, connect them, run the traffic sim |
| Playground — git | drag commits to reorder in the interactive-rebase simulator |
| Playground — agents / decisions | drag tools into an agent spec; drag question types (`choice`/`score`/`noul`) to build a decision request |
| CV editor | reorder sections, entries and bullets; drag skill chips; drag an accepted Playground suggestion (§5) into a section |
| Cover letters, outreach, email templates | drag variables (`{{company}}`, `{{role}}`, `{{contact.firstName}}`) and saved paragraphs |
| Applications | existing kanban; drag a document or contact onto an application to attach it |
| Todos | reorder by priority; drag onto a day to schedule |
| Dashboard | reorder and hide widgets (saved per user) |
| Expenses | drop a CSV to import; drag an expense onto a category to recategorise |
| Settings › AI routing (v14) | drag models into each task's fallback order |
| Documents | drop files anywhere on the page to upload; merge order (exists) |

### 8.5 Design informed by Overleaf (research 2026-09-26, primary sources)
How Overleaf works:
- Overleaf's source editor is **CodeMirror 6** (switched Nov 2022), with its own Lezer LaTeX grammar.
- Autocomplete draws on commands (including user-defined ones), environments, `\ref` labels, `\cite` keys, package names and file paths.
- "Code Check" lints as you type; there is a section outline and folding.
- A visual mode is built from CM6 decorations, with MathJax previews.
- There are a figure modal (upload, project file or URL, emitting a `figure` environment), a table generator and a symbol palette.
- Spell check is Hunspell compiled to WASM, running in a worker.
- Compiling runs server-side in **CLSI**: latexmk with `-synctex=1`, a choice of pdfLaTeX/XeLaTeX/LuaLaTeX, "stop on first error", draft mode via the `graphicx` draft option, incremental sync, a 60 s default timeout, and auto-compile with a 2.5 s debounce and 5 s maximum wait.
- The **log is parsed in the browser** into errors and warnings with jump-to-line.
- The PDF preview uses PDF.js, and SyncTeX lookups run on the server.
- History keeps snapshots and labels, with restore and diff.

**Licensing rule:** Overleaf is **AGPL-3.0**, and so are SwiftLaTeX, texlyre-busytex and `codemirror-lang-latex` (which is derived from Overleaf's grammar). Employ **learns from the design and does not copy code**. It uses only permissively licensed libraries:
- CodeMirror 6 (MIT)
- `@codemirror/legacy-modes` stex (MIT)
- PDF.js (Apache-2.0)
- synctex-js (MIT)
- busytex scripts (MIT; the TeX Live binaries carry their own licenses)

Licenses still to verify before adoption: KaTeX/MathJax, JSZip/fflate, `@codemirror/merge`.

**Decisions:**
| # | Feature | Employ approach | Effort |
|---|---|---|---|
| 1 | Editor core | **Replace Monaco with CodeMirror 6**, bundled and self-hosted (drops the jsDelivr dependency; ~119 KB gz vs Monaco ~852 KB gz) | M |
| 2 | Highlighting | `@codemirror/legacy-modes` stex via StreamLanguage (MIT) | S |
| 3 | Autocomplete | Own completion sources on the same categories as Overleaf (commands incl. `\newcommand`, environments as snippets, `\ref`/`\label`, `\cite` from project `.bib`, file paths for `\input`/`\includegraphics`), from a regex index of the project files | M |
| 4 | Errors | Own log parser in `lib/latex/errors.ts` using the same method: rejoin 79-column wraps, `!` + `l.<n>`, `(`/`)` file stack, warnings; jump to line | S |
| 5 | Auto-compile | 2.5 s debounce, 5 s max wait; "stop on first error" toggle; Ctrl/Cmd+Enter and Ctrl/Cmd+S to compile | S |
| 6 | Code Check | CM6 linter: `\begin`/`\end`, braces, `\left`/`\right`, `$`/`$$`, math-only commands outside math | S |
| 7 | Outline and folding | Section outline (`\section*`…) with click-to-jump; fold by section | S |
| 8 | Draft mode | Prepend `\PassOptionsToPackage{draft}{graphicx}` for fast previews | S |
| 9 | Multi-file | Main document = root `.tex` containing `\documentclass`; the tarball compile already supports multiple files | M |
| 10 | PDF preview | PDF.js viewer (Apache-2.0) replacing the plain iframe | S |
| 11 | Figure / table / symbols / math | Figure dialog on the asset store; grid → `tabular`; symbol palette JSON with package hints; math hover preview (KaTeX, license to verify) | M |
| 12 | `.bib` | Key search and autocomplete; add by DOI (§8.3) | S |
| 13 | History | Snapshots and labels in Neon (within the §9.6 budget); diff with `@codemirror/merge` | M |
| 14 | In-browser compile | **busytex** (MIT scripts, TeX Live 2023) behind a setting, lazy-loaded and cached; latexonline stays the fallback. Every one of the 14 templates must be tested first (moderncv, altacv and fontawesome package coverage is unverified). Assets of 32 MB+ go against the §5.5/§9.6 engine budget, so this is opt-in | L |
| 15 | SyncTeX | Only possible with in-browser TeX (latexonline returns only the PDF or the log): read `output.synctex.gz` and resolve with synctex-js. Before that, fall back to text-search mapping from a PDF click back to the source | M |
| 16 | Spell check | Browser `spellcheck` first; Hunspell WASM later if needed | S |
| — | Visual rich-text mode | Skip for now; the drag-and-drop blocks (§8.4) cover ease of use | — |
| — | Real-time collaboration, track changes, comments | Skip: single-user app | — |

Order: 1–8 first, as the editor upgrade. Then 9–13. Then 14–15, which depend on in-browser TeX passing template tests.

## 9. Platform & reliability

1. **Visual QA + E2E:** screenshot pass at 390 px and 1440 px on every authed page (dev-only test login, never a copied session token); Playwright journeys: find → save → apply → interview → offer; scam quarantine; email suggestion accept.
2. **Backups:** weekly GitHub Actions job runs `pg_dump` against Neon, encrypts with `age` (public key in repo secret), uploads as a private artifact with 90-day retention. Restore runbook in `docs/`. Settings › Data: **export all my data** (JSON + documents ZIP) and **delete account**.
3. **AI budget meter:** per-provider usage vs free-tier limits (requests/tokens per minute/day) from `ai_call_logs`; routing (v14) automatically moves to the next free model before hitting limits; dashboard warning at 80 %.
4. **Error monitoring:** Sentry Developer (free) for client + server errors, source maps uploaded at build; PII scrubbing on; fallback self-hosted `error_events` table if the user prefers no third party (toggle in Settings).
5. **Audit log & undo:** every automated or suggestion-accepted change (status, category, merge, quarantine) writes `audit_events` (before/after JSON); "Undo" for 7 days on the activity feed.

## 9.6 Free-tier architecture (hard constraints)
Employ runs on **Vercel Hobby** and **Neon Free**, and every feature must fit. The limits below were verified from the vendors' docs on 2026-09-26.

| Vercel Hobby | Limit |
|---|---|
| Cron | once per day per job, ±59 min precision, up to 100 jobs |
| Function duration | max 300 s |
| Server CPU | **4 h active CPU per month**; 360 GB-h memory |
| Traffic | 1M invocations; 100 GB fast data transfer; 10 GB origin transfer |
| Deploys | 100 deployments/day, 1 concurrent build, 45-minute build |
| Logs | runtime logs kept 1 hour |
| Use | non-commercial personal use only |

| Neon Free | Limit |
|---|---|
| Storage | **0.5 GB per project** |
| Compute | 100 CU-hours/month; scale-to-zero after 5 min (cannot disable) |
| Egress | 5 GB/month |
| Point-in-time restore | 6 hours |
| Branches | 10 |

When compute or egress is exhausted, **the database is suspended until next month**: the app goes down, though no data is lost.

**Design rules that follow:**
1. **Compute lives in the browser.**
   - Playground engines, simulations, scoring of attempts, format and regex exercises, and LaTeX preview helpers all run client-side.
   - Server functions only read/write data and call AI (I/O wait does not count as active CPU).
   - CPU-heavy server work (PDF rendering, CV scoring) is measured, and moved to the browser where it can be.
2. **Background work fits the daily cron.**
   - The single daily job becomes several staggered daily jobs (sync, discovery, radar ingest, curriculum scout, digest). Each stays well under 300 s and resumes from a checkpoint if it runs out of time.
   - Anything heavier (Playground Forge validation, scenario generation, backups, Lighthouse/benchmark CI) runs on **GitHub Actions**. Public repositories get unlimited standard-runner minutes; private repositories get 2,000 minutes/month, which the Forge must budget for.
3. **Forge output doesn't redeploy the app.**
   - Content packs are small JSON stored in Neon and cached in the browser. Only engine code changes go through a deploy.
   - This keeps within 100 deploys/day and one build at a time.
4. **Storage budget for Neon's 0.5 GB:**
   - **Replays are tiny by design:** the simulation is deterministic, so a replay only needs the seed, the pack and engine versions, and the user's inputs, compressed in the browser (CompressionStream). The full event log is rebuilt on demand.
   - Budgets per table, with `ai_call_logs` aggregated after 90 days and raw rows pruned.
   - Large files (documents, PDFs) stay small or are generated on demand; nothing big is stored twice.
   - History is never deleted to save space. When the budget tightens, old detail is compacted (the aggregates stay exact) and the user is asked to export or archive first.
5. **Keep Neon asleep when idle.**
   - No polling or heartbeats; the Playground saves drafts to IndexedDB and writes to the DB once per attempt.
   - Batch writes, cache reads in the browser, and limit query payload sizes to protect the 5 GB egress.
6. **Static engine assets:** v86 image, Pyodide, PGlite and similar are self-hosted with immutable caching and a service worker, so each is downloaded once per device. A total engine budget (≤ 60 MB, lazy per exercise) protects the 100 GB transfer allowance.
7. **Free-tier meter in Settings:**
   - Live usage vs every limit above (DB size, CU-hours, egress, function invocations, active CPU where exposed, AI tokens).
   - Warnings at 70 % and 90 %; automatic throttles before a hard stop (the Forge pauses, pruning runs, non-essential crons skip).
   - Because runtime logs last 1 hour, errors go to the app's own `error_events` table (§9.4).
8. **Backups matter more:** point-in-time restore is only 6 hours, so the weekly encrypted `pg_dump` via GitHub Actions (§9.2) is required, not optional.
9. **Personal use:** Hobby is non-commercial personal use, which matches Employ. Anything commercial would need Vercel Pro.

## 10. Master roadmap (all approved items, in build order)

| # | Item | Spec |
|---|---|---|
| 1 | Merge CV scoring (v12.0) + Model Lab core (v14.0); migration renumbering; full CI; push | v12, v14 |
| 2 | Integration pass: CV score surfaces, keys to Settings › AI, **Lab → Playground rename** | v11, v17 §0 |
| 3 | Visual QA + journey E2E | v17 §9.1 |
| 3a | **Architecture A1–A3**: production-only migrations + Neon preview branches, file storage budget, durable job queue replacing the monolithic cron | architecture review 2026-09-26 |
| 3a-2 | **Google Drive file storage** (drive.file scope, Employ/ folder, browser-direct uploads, Picker, migrate existing bytea assets) | architecture review A2 |
| 3b | **Free-tier meter + guardrails** (usage vs Vercel Hobby / Neon Free limits, staggered daily crons, storage budgets, error_events) | v17 §9.6 |
| 4 | **Scam Shield** | v17 §1 |
| 4b | **Opportunity Score** (criteria, weights UI, 2×2 view, questions to ask) | v17 §6.6 |
| 5 | Email → status suggestions | v17 §2 |
| 6 | Backups + export/delete, audit log & undo | v17 §9.2, §9.5 |
| 7 | Playground core (placement, adaptive selection, coding + complexity evaluation) | v13.0–13.2 |
| 7b | **Self-evolving curriculum** (learner model, demand + version-drift signals, Fresh track) + **Radar ingest** (v16.0) pulled forward so trends feed the Playground early | v13 §6.1, v16.0 |
| 7c | **Employ Sim foundation** (browser-only engine, ShopLite reference system, scenario runner, measured scoring) | v13 §5.3 |
| 7d | **Playground Forge** (open-source-model agents that grow scenarios and the engine around your level) + Playground performance budgets in CI | v13 §5.4, §5.5, §6.2 |
| 8 | **CV suggestions from Playground** + skill-gap loop | v17 §5, §4 |
| 9 | **LaTeX Studio** (new kinds, standalone editor, editor parity) + shared **Blocks palette** in LaTeX, CV editor and templates | v17 §8.1–8.4 |
| 9b | Blocks palette in the remaining places (todos, dashboard, expenses, AI routing, documents) | v17 §8.4 |
| 10 | Goals/streaks, weekly review, energy check-ins | v12.1, v17 §7.3–7.4 |
| 11 | Outcome learning, rejection review | v17 §3, §6.3 |
| 12 | Ghost/duplicate detection, relocation filters, salary log | v17 §6 |
| 13 | Networking cadence + referrals, LinkedIn import | v12.2, v16.5 |
| 14 | Offer comparison, company briefs | v12.3, v17 §6.2 |
| 15 | Mock interview (Whisper) | v12.4 |
| 16 | PWA + share target, Telegram bot | v12.5, v17 §7.1–7.2 |
| 17 | Remaining Playground formats (SQL, concurrency, system design sim, incident drills, CTF, git), each with its drag-and-drop blocks | v13.3–13.7, v17 §8.4 |
| 17b | Playground expansion: cyber security, pipelines, packages, servers, command line (bash, PowerShell, cmd), conflicts; cloud & scale (Docker, Kubernetes, AWS, Azure, Redis, queues, sync/async, API integration, SDKs, monolith vs modular, multi-server) | v13.8–13.13 |
| 18 | Model/agent Playground extras, AI budget meter, error monitoring | v14.1–14.5, v17 §9.3–9.4 |
| 19 | GitHub + Hugging Face connections | v15 |
| 20 | Radar briefs, Jev provider, injection lab, cross-platform issues | v16.1–16.4 |

Each item ships behind the usual gate: tests first, lint → typecheck → test → eval → e2e → build, then push.
