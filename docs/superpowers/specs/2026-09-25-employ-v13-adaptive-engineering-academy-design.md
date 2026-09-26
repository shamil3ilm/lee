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

### 5.1 Extension (2026-09-26): cyber security, pipelines, packages, servers, conflicts
New skill-graph domains (data in `skills.json`, same levels 0–5, same adaptive engine and evaluation):

| Domain | Skills (examples) |
|---|---|
| Cyber security — defensive | log triage and detection rules, alert investigation, incident forensics timeline, hardening, secure headers/CSP/CORS review, secrets rotation |
| Cyber security — offensive (sandboxed) | web exploitation beyond OWASP basics (JWT/session flaws, deserialization, race-condition abuse, business-logic flaws), privilege escalation in a sandboxed VM, recon only against in-app targets |
| Cryptography in practice | hashing vs encryption, password storage, TLS handshake, JWT signing pitfalls, key management |
| Cloud & identity | IAM policy evaluation, least privilege, misconfigured buckets/roles, OAuth/OIDC flows |
| Supply chain | typosquatting, malicious install scripts, lockfile integrity, provenance and signing, SBOMs |
| Pipelines — CI/CD | workflow design, caching, matrices, secrets, artifacts, flaky tests, deploy strategies (blue/green, canary, rollback), migrations in pipelines |
| Pipelines — data | ETL/ELT, idempotent reruns, backfills, late and duplicate data, schema evolution, DAG scheduling |
| Packages & dependencies | semver ranges, lockfiles, peer/diamond dependency conflicts, ESM/CJS packaging and `exports` maps, vulnerability triage, upgrades |
| Servers & infrastructure | Linux (processes, permissions, systemd, disk, logs, cron), networking (DNS, ports, firewalls, HTTP/TLS), web servers and reverse proxies, containers (Dockerfile, image size, non-root), Kubernetes basics (probes, resources, CrashLoopBackOff) |
| Command line & shells | **bash/sh/zsh** (pipes, redirection, quoting and escaping, exit codes, `set -euo pipefail`, functions, globbing), **PowerShell** (object pipeline, cmdlets, `-WhatIf`, error handling, execution policy, remoting basics), **cmd** (batch files, `%VAR%`, `errorlevel`, `for /f`), text tools (grep/sed/awk/jq/cut/sort/uniq/xargs/find), files and permissions (chmod/chown, icacls), processes and services (ps/top/kill/systemctl; Get-Process/Stop-Process/Get-Service; tasklist/taskkill), networking commands (curl/Invoke-WebRequest, ss/netstat, dig/nslookup/Resolve-DnsName, ping/traceroute), ssh/scp/rsync, archives (tar/zip/Compress-Archive), scheduling (cron, Task Scheduler), package managers (apt, brew, winget, choco), developer CLIs (git, docker, kubectl, psql, gh) |
| Conflicts — technical | git text conflicts, **semantic conflicts** (merges cleanly, breaks behaviour), migration-number and lockfile conflicts, concurrent edits (optimistic locking, CRDT/OT concepts) |
| Conflicts — people | code-review disagreements, scope pushback, incident blame, estimates under pressure — handled professionally |

New exercise formats:

| Format | What you do | Scored on | Runs on (free, in-browser) |
|---|---|---|---|
| **Blue-team triage** | Investigate a stream of simulated logs/alerts, write a detection rule, build the incident timeline | true/false positives, time to detect, timeline accuracy | generated log datasets |
| **Hardening review** | Fix a vulnerable config (headers, CORS, cookies, IAM policy, Dockerfile) | issues fixed, nothing broken, least privilege | static analyzers + policy evaluator in TS |
| **Pipeline debugger** | A failing CI workflow (YAML) with logs: fix ordering, caching, secrets, matrix, flaky step; then design a safe deploy with rollback | pipeline passes in the simulator, duration, cost, safety checks | GitHub-Actions-style simulator (parses YAML, runs a step graph with scripted outcomes) |
| **Data pipeline lab** | Build a DAG that survives reruns, late/duplicate data and a backfill | exactly-once results, runtime | DAG runner over PGlite |
| **Dependency resolver** | Resolve semver/peer conflicts, pick safe upgrades, triage advisories, spot a typosquat or malicious postinstall | resolvable tree, vulnerabilities removed, breaking changes avoided | simulated registry; real advisories from the free OSV API (osv.dev) |
| **Package author** | Publish-ready library: `exports` map, ESM/CJS, types, semver bump from a changelog | consumers in the test matrix import correctly | simulated consumers |
| **Server lab** | Real Linux shell: service down, disk full, bad permissions, port clash, broken nginx config, runaway process, cron job | service healthy, root cause, commands used, time | **v86** (x86 emulator in WebAssembly, BSD-licensed) running a small Linux image, cached after first load; lighter simulated shell for quick drills |
| **Terminal tasks** | Real tasks in a virtual filesystem: find the 10 largest logs, extract error rates from a log with a one-liner, bulk-rename files, parse JSON with jq, kill the process on a port, write a safe backup script | end-state correct, command correctness, safety, keystrokes/time | bash on **v86** (real Linux); **PowerShell and cmd via simulated interpreters** covering a curated cmdlet/command set over the same virtual filesystem (with PowerShell's object pipeline modelled). No free in-browser real PowerShell exists, so each exercise states which commands are supported |
| **Cross-shell translation** | Do the same job in bash, PowerShell and cmd (e.g. recursive search, env vars, loops, piping output to a file) | each version correct, idiomatic for its shell | same runtimes |
| **Explain / predict** | Predict what a command prints or changes before running it; explain every flag | prediction matches actual, explanation rubric | same runtimes |
| **Script repair** | Fix a broken bash/PowerShell/batch script: quoting, unset variables, missing error handling, wrong exit codes, Windows vs Unix line endings | script passes scenario tests, no unsafe patterns | same runtimes |
| **Danger zone** | Spot destructive or unsafe commands before running them (`rm -rf $DIR/` with an empty variable, `Remove-Item -Recurse -Force` on the wrong path, `curl … | sh`, `chmod -R 777`) and rewrite them safely | hazards found, safe rewrite (dry-run flags, `-WhatIf`, guards) | static analyzer + runtimes |
| **Command builder** | Drag flags and pipeline stages from a palette to build a command (v17 §8.4 Blocks), then run it; the palette fades as the level rises | correct result, fewer hints used | same runtimes |
| **Container & cluster doctor** | Shrink and secure a Dockerfile; fix pods stuck in CrashLoopBackOff/Pending | image size, security findings, pods healthy | Dockerfile linter rules + Kubernetes state simulator |
| **Conflict resolver** | Git text conflicts (existing), semantic conflicts caught by tests, colliding migration numbers, lockfile conflicts | tests green, history clean, no lost changes | isomorphic-git + in-browser test runner |
| **People-conflict scenario** | Role-play a code-review disagreement or scope pushback with an AI counterpart | rubric: clarity, empathy, outcome, trade-offs stated | AI evaluator with a published rubric |
| **Real-history drills** | Replay bugs from Employ's own history (the order-dependent test leak, the Laya `noul` parsing bug, the double-0013 migration clash) | same as debugging | repo history snapshots |

### 5.2 Extension (2026-09-26): cloud, containers, data stores, messaging, integration, architecture at scale
New or deepened domains:

| Domain | Skills (examples) |
|---|---|
| Docker (deep) | images and layers, multi-stage builds, build cache, `.dockerignore`, volumes and bind mounts, networks, Compose (depends_on, healthchecks, env), non-root and slim images, debugging a container that exits |
| Kubernetes (deep) | pods, deployments, services, ingress, ConfigMaps and Secrets, probes, requests/limits, HPA autoscaling, rolling updates and rollback, namespaces, RBAC, Helm basics, reading `kubectl describe` and events |
| AWS | IAM, VPC and security groups, EC2, S3, Lambda, API Gateway, SQS/SNS, DynamoDB, RDS, CloudWatch, ALB/NLB, cost awareness |
| Azure | Entra ID and RBAC, VNets and NSGs, VMs, Blob Storage, Functions, Service Bus, Cosmos DB, Azure SQL, Monitor, App Gateway and Load Balancer, cost awareness |
| Redis | data types (strings, hashes, lists, sets, sorted sets, streams), TTL and eviction, caching patterns (cache-aside, write-through, stampede protection), rate limiting, distributed locks and their pitfalls, pub/sub, transactions and Lua, persistence (RDB/AOF) |
| Queues & messaging | at-least-once vs exactly-once, visibility timeouts, retries with backoff, dead-letter queues, ordering and partitions, idempotent consumers, outbox pattern, pub/sub vs work queues, Kafka-style logs vs SQS-style queues, backpressure |
| Sync vs async | request/response vs events, blocking vs non-blocking I/O, async/await and event loops, callbacks and promises, sagas and eventual consistency, timeouts and cancellation, when to go async |
| API integration | REST, GraphQL, gRPC and webhooks; auth (API keys, OAuth 2.0 client credentials and auth code + PKCE); pagination, rate limits and 429 handling, retries with idempotency keys, webhook signature verification, versioning, contract testing, mocking third-party APIs |
| SDK design & use | using official SDKs well (config, retries, timeouts, pagination helpers); building a typed SDK: ergonomics, errors, retries, versioning, generated clients from OpenAPI |
| Monolith ↔ modular ↔ services | modular monolith boundaries, dependency rules, shared kernel, when (not) to split, strangler-fig migration, service boundaries, data ownership, distributed-monolith anti-pattern |
| Multi-server & scaling | stateless services, sessions (sticky vs shared store), horizontal vs vertical scaling, load-balancing algorithms and health checks, service discovery, config and secrets distribution, distributed locks and leader election, cache consistency across nodes, blue/green across a fleet |

New exercise formats:

| Format | What you do | Scored on |
|---|---|---|
| **Compose builder** | Wire app + DB + Redis + worker in Compose (drag services from Blocks); fix a stack that won't start | stack healthy, image size, security findings |
| **Cloud architect** | Design on AWS or Azure for a brief (traffic, budget, compliance); the simulator runs traffic, failures and a monthly bill | availability, latency, cost vs budget, least privilege |
| **Cloud CLI tasks** | `aws …` / `az …` commands against a simulated account (IAM, S3/Blob, queues, functions) | end state, least privilege, commands used |
| **Redis lab** | Implement cache-aside with stampede protection, a sliding-window rate limiter, a leaderboard, a lock with a fencing token | correctness under the concurrency simulator, memory, latency |
| **Queue simulator** | Consumers crash, messages duplicate, arrive out of order and poison-pill; make processing exactly-once in effect | no lost or double side effects, throughput, DLQ handling |
| **Sync→async refactor** | Turn a slow synchronous flow into an event-driven one without losing consistency | p95 latency, consistency checks, failure handling |
| **Integration lab** | Integrate a mock third-party API that paginates, rate-limits (429), flakes and sends signed webhooks | complete data, no duplicates, signature verified, backoff correct |
| **SDK workshop** | Build a small typed SDK over that API: retries, pagination iterator, typed errors, versioning | consumer tests pass, API ergonomics rubric |
| **Architecture kata** | Split or merge modules in a codebase; enforce boundaries; plan a strangler-fig migration | dependency rules pass, tests green, migration plan rubric |
| **Scale-out lab** | Take a single-server app to N servers: sessions, cache, locks, health checks, zero-downtime deploy | error rate during scale and deploy, consistency, cost |

**Runtimes:** everything runs in the browser on the Employ Sim engine (§5.3). No external services, no installs, no cloud accounts.

**Safety (applies to all security content):**
- Offensive work targets only sandboxed in-browser apps and the local v86 VM, never real hosts.
- There are no scanners or payloads aimed at the internet, and every exploit ends with the fix.
- Network access from the VM is disabled.

### 5.3 Employ Sim — our own browser playground engine (2026-09-26)
**Decision:** the Playground is browser-only and self-contained.
- No installs, no external sandboxes, no cloud accounts.
- It works from any device, including offline once assets are cached.
- Everything it needs is either open-source code we bundle and serve ourselves, or engines we build.

**Two kinds of runtime:**
1. **Real engines in the browser** (open-source, self-hosted as static assets; no third-party service at runtime):

   | Engine | What it runs |
   |---|---|
   | PGlite | real PostgreSQL (SQL lab, EXPLAIN, data pipelines) |
   | SQLite (WASM) | real SQLite |
   | Pyodide | real Python |
   | Web Workers + QuickJS | real JavaScript/TypeScript user code |
   | isomorphic-git | real git (conflicts, rebase, bisect) |
   | v86 | real Linux (32-bit x86) with bash, coreutils, grep/sed/awk/jq, and real redis-server and nginx inside the VM |

   The v86 disk image is cached in the browser (OPFS/service worker). The VM has no network access to the internet.
2. **Our own simulators**, one discrete-event engine in a Web Worker:
   - **Core:**
     - virtual clock, which can run hours of traffic in seconds;
     - virtual nodes with CPU/memory budgets;
     - a virtual network with latency, packet loss, partitions and DNS;
     - a virtual filesystem;
     - deterministic seeds, so every run is reproducible, replayable and fair to score.
   - **Built on the core, each implementing documented behaviour:**
     - **Redis:** data types, TTL, eviction, MULTI/Lua, pub/sub, streams. Uses the real redis-server in v86 where that's enough.
     - **Queue brokers:** SQS-style visibility timeouts and DLQ; Kafka-style partitions, offsets and consumer groups.
     - **Load balancers:** round-robin, least-connections and consistent hashing; health checks; sticky sessions.
     - **Container runtime model:** Dockerfile interpreter with layers, build cache, image size, users; volumes, networks, Compose.
     - **Kubernetes mini control plane:** reconciliation loops (Deployment → ReplicaSet → Pod), scheduler, probes, HPA, rolling updates, events; with a `kubectl`-style CLI.
     - **Cloud models:** the AWS IAM policy evaluation logic and Azure RBAC as documented; VPC/NSG rules; S3/Blob, functions, queues; a billing meter. Driven by `aws`/`az`-style CLIs.
     - **Shells:** real bash in v86, plus our own **PowerShell** (object pipeline, curated cmdlets) and **cmd** interpreters over the same virtual filesystem.
     - **Mock third-party APIs:** pagination, 429s, flakiness, signed webhooks, OAuth; for integration and SDK work.
     - **Fault injection:** latency, crashes, disk full, clock skew, partitions, bad deploys, poisoned messages.

**The user's work runs for real inside simulated infrastructure.** Code, SQL, scripts and configs execute in the real engines. Services written by the user become processes on virtual nodes. Metrics such as p50/p95/p99 latency, error rate, throughput and cost are measured from the simulation's virtual time, not estimated.

**Fidelity, stated honestly:**
- Simulators model documented behaviour, not every quirk of the real tools.
- Each simulator ships with **conformance tests** derived from the official documentation (for example the Redis command semantics and Kubernetes controller behaviour), and each exercise lists what it covers.
- Concepts, debugging reasoning and command fluency transfer to real systems; exact version-specific quirks may not.
- v86 is 32-bit and slower than native, so heavy workloads use the simulator rather than the VM.

**Grading needs no external AI:**
- Scoring is deterministic: checks, tests, measured metrics, diffs.
- Optional written-answer feedback can use a small model running in the browser via WebGPU (WebLLM). The Radeon 780M can run small models.
- Hosted AI (Groq) is only used if the user turns it on.

**Scenario structure (real-life, not quizzes):**
- **One reference company system:** "ShopLite" = gateway, 3–4 services (modular monolith first, later split), Postgres, Redis cache, queue worker, ≥ 2 replicas behind a load balancer, CI pipeline, logs/metrics/traces. The user learns it the way they would learn a codebase at a job.
- **Scenarios are tickets against it:**
  - on-call incidents (latency spike, queue backlog, disk full, bad deploy, cache stampede, split brain);
  - feature tickets;
  - performance regressions;
  - security findings;
  - migrations (monolith → modules → services, sync → async);
  - third-party integrations;
  - scale-out;
  - code and design reviews.
- **Assessment from measurements:** service-level targets met, tests green, p95/p99 and error rate under load, time to mitigate, blast radius, quality of the change, a short postmortem.
- **Levels follow an engineering career ladder:** Junior → Mid → Senior → Staff differ by scope, ambiguity and blast radius. Promotion checks are multi-scenario "on-call weeks" and migrations.
- **The browser still hosts quick drills** (flashcards, predict-the-output, short coding) alongside the scenarios.

**Engineering constraints:**
- Everything is lazy-loaded per exercise; heavy engines are cached after first use.
- Web Workers keep the UI responsive, with hard time and memory limits.
- Works on desktop; phones get the drills and the lighter scenarios. The v86 and full-system scenarios need a desktop-class browser.

### 5.4 Closing the limitations (2026-09-26)
| Limitation | How we close it |
|---|---|
| Simulators model documented behaviour, not every quirk | **Differential testing against real engines**: our Redis model is checked command-by-command against the real redis-server running in v86, and our shell tools against real bash and coreutils in v86. Divergences become failing conformance tests that must be fixed. Conformance suites grow continuously (§6.2), and each exercise shows its coverage. |
| No real Docker images | **container2wasm** (open source) converts real container images into WebAssembly that runs in the browser. It's used for "run this image" fidelity tasks, lazy-loaded and slower; the fast path stays the simulator. |
| Kubernetes is a model | Our control plane follows the controller behaviour documented upstream, with conformance tests from the Kubernetes docs. Research spike: compile upstream Go components (kwok-style fake nodes) to WebAssembly for a real API server behind the same `kubectl` CLI. |
| PowerShell and cmd are our own interpreters | Coverage grows by measured demand (the commands users actually need). Behaviour tests come from Microsoft's docs. Research spike: open-source PowerShell (MIT) on the .NET WebAssembly runtime; adopt it if the load size and speed fit the performance budgets. |
| v86 is 32-bit and slower | JIT-enabled v86 for shell and server tasks. Heavy workloads run on the simulator's virtual nodes (measured in virtual time, so slowness does not distort scores). container2wasm covers 64-bit userland where needed. |
| Phones are weaker | **Adaptive fidelity**: the engine reads device capability (cores, memory, WebGPU) and picks lighter simulation settings or smaller scenarios. Scores are normalised per scenario version, so the device never changes a grade. |
| In-browser AI is small | Grading is rule-based first. Written answers use a published rubric; an in-browser model (WebLLM) gives feedback, and a larger open-source model is used only if the user enables it. |

### 5.5 Performance budgets (enforced in CI)
The Playground must never slow Employ down.
- **Isolation:**
  - Engines load only inside Playground exercises, lazy-loaded per exercise and cached by a service worker/OPFS after first use.
  - Other pages never download them.
  - Cross-origin isolation (COOP/COEP, needed for SharedArrayBuffer and threads) is applied **only to Playground routes**, so Google sign-in and the rest of the app are unaffected.
- **Budgets:**

  | Metric | Budget |
  |---|---|
  | Playground route initial JavaScript | ≤ 200 KB gzipped |
  | App shell | unchanged |
  | INP (responsiveness) | < 200 ms |
  | Main-thread tasks | < 50 ms |
  | LCP on Playground pages | < 2.5 s |

  Every engine runs in a Web Worker with hard time and memory limits and a cancel button.
- **Server:**
  - No simulation or generation runs on request paths.
  - Generation and validation run offline (§6.2), and results are stored as static content packs.
  - AI calls are budgeted and rate-limited, so job-search features never compete with Playground work.
- **Measured, not assumed:**
  - Lighthouse CI and web-vitals budgets fail the build when exceeded.
  - Simulator benchmarks (events per second, scenario runtime, memory) run in CI with regression alerts.
  - Real-user web-vitals are logged from the browser.

## 6. Never the same twice

- **Parameterized templates**: each exercise template declares generators (input shapes, constraints, schemas, traffic profiles, incident timelines) → fresh variant each time.
- **AI-generated variants**: the AI proposes a new problem + reference solution + tests; the harness **runs the reference solution against the tests** and checks complexity before the variant is ever served. Failed validation = discarded. Every accepted variant gets a difficulty rating that calibrates from attempts.
- **Adaptive difficulty knobs**: input size, constraints, time budget, hint availability, number of concurrent actors, traffic intensity.

### 6.1 Self-evolving curriculum (2026-09-26)
The Playground must not be static: not just fresh variants, but **new skills, new exercises and retired ones**, driven by the user and the industry. `skills.json` becomes the *seed*; each user's live graph is the seed plus a DB overlay (`academy_skill_overlays`, versioned and reversible through the audit log and undo).

**Signals (all free):**
| Signal | Source | Effect |
|---|---|---|
| Your level and behaviour | ratings, attempts, plateau detection, learning velocity, format effectiveness | unlock deeper skills beyond the seed's top level; switch format when a skill plateaus; favour formats that raise *your* rating fastest |
| Trending tech | v16 Radar (HF, GitHub trending, arXiv, Hacker News) + Stack Exchange tag trends + GitHub releases of tools you use | propose new skill nodes ("emerging") with a trend score and citations |
| Job-market demand | skills in saved/applied jobs and discovery feed over time (§4 skill-gap loop) | weight skills the market in your target roles is asking for |
| Version drift | endoflife.date API + GitHub releases (Node, Next.js, React, Python, Kubernetes, PostgreSQL…) | flag exercises written for old versions; generate "what changed" migration drills (e.g. Next.js 16 breaking changes) |
| Your journey | upcoming interviews, rejections (v17 §6.3), GitHub activity (v15), CV gaps | boost exactly what the next step needs |

**Pipeline (daily cron, inside free-tier AI budgets):**
1. **Detect:** score candidate skills and changes from the signals.
2. **Propose:** a skill node (name, domain, prerequisites, "why now" with ≥ 2 cited sources, v16 rule) plus exercise templates using existing formats (coding, terminal, pipeline, SQL, design, security…).
3. **Validate:** nothing is served unvalidated.
   - The reference solution must pass its tests in the sandbox, and complexity and time limits are checked.
   - Security content must pass the safety policy (sandbox-only targets, a remediation step).
   - Duplicates against the graph are rejected.
   - Failures are discarded and logged.
4. **Publish:** into a **"Fresh"** track with a badge. It starts at low selection weight with a v16 brief as reading, and its difficulty is calibrated from attempts.
5. **Review:** a weekly "What's new in your Playground" feed.
   - New *skills and domains* need one-tap acceptance, and a setting can auto-accept within domains you already follow.
   - New *variants* flow automatically.
6. **Refresh or retire:**
   - Outdated exercises are regenerated for the current version.
   - Skills whose trend decays, tech past end-of-life, and exercises with bad quality signals (you flag them, success rates look anomalous, or validation fails after a version bump) are archived.
   - Your XP and history are always kept.

**Learner model beyond ratings:**
- forgetting curves per skill (drives spaced review)
- learning velocity
- which formats work for you
- time-of-day performance, which schedules the daily plan
- a periodic **checkpoint exam** that re-places you so levels never drift from reality

**Transparency:**
- Every item shows **"Why this?"**: for example "weak skill + asked by 4 of your saved jobs + trending this month".
- Every generated item is logged in `ai_call_logs`, is rateable, and is covered by a generator eval suite.

### 6.2 Continuous development — "Playground Forge" (2026-09-26)
Open-source models and agents keep developing the Playground around the user's level, and the Playground keeps improving its own engine. Runtime stays self-contained: everything the Forge produces is shipped as static content or code, and **no AI is needed to play**.

**Where it runs (zero cost):**
- The development loop runs on scheduled **GitHub Actions** and in the daily cron.
- It uses **open-source models** (Qwen-Coder, Llama, DeepSeek, gpt-oss and similar) through the free tiers already in the v14 model registry.
- Optionally it uses a model running locally through Ollama if the user sets one up; this is not required.
- Model choice per agent is routed by the Model Playground (v14) using measured results.

**Agents (each has a narrow job and a checker):**
| Agent | Job | Checked by |
|---|---|---|
| Scenario Author | New tickets, incidents and exercises on ShopLite, aimed at the user's frontier skills (target success ≈ 0.65–0.75) | Validator |
| Validator | Runs every scenario headless on the same Employ Sim engine (Node): the broken state must fail the checks, the reference fix must pass, the result must hold across seeds, and the performance budget must be met | deterministic |
| Loophole Hunter | Tries to "pass" without solving: disable the check, hard-code outputs, delete the failing test. Any success hardens the checks | Validator |
| Fidelity Engineer | Writes conformance tests from official docs; runs differential tests against real engines (v86 redis-server, bash); proposes simulator fixes | CI |
| Engine Improver | Opens pull requests to Employ Sim (new commands, cmdlets, controller behaviour, performance work) with tests | CI + user review |
| Tutor | After each attempt: what went wrong, the concept behind it, what to try next | rubric; rateable |
| Curriculum Scout | Trends, market demand and version drift (§6.1) | ≥ 2 cited sources |

**Loop:**
1. You attempt a scenario.
2. It is scored from measured metrics.
3. The learner model updates.
4. The Forge targets your frontier skills and weak formats.
5. The agents generate content; the Validator and Loophole Hunter check it.
6. It is published as a versioned content pack.
7. Difficulty calibrates from your attempts, and the cycle repeats. The Playground grows with you, level by level.

**Guardrails:**
- **Content is data:** scenario packs use a declarative checks language. Where custom check code is unavoidable, it runs only in the Worker sandbox, never on the server.
- **Human in the loop for code:**
  - Engine pull requests always need the user's merge.
  - Content packs auto-publish only if the Validator and Loophole Hunter pass and the format already exists.
  - New formats or domains need one-tap approval.
  - Every pack is versioned and can be rolled back.
- Everything is logged to `ai_call_logs` with prompt versions, and every agent has an eval suite (v10.1).
- **Budgets:** per-day AI token caps per agent; when free tiers run out, the Forge pauses instead of degrading quality.

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

- **13.S Employ Sim foundation (before 13.3)**: discrete-event core (virtual clock, nodes, network, filesystem, seeds), fault injection, metrics, conformance-test harness, ShopLite reference system v1, scenario runner + measured scoring
- **13.F Playground Forge (after 13.S)**: Validator + Loophole Hunter first, then Scenario Author, Tutor, Fidelity Engineer (differential tests vs v86 engines), Engine Improver PRs; GitHub Actions schedule; content packs; perf budgets in CI
- **13.0 Core engine** — skill graph, ratings, placement (seeded from CV/profile + diagnostic), adaptive selector, daily plan, attempt/evaluation framework, XP/rank/streak/achievements core, Academy home + radar
- **13.1 Coding workbench** — Web Worker runner, hidden tests, empirical complexity fit, acorn quality metrics, optimization + refactoring + debugging formats, Pyodide
- **13.2 SQL lab** — PGlite runner with EXPLAIN-based efficiency, schema/indexing exercises
- **13.3 Simulators** — concurrency interleaving, idempotency/retries/distributed failures with latency percentiles
- **13.4 System design canvas** — component graph + traffic simulator + cost/SPOF + AI rubric
- **13.5 Incident drills + code review + security CTF + git scenarios**
- **13.6 Generation** — parameterized templates everywhere + validated AI variants + difficulty calibration
- **13.7 Path, capstones, boss battles, stats page, journey integrations**
- **13.12 Self-evolving curriculum (lite, ships with 13.6)**: learner model, plateau/format switching, job-market demand, version drift (endoflife.date + GitHub releases), Fresh track, weekly "What's new", retire/refresh; full trend-driven skill proposals once v16 Radar ingest lands
- **13.8 Security expansion**: blue-team triage, hardening review, crypto, cloud IAM, supply-chain drills
- **13.9 Delivery**: pipeline debugger, data pipeline lab, dependency resolver, package author
- **13.10 Infrastructure & command line**: server lab (v86 + simulated shell), terminal tasks in bash/PowerShell/cmd, cross-shell translation, explain/predict, script repair, danger zone, command builder, container & cluster doctor
- **13.13 Cloud & scale**: Docker/Compose, Kubernetes (deep), AWS and Azure simulators + CLI tasks, Redis lab, queue simulator, sync→async, integration lab, SDK workshop, architecture kata, scale-out lab; all on Employ Sim (§5.3)
- **13.11 Conflicts**: semantic, migration and lockfile conflicts; people-conflict scenarios; real-history drills

## 13. Constraints
- Zero cost; in-browser execution; strict worker timeouts and memory caps
- AI calls signal-gated, prompt-versioned, logged, rateable; every generated variant validated before use
- Lint 0 errors, typecheck, tests, eval, build all green per phase
