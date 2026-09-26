# lee — v14 Model & Agent Lab

**Date:** 2026-09-25
**Status:** Approved — ready for implementation
**Scope:** Try, compare, evaluate and adopt open-source models and agents — at zero cost
**Depends on:** v10/v10.1 (logging, prompt versioning, eval harness), v8 decision providers

---

## 1. Goals

1. **Try any model** — open-source models from free hosted tiers, in-browser, or on the user's own machine
2. **Compare models** side by side on the same prompt — latency, throughput, cost, quality
3. **Evaluate models on real tasks** — run the existing eval suites (parse job, tailor CV, outreach, CV scoring, …) against any model
4. **Build and test agents** — model + instructions + tools, with full step traces, compared across models and agent patterns
5. **Adopt what works** — route each lee AI task to the best model based on eval + ratings
6. **Learn** — this is also an Academy track (prompting, RAG, evals, agents, cost/latency trade-offs)

## 2. Provider registry

All model access goes through one pluggable registry. Most providers speak the OpenAI Chat Completions format, so one adapter covers them.

| Provider | Runs | Cost | Access |
|---|---|---|---|
| Groq | hosted | free tier (existing key) | gpt-oss-20b/120b, compound, Whisper, others listed by `/models` |
| OpenRouter | hosted | free `:free` models (rate-limited) | Llama, Qwen, DeepSeek, Mistral, Gemma, … |
| Cerebras | hosted | free tier | Llama / Qwen / gpt-oss family |
| Google AI Studio | hosted | free tier (existing key) | Gemini, Gemma |
| Hugging Face Inference Providers | hosted | small free monthly credit | many OSS models |
| **WebLLM** | **in-browser (WebGPU)** | free, local | Llama, Qwen, Phi, Gemma quantized builds |
| **Ollama (user's machine)** | local, called from the browser | free | anything the user has pulled |
| Laya | HF Space / own Space | free | decisions only (existing provider) |

- Model lists are **fetched live** from each provider's `/models` endpoint where available (no hardcoded catalogue to go stale), cached for a few hours, with a small curated "recommended" list on top.
- Free-tier limits are provider-controlled and change; the lab surfaces rate-limit errors clearly and never assumes a quota.

### Keys (UI-managed, not env)
- Keys are entered in **Settings › AI › Providers**, stored **encrypted at rest** (AES-256-GCM, key derived from `AUTH_SECRET` via HKDF), never returned to the client after save (UI shows `••••last4`), decrypted only server-side at call time.
- Env keys (`GROQ_API_KEY`, `GEMINI_API_KEY`) remain as fallbacks.
- Browser-side providers (WebLLM, Ollama) need no key; their calls never touch the server.

## 3. Model Arena (`/lab/arena`)

- One prompt (system + user, optional JSON schema) → run against 2–6 selected models **in parallel**
- Per result: output, **latency to first token**, **total latency**, **tokens/sec**, input/output tokens, estimated cost (free = $0 but shown at list price for comparison), JSON-schema validity when a schema is given
- **Blind mode**: models hidden as A/B/C until the user votes → builds a personal win-rate table per model
- Streaming output where supported
- Save a comparison as a **run** for later review

## 4. Model Evals (`/lab/evals`)

Reuse the v10.1 eval harness server-side:
- Pick task suites (parse-job, tailor-cv, cover-letter, outreach, prep-pack, debrief, expense-classify, cv-score AI part)
- Pick models → run every fixture against each model
- Score per fixture: **schema validity**, **deterministic checks** (required fields, verified-evidence rate, no invented numbers), **reference agreement** vs golden snapshot, optional **LLM-as-judge** (a chosen judge model with a fixed rubric; judge model and prompt version recorded)
- Report: per-task leaderboard — quality, pass rate, p50/p95 latency, tokens, cost
- Runs stored and diffable over time (did the new model regress on outreach?)

## 5. Agent Lab (`/lab/agents`)

### 5.1 Agent definition
```ts
interface AgentSpec {
  name: string
  model: ModelRef                 // provider + model id
  pattern: 'react' | 'plan-execute' | 'reflexion' | 'single-shot'
  instructions: string
  tools: ToolId[]                 // from the safe registry below
  limits: { maxSteps: number; maxTokens: number; timeoutMs: number }
}
```
Specs are versioned (like prompts) and saved per user.

### 5.2 Safe tool registry
Read-mostly, scoped to the user's own data; no arbitrary network or shell:
- `search_applications`, `get_application`, `list_discoveries`, `get_job`, `get_master_cv`
- `score_cv` (v12), `decide` (decision provider: choice / yes-no / score)
- `calculator`, `run_js` (Web Worker sandbox, timeout, no network)
- `fetch_job_url` (existing SSRF-guarded ingest)
- `create_todo_draft` — **proposes** an action; never executes without approval, and goes through the v9 freshness check before execution

### 5.3 Runs and traces
- Every run records a **step trace**: thought/plan text (if the pattern exposes it), each tool call with arguments and result, tokens and latency per step, final answer
- Trace viewer: timeline + expandable steps + totals
- **Compare**: same task, different models or patterns, side by side — steps taken, tool-call accuracy, total cost/latency, final quality
- **Agent evals**: task suites with expected outcomes (e.g. "find my stalest application and draft a follow-up" → did it call the right tools, reach the right application, avoid invented facts)

### 5.4 Guardrails
- Step, token and time limits enforced server-side
- Tools validate inputs (Zod) and are userId-scoped
- Side-effecting tools only produce **drafts** requiring approval
- Every model call logged to `ai_call_logs` (provider, model, kind `lab_*`, prompt hash) and rateable

## 6. Adopt: per-task model routing

- Settings › AI gains a **task routing table**: each lee AI task (parse_job, tailor_cv, cover_letter, outreach, prep_pack, debrief, cv_requirement_fit, discovery scoring, …) → chosen model, or "default"
- Each row shows that task's eval score and user rating for the current model and suggests the best-scoring alternative from Lab evals ("gpt-oss-120b scores 12 points higher on tailor-cv at +0.4s")
- Routing is read by `getAIProviderForUser(userId, task)`; the fallback chain stays in place (routed model → default → env)

## 7. In-browser & local models

- **WebLLM**: model download on first use (hundreds of MB to a few GB, cached by the browser), WebGPU required; UI shows download progress, device capability check, and a clear "not supported on this device" state
- **Ollama**: user enters the local URL (default `http://localhost:11434`); calls go browser → local machine. Setup hint shows the `OLLAMA_ORIGINS` value needed to allow the app's origin
- Both available in Arena and Agent Lab (agent tools that need server data run via server routes; the model call itself stays local)

## 8. Data model

```
lab_provider_keys   (user_id, provider, encrypted_key, key_last4, created_at, updated_at)   -- unique(user_id, provider)
lab_runs            (id, user_id, kind: 'arena'|'eval'|'agent', config jsonb, created_at)
lab_run_results     (id, run_id, model_ref, output jsonb, metrics jsonb, votes jsonb, error text)
lab_agent_specs     (id, user_id, name, version, spec jsonb, created_at)
lab_agent_traces    (id, run_result_id, steps jsonb, totals jsonb)
ai_task_routing     (user_id, task, provider, model, updated_at)                              -- unique(user_id, task)
```

## 9. Surfaces

- Sidebar **Learn** group: Academy · **Model Lab** (`/lab`) · Decisions
- `/lab` hub: providers status, recent runs, personal model leaderboard
- `/lab/arena`, `/lab/evals`, `/lab/agents`, `/lab/agents/[id]`, `/lab/runs/[id]`
- Settings › AI › Providers (keys) and Task routing

## 10. Phasing

- **14.0** Provider registry + OpenAI-compatible adapter + encrypted keys + live model lists + Arena (parallel, metrics, blind voting)
- **14.1** Model Evals over existing suites + leaderboard + judge model
- **14.2** Agent Lab — specs, safe tools, ReAct loop, traces, compare
- **14.3** Per-task routing + suggestions from eval results
- **14.4** WebLLM + Ollama in-browser/local providers
- **14.5** Agent evals + more patterns (plan-execute, reflexion) + Academy "AI engineering" track

## 11. Constraints
- Zero cost: free tiers, in-browser, local; nothing requires a paid account
- Secrets encrypted at rest, never sent back to the client, never logged
- All model output treated as untrusted; tool inputs validated; side effects draft-only
- Lint 0 errors, typecheck, tests, eval, build green per phase
