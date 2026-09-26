# lee — v16 AI Radar, Issue Solving, LinkedIn

**Date:** 2026-09-25
**Status:** Approved — ready for implementation
**Depends on:** v13 Academy (modules, labs, XP), v14 Model Lab (provider registry, encrypted keys, arena, decision playground), v15 GitHub + Hugging Face connections, v12.2 networking cadence

Constraint carried from every version: **zero cost**. Every source below is free and keyless (or free-key); anything paid is optional and off by default. Settings live in the UI, never in env flips.

---

## 1. AI Radar — know what's new

### 1.1 Sources (free, fetched in the daily cron, cached)
| Source | What | Access |
|---|---|---|
| Hugging Face Hub | trending models, Spaces, datasets | public API, optional HF token (v15) |
| HF Daily Papers | curated papers of the day | public API |
| GitHub | trending/rising repos by topic (`agents`, `llm`, `inference`…) | Search API, optional token (v15) |
| arXiv | cs.CL / cs.LG / cs.AI new submissions | public API (respect 3 s delay) |
| Hacker News | stories matching watched terms | Algolia API |

Each fetch is rate-limit aware and stored as `radar_items` (source, external id, title, url, published_at, summary excerpt, metrics). Dedup on (source, external id); cross-source clustering by normalized name/URL so "Jev" from a blog, HN and a GitHub repo becomes one **Radar entry**.

### 1.2 Watchlist
- User adds terms/entities to watch (e.g. `Jev`, `Laya`, `Kimi`, `SWE-agent`). Matches are highlighted and pushed to the digest.
- Suggested watches come from the user's Academy targets and CV skills.

### 1.3 Grounded learning briefs
A brief is generated **only** for an entry with ≥ 2 fetched primary sources (official docs/blog, repo README, model card, paper). Otherwise the entry shows "not enough sources for a brief" — no hallucinated explainer (signal gate, `AISkippedError`).

Brief sections, each claim linked to a cited source:
1. **What it is** — one paragraph
2. **Architecture** — model type, key idea, what's novel
3. **Workflow** — how a request flows end to end
4. **How to use it** — API/SDK shape, minimal example, cost/licence
5. **Trade-offs & limits**
6. **Security notes** — known attacks/mitigations
7. **Compared with** — nearest alternatives already in the Radar
8. **Timeline** — first-seen dates per source (repo creation, first commit, model card date, announcement)

Citations are validated the same way CV evidence quotes are: a quoted span must exist verbatim in the fetched source text, otherwise the sentence is dropped. The timeline section is computed from source metadata, never from model output — this prevents "which came first" errors.

### 1.4 Briefs become Academy modules
"Learn this" turns a brief into a v13 module: reading + flashcards (SM-2) + a hands-on lab where one exists (e.g. try the model in the Arena, call the API in the decision playground). Completing it earns XP in the relevant domain.

## 2. Jev (TypeSafe AI) as a study subject and optional provider

Verified facts recorded in the seeded brief:
- Jev: launched **2026-09-15** by TypeSafe AI; "System One" non-autoregressive decision model. `POST https://api.typesafe.ai/v1/systemone`, bearer key, `{ model: "jev-latest" | "jev-1.13.0", state, questions }`; question types `noul` (→ `noul` 0–1), `choice` (→ `choice`, `probabilities`, `confidence`), `score` (→ `score`, `legend`, `probabilities`, `confidence`); errors 401/422/429/529. Paid (reported $0.042/M input tokens, outputs free).
- Laya: open-source (Apache-2.0), repo and HF checkpoints created **2026-09-18/19**, three days after Jev; its README describes compatibility with Jev's wire protocol (`laya-serve` exposes `POST /v1/systemone`).

From the user-supplied references (flowtivity.ai, wavect.io, wilsonwu.me, dev.to/jamilxt; two Medium posts were not fetchable, HTTP 403) cross-checked against Laya's README:
- **Laya architecture:** ModernBERT-large encoder (~395M, 28 bidirectional layers) + ~25M two-layer decision-head transformer = 421M; each option is preceded by a `[MASK]` marker whose hidden state is scored (temperature-scaled softmax); act-vs-escalate gate; RLCD training (strictly proper scoring rules). Checkpoints: `laya` (English, 512 ctx), `laya-multilingual` (mmBERT-base, 322M, 1024 ctx), `laya-typed-decisions` (fine-tuned, 1024 ctx). A `Router` detects script/language in <1 ms and dispatches.
- **Running it:** `pip install laya` → `Router(preload=True).predict(state, questions)`; `laya[serve]` → `laya-serve` on `POST /v1/systemone` (schema-identical to Jev, `LAYA_API_KEY` bearer, `model` = `english|multilingual|typed-decisions`); `laya[onnx]` for ONNX Runtime. ~33 ms/question on a T4, 7.2 ms batched; CPU 193–464 ms preloaded.
- **Porting differences from Jev:** options share a 192/256-token budget (≈20 options before trimming; 422 when they no longer fit) vs Jev's 255; every score level needs a description; Laya `confidence` = 1 − normalised entropy (not Jev's formula) — gate on `answer_confidence` instead.
- **Accuracy reality:** zero-shot ≈0.34–0.36 on typed-decisions (below the ≈0.46 majority baseline); fine-tuned `laya-typed-decisions` 0.766 vs Jev 1.13.0's 0.727 (different prompts/samples — not a head-to-head). Jev is far stronger zero-shot (Banking77 0.870 vs 0.425), has a 64k context and fewer failure modes on long option lists; its known "jagged edges" are literal reading, counting/arithmetic and date comparison. Laya checkpoints ship over-confident (English on Bengali: 0.080 accuracy at 0.945 confidence).
- **Already applied (v16 prep):** the Laya chain entry is confidence-gated — below 0.7 probability of the reported answer the answer is tentative and Groq is asked; the tentative answer still beats the keyword heuristic. Laya choice confidence now prefers `answer_confidence`. yes/no reads the `noul` field.

### 2.0 Threshold fitting + fine-tuning lab (zero cost)
- Model Lab (v14) gains **threshold fitting**: run labelled examples (the user's own decisions, e.g. corrected expense categories) through Laya, plot accuracy vs coverage, and save a per-question threshold in Settings › AI (replaces the 0.7 default).
- Academy lab: **fine-tune Laya** with the upstream Kaggle notebook (free 2× T4, ~4 h) on the user's exported decisions, push to their HF account, and point Settings › AI › Laya endpoint at a `laya-serve` running it.

### 2.1 `jev-http` decision provider
- New `DecisionProvider` implementation sharing a wire-protocol module with the Laya client (`lib/decisions/systemone-wire.ts`: request builder + answer parser for `noul`/`choice`/`score`).
- Key stored via v14 encrypted key store; **off by default** (paid). Never part of the default chain — only selectable explicitly in the decision playground and model-routing settings.
- A self-hosted `laya-serve` endpoint can use the same client (just a different base URL), giving a free local path.

### 2.2 Decision playground comparison
Same state + questions → Jev vs Laya vs Groq vs heuristic side by side: answer, probability/confidence, latency, tokens, cost. Runs are logged to `ai_call_logs` like any other call.

### 2.3 Prompt-injection lab (Academy security domain)
Sandboxed exercise: the user plants injected text in a state and observes how verdicts shift across providers, then applies mitigations (keep untrusted/tool output out of the state, deterministic pre-checks, human checkpoint) and re-measures. No real side effects — all inputs are synthetic.

## 3. Issue solving across platforms (extends v15 §2.2)

### 3.1 Sources
| Platform | Query | Access |
|---|---|---|
| GitHub | `good first issue` / `help wanted`, matched to skills + Academy targets | v15 connection |
| GitLab | issues with `good first issue`-style labels on public projects | public API, optional PAT |
| Codeberg / Gitea | same via Gitea API | public API |
| Hugging Face | model/Space discussions tagged as bugs/questions | public API |
| Stack Overflow | unanswered questions in the user's tags | Stack Exchange API (free, keyless quota) |

### 3.2 Workflow — human-authored, AI-assisted
`found → understanding → reproducing → fix drafted → submitted → merged/accepted`
- AI helps **understand** (summarize thread, map to code), **plan** (likely files, test to write), and **reproduce** (steps checklist). The user writes the fix/answer and submits it on the platform themselves.
- **No auto-posting**, no auto-PRs, no auto-answers. Before starting, the card shows the repo's `CONTRIBUTING` and any AI-contribution policy found (or Stack Overflow's generative-AI policy), so the user doesn't violate it.
- Linked PR/answer is detected by polling; merged/accepted items become **CV evidence** (v12 scoring) and **Academy XP**.

## 4. LinkedIn — the legitimate free path

Reality: LinkedIn's open API gives only sign-in basics; profile, connections, messaging and jobs APIs need partner approval, and scraping/automation violates the User Agreement. So v16 uses **no LinkedIn API and no scraping**.

### 4.1 Data-export import
User downloads their archive (Settings & Privacy › Get a copy of your data) and uploads the ZIP. Parsed client-safe server-side, never stored raw:
- `Profile.csv`, `Positions.csv`, `Education.csv`, `Skills.csv` → profile + CV evidence, diff against the current CV
- `Connections.csv` → Contacts (dedupe by name + company; email only if present) and seeds v12.2 networking cadence
- `Invitations.csv`, `Messages.csv` → last-touch dates for cadence (message bodies are not stored; only counterpart + timestamp)
Re-import is idempotent (natural keys + upsert).

### 4.2 Profile optimizer
Scores headline, About, experience bullets and skills against target roles using the v12 scoring engine (Role/Skills/Impact/Readability), with the same no-new-claims autofix rule.

### 4.3 Post composer
Drafts posts (project shipped, contribution merged, learning brief takeaway). "Open in LinkedIn" uses the public share URL with the text copied to the clipboard — the user posts manually.

## 5. Data model (new tables)
- `radar_items`, `radar_entries` (cluster), `radar_watches`, `radar_briefs` (sections JSON, citations, prompt version/hash)
- `issue_leads` (platform, external id, url, repo/tag, state, linked submission url, timestamps)
- `linkedin_imports` (hash of archive, counts, imported_at) — contacts/profile rows reuse existing tables

All user-scoped; all writes go through existing service/query layers with integration tests on PGlite.

## 6. UI placement (v11 journey nav)
- **Learn** group: `Radar` (feed, watchlist, briefs) next to Lab and Decisions
- **Find** group: `Issues` (cross-platform issue leads)
- **Settings › Connections**: GitLab/Codeberg/Stack Exchange optional tokens; **Settings › Imports**: LinkedIn archive upload
- Dashboard next-best-action learns: "New brief on a watched term", "Issue lead matches a target skill", "Networking cadence overdue"

## 7. Phases
- **16.0** Radar ingest (HF, GitHub, arXiv, HN) + watchlist + feed
- **16.1** Grounded briefs with verbatim-citation check and computed timeline; brief → Academy module
- **16.2** `systemone-wire` shared module, `jev-http` provider (optional key), playground comparison
- **16.3** Prompt-injection lab
- **16.4** Cross-platform issue leads + workflow tracker + CV/XP hooks
- **16.5** LinkedIn archive import + profile optimizer + post composer

## 8. Risks
- **API quotas:** all fetchers back off on 429 and skip that run; the feed shows staleness per source.
- **Hallucinated briefs:** gated on sources + verbatim citation check; timeline never model-generated.
- **ToS:** no scraping (LinkedIn), no automated posting anywhere, AI-policy surfacing before contributions.
- **Cost creep:** Jev is the only paid thing and is opt-in with a visible per-call cost estimate.
