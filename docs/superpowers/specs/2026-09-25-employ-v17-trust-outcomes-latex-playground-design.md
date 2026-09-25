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

## 9. Platform & reliability

1. **Visual QA + E2E:** screenshot pass at 390 px and 1440 px on every authed page (dev-only test login, never a copied session token); Playwright journeys: find → save → apply → interview → offer; scam quarantine; email suggestion accept.
2. **Backups:** weekly GitHub Actions job runs `pg_dump` against Neon, encrypts with `age` (public key in repo secret), uploads as a private artifact with 90-day retention. Restore runbook in `docs/`. Settings › Data: **export all my data** (JSON + documents ZIP) and **delete account**.
3. **AI budget meter:** per-provider usage vs free-tier limits (requests/tokens per minute/day) from `ai_call_logs`; routing (v14) automatically moves to the next free model before hitting limits; dashboard warning at 80 %.
4. **Error monitoring:** Sentry Developer (free) for client + server errors, source maps uploaded at build; PII scrubbing on; fallback self-hosted `error_events` table if the user prefers no third party (toggle in Settings).
5. **Audit log & undo:** every automated or suggestion-accepted change (status, category, merge, quarantine) writes `audit_events` (before/after JSON); "Undo" for 7 days on the activity feed.

## 10. Master roadmap (all approved items, in build order)

| # | Item | Spec |
|---|---|---|
| 1 | Merge CV scoring (v12.0) + Model Lab core (v14.0); migration renumbering; full CI; push | v12, v14 |
| 2 | Integration pass: CV score surfaces, keys to Settings › AI, **Lab → Playground rename** | v11, v17 §0 |
| 3 | Visual QA + journey E2E | v17 §9.1 |
| 4 | **Scam Shield** | v17 §1 |
| 5 | Email → status suggestions | v17 §2 |
| 6 | Backups + export/delete, audit log & undo | v17 §9.2, §9.5 |
| 7 | Playground core (placement, adaptive selection, coding + complexity evaluation) | v13.0–13.2 |
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
| 18 | Model/agent Playground extras, AI budget meter, error monitoring | v14.1–14.5, v17 §9.3–9.4 |
| 19 | GitHub + Hugging Face connections | v15 |
| 20 | Radar, briefs, Jev provider, injection lab, cross-platform issues | v16.0–16.4 |

Each item ships behind the usual gate: tests first, lint → typecheck → test → eval → e2e → build, then push.
