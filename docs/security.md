# Security notes

Living notes on lee's security controls. Each section names the module that
owns the control, so new code can reuse it instead of re-inventing it.

## Dependency audit

`pnpm audit --prod` on 2026-10-09:

| Before (next 16.3.5) | After (next 16.3.8 + overrides) |
|---|---|
| 10 advisories: 1 critical, 3 high, 5 moderate, 1 low | 1 moderate |

- `next` 16.3.5 → **16.3.8** (patch releases only: the `next/og` RCE fixed in
  16.3.6; the Image Optimization SSRF, the SSG/ISR cache-poisoning issues, the
  `use cache` Draft Mode leak, App Router metadata disclosure and the dev MCP
  endpoint disclosure fixed in 16.3.8). `eslint-config-next` moved in step.
  There are no other `@next/*` direct dependencies.
- `sharp` (librsvg CVE, ≥ 0.35.5) and `source-map-js` (DoS, ≥ 1.2.2) are
  transitive deps of `next`. `pnpm-workspace.yaml` `overrides` force the
  patched minimum inside next's own semver range. Drop the overrides once
  `next` requires those versions.
- **Remaining: `sprintf-js` (moderate, DoS, no patched version).** Path:
  `mammoth > argparse > sprintf-js`. `argparse` is required only by mammoth's
  CLI (`node_modules/mammoth/bin/mammoth`); the library entry that lee imports
  (`mammoth.extractRawText` / `convertToHtml`) never loads it, so the code is
  unreachable from lee. Accepted; re-check when mammoth drops argparse.

## Outbound requests and SSRF

Every outbound call is either **fixed-host** (the host is a constant in code:
Google, GitHub, AI providers, public job-board APIs) or **variable-host** (the
URL or host comes from a user or a third party). Variable-host calls must use
`safeFetch` (`lib/net/safe-fetch.ts`) or a wrapper on it
(`untrustedDiscoveryFetch`, `fetchPage`):

- `lib/net/ssrf.ts`: http/https only, no `user:pass@`, no local names
  (`localhost`, `*.local`, `*.internal`, single-label), no blocked address in
  any spelling (`lib/net/ip.ts`: IPv4 private/CGNAT/loopback/link-local/
  benchmarking/multicast/reserved; IPv6 loopback/link-local/ULA/multicast and
  IPv4-mapped/compatible/NAT64/6to4 forms), and every DNS answer checked.
- `safeFetch`: connection pinned to the vetted address (undici `Agent` with a
  fixed `lookup`), redirects followed manually and re-checked (default 5
  hops), credentials dropped cross-origin, body capped (default 5 MB).

Variable-host call sites: RSS, JSON-LD, Workday, Oracle ORC, SuccessFactors
and Phenom sources; URL import / profile import / Google Alerts feed
(`fetchPage`); radar brief sources; Scam Shield RDAP (redirects to per-TLD
registries); the Laya endpoint and its key check.

`tests/unit/outbound-fetch-guard.test.ts` fails when a variable-host module
calls a raw fetch, or when any server file adds a raw fetch without being
classified in its reviewed fixed-host list.

## OAuth tokens at rest: `lib/crypto/token-vault.ts`

**The shared module for any stored OAuth/API token** (Google today; the
GitHub and LinkedIn connections should adopt it as-is).

```ts
import { encryptToken, decryptToken, isEncrypted } from '@/lib/crypto/token-vault'
const stored = encryptToken(plain)      // 'enc:v1:<iv>.<tag>.<ciphertext>' (base64url)
const plain2 = decryptToken(stored)     // plaintext; legacy plaintext passes through
isEncrypted(stored)                     // true for an envelope
```

- Crypto: AES-256-GCM with a random 12-byte IV per value, reusing the
  service-key key management in `lib/lab/crypto.ts` (key = HKDF-SHA256 of
  `AUTH_SECRET`). The GCM tag makes tampering (or a changed `AUTH_SECRET`)
  fail loudly on decrypt. `v1` is the envelope version, so a future dedicated
  `ENCRYPTION_KEY` with key ids can be `v2` without breaking old rows.
- `encryptToken` is idempotent (an envelope is returned unchanged) and
  `null`/`undefined`/`''` pass through, so it is safe on optional columns and
  in migrations.
- Store in a plain `text` column; never log or return the decrypted value to
  a client.

How Google uses it (`lib/auth/account-tokens.ts`):

- the Auth.js adapter is wrapped (`withEncryptedAccountTokens`): `linkAccount`
  encrypts `access_token`, `refresh_token` and `id_token`; `getAccount`
  decrypts; the sign-in re-consent patch is encrypted too;
- `lib/google/tokens.ts` is the only reader of token values (Gmail, Calendar,
  Drive and the Picker all go through it): it decrypts, stores refreshed
  access tokens encrypted, and re-encrypts a legacy plaintext row on first
  read (compare-and-set, so a concurrent refresh is not overwritten);
- one-time migration: `pnpm tsx scripts/encrypt-oauth-tokens.ts` (idempotent;
  also exercised by `scripts/pg-smoke.ts` against real Postgres).

For a new provider: encrypt on write (adapter `linkAccount` or your own
insert), decrypt only at the point of use, and add a "stored value is not
plaintext" test like `tests/integration/google-token-encryption.test.ts`.

## Tenancy: ids from input (audit 2026-10-09)

All 46 `'use server'` files and 72 route handlers were traced for ids taken
from input. Rule: every id from a form, body, query or route param is looked
up scoped by the session user (`eq(t.userId, userId)`, or the owned parent
via `appsQ.getById(userId, id)` / `documentsQ.getById` / `companiesQ.getById`
/ `todosQ.linksOwnedBy` …) before anything is written against it.

- Fixed: `createStage` (`addStage` action) inserted a stage + activity for
  any `applicationId`; it now requires `appsQ.getById(userId, id)` and the
  action validates `kind` against `STAGE_KIND_VALUES`. Read joins from
  stages/activities/preps to applications now also require
  `applications.user_id` to match (digest, weekly digest, academy journey,
  next-best-action, analytics, follow-ups). Two-user tests:
  `tests/integration/stages-isolation.test.ts`.
- Verified, already scoped: `app/api/documents/merge` (checks the
  application since it was written; regression test added), every other
  action and route (contacts/companies/todos/variants/documents/assets/
  cv-score/lab/expenses/radar/shortlist links are all checked).
- Hazard, not reachable from input: `labRuns.insertResults/updateResult`
  take no user id; only `lib/lab/arena.ts` calls them, with a run it just
  created for the caller.
