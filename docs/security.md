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
