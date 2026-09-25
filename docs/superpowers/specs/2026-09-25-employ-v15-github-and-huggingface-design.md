# Employ — v15 GitHub + Hugging Face Connections

**Date:** 2026-09-25
**Status:** Approved — ready for implementation
**Depends on:** v14.0 (encrypted key store `lab_provider_keys`, provider registry), v13 Academy, v12 CV scoring, v2 GitHub public-repo sync

---

## 1. Connection model (security first)

- **Neither GitHub nor Hugging Face becomes a sign-in provider.** Sign-in stays Google-only because `allowDangerousEmailAccountLinking` is enabled on the single Google provider; adding a second identity provider would make email-based linking an account-takeover vector.
- Both are **connections**: the user pastes a token in Settings › Connections; it is stored with the v14 encryption (AES-256-GCM, HKDF from `AUTH_SECRET`), masked in the UI, decrypted only server-side.
- **Least privilege guidance in the UI:**
  - GitHub: fine-grained personal access token, **public repositories read-only** (optionally read access to the user's own private repos if they want private contribution stats). No write scopes.
  - Hugging Face: **Read** access token (plus "Make calls to Inference Providers" if the user wants hosted inference).
- Everything also works token-less for public data at lower rate limits; the token raises limits and unlocks personal data.

## 2. GitHub

### 2.1 Your profile as evidence
- Repos, languages, stars, commit activity, merged PRs to other projects (GitHub Search API: `author:<login> is:pr is:merged -user:<login>`)
- Feeds **CV**: contribution highlights as candidate project bullets (existing distill flow, now with PR evidence)
- Feeds **CV scoring**: skills evidenced by real code count as supported evidence
- Feeds **Academy**: languages/frameworks with real activity seed placement ratings

### 2.2 Open-source contribution finder
- Search issues labelled `good first issue` / `help wanted` in repositories whose languages/topics match the user's skills **or** their Academy growth targets
- Filters: language, repo activity (recent commits), stars, issue age, comments count, "not already assigned"
- Save an issue → **Contribution tracker**: states `interested → claimed → PR open → merged / closed`, linked PR auto-detected by polling (in the daily cron, rate-limit aware)
- Contributions become achievements and CV evidence

### 2.3 Learning from real code
- **Real-bug debugging drills**: closed issues that have a linked fix PR → Academy "debug this real bug" exercise (issue text + pre-fix code excerpt; the fix diff is the reference). Excerpts are fetched live and attributed with repo link + license.
- **PR review practice**: pick a merged PR in a repo of interest → user reviews the diff → compare against the actual review comments
- **Architecture reading list**: trending / well-regarded repos per topic → annotated reading tasks

### 2.4 Discovery tie-in
- Companies behind active OSS orgs → company discovery source (extends existing `github_trending` adapter with org metadata)

## 3. Hugging Face

### 3.1 Hub browser (`/lab/hub`)
- Search **models, datasets, Spaces** via the public Hub API: filter by task (text-generation, text-classification, feature-extraction, ASR…), library, license, size, downloads, likes, "runs in browser" (ONNX / transformers.js / MLC builds)
- Model card summary, license badge, link out

### 3.2 Try it
- **Hosted**: "Try in Arena" for models served by HF Inference Providers (uses the v14 registry `huggingface` provider with the user's token)
- **Spaces as tools**: a generic **Gradio Space client** (generalizes the existing Laya client): read a Space's API schema, call any public Gradio Space endpoint → usable as an **Agent Lab tool** (user-approved per Space)
- **In-browser**: models with ONNX / MLC builds → run via transformers.js / WebLLM (v14.4)

### 3.3 Agents
- Browse agent-oriented Spaces and tool collections; import a Space as an agent tool
- Academy AI-engineering track content drawn from open agent patterns (tool calling, ReAct, multi-agent), practiced in Agent Lab

### 3.4 Datasets for practice
- Hugging Face dataset viewer API returns rows as JSON → load a sample into the **Academy SQL lab** (PGlite) as a real-world dataset for query/indexing exercises
- License shown; samples only (row caps) — no bulk mirroring

## 4. Data model

```
connections            (user_id, provider: 'github'|'huggingface', encrypted_token, iv, auth_tag, token_last4,
                        account_login, scopes_note, connected_at, last_synced_at)      -- unique(user_id, provider)
oss_contributions      (id, user_id, repo_full_name, issue_number, issue_url, title, labels text[],
                        status, pr_url, pr_state, created_at, updated_at)
github_profile_cache   (user_id, data jsonb, fetched_at)
hf_saved_items         (id, user_id, kind: 'model'|'dataset'|'space', hub_id, notes, created_at)
```
(If v14's `lab_provider_keys` generalizes cleanly, `connections` may reuse the same encryption helpers and table pattern rather than duplicating.)

## 5. Surfaces
- **Settings › Connections** — GitHub + Hugging Face cards (connect / test / disconnect, scopes guidance)
- **Learn › Open Source** (`/learn/open-source`) — contribution finder + tracker
- **Learn › Model Lab › Hub** (`/lab/hub`) — HF browser
- CV page — "Import from GitHub contributions"
- Academy — real-bug drills, PR review practice, HF datasets in SQL lab
- Dashboard next-best-action can suggest a good-first-issue aligned with a growth target

## 6. Rate limits & cost
- All free: GitHub REST/Search with token (search has a lower per-minute limit — queue and cache), HF Hub API public, HF Inference within the free monthly credit, Spaces free.
- Cache aggressively (profile daily, search results 1h), back off on 403/429 with clear UI states.

## 7. Phasing
- **15.0** Connections (encrypted tokens, test, disconnect) + GitHub profile sync → CV/CV-score evidence
- **15.1** Contribution finder + tracker (+ cron PR detection)
- **15.2** HF Hub browser + "Try in Arena" + generic Gradio Space client
- **15.3** Spaces as Agent Lab tools; HF datasets in SQL lab
- **15.4** Academy integrations: real-bug drills, PR review practice, reading list

## 8. Constraints
- Read-only tokens only; never request write scopes
- Tokens encrypted at rest, masked, never logged or returned
- Third-party code/data shown with source link and license; excerpts only
- Lint 0 errors, typecheck, tests, eval, build green per phase
