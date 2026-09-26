# Performance: instant shell and web vitals

## Decision: no `cacheComponents` (yet)

The authed app shell is made instant with plain streaming instead of Cache
Components / PPR. Evidence (Next 16.3.5, September 2026):

- **Build with `cacheComponents: true` fails with 168 errors.** 101 are
  `export const dynamic` and 67 are `export const runtime` segment configs,
  which Cache Components rejects.
- **After removing those configs, prerendering fails on all 34 authed
  routes.** Each one fails at `app/(authed)/layout.tsx`, where `auth()` reads
  cookies outside `<Suspense>`. The docs' pattern
  (`guides/authentication-with-cache-components.md`) moves the session read
  into a Suspense child. That means rebuilding the sidebar and header so they
  don't need the user.
- **GET route handlers would follow the page prerendering model**
  (`getting-started/caching.md`). During the trial build, the lab API routes
  ran at build time, and their `catch` blocks logged the prerender
  interruption as errors. Any GET handler that doesn't read the request, such
  as `/api/health`, would need `connection()` so it isn't frozen at build
  time.
- **About 90 files call `new Date()`, `Date.now()` or `Math.random()`.** Under
  Cache Components, each call on a prerendered path is a build error that
  `instant = false` does not clear, so every one needs an audit.
- **Navigation would change app-wide.** Routes stay mounted but hidden in
  `<Activity>`, so dialogs, effects and E2E locators behave differently.

What PPR would add on top of the chosen fix: the static shell would come from
the CDN, so first paint would not wait for a cold function start either. What
the chosen fix already does: the shell no longer waits for the database, and
a cold Neon (3 to 4 s) was the bigger part of the delay.

To adopt PPR later, follow the "adopting incrementally" path in
`guides/migrating-to-cache-components.md`:

1. Remove the segment configs.
2. Add `instant = false` everywhere.
3. Fix synchronous IO.
4. Move the session read in the authed layout behind Suspense.
5. Add `connection()` to GET handlers.

## What was done instead

- The authed layout awaits only `getSession()`, a JWT cookie decode with no
  database. The nav badge counts are passed down as a promise and stream into
  per-badge Suspense boundaries (`components/nav/nav-badges.tsx`).
- Each main route has a `loading.tsx` skeleton (`components/page-skeleton.tsx`).
- On Home, the setup checklist gates the widgets below it. Without that, the
  early shell produced a 0.25 CLS.

The shell holds the user's own name and email. It is rendered per request
and never cached, so no user's data can be served to another user.

## Measuring

Measure against a local production build with the CI dummy env.
`PGLITE_QUERY_DELAY_MS=1500` adds latency to every PGlite query to mimic a
cold Neon.

```sh
DATABASE_URL=pglite:<dir> PGLITE_QUERY_DELAY_MS=1500 pnpm start --port 3300
BASE_URL=http://localhost:3300 STORAGE_STATE=<session.json> RUNS=5 \
  pnpm tsx scripts/measure-web-vitals.ts / /applications /cv-score
```

Caveats:

- **Relative numbers only.** Sessions come from the local E2E test identity.
- **Give each server its own PGlite directory.** In a production build, route
  handlers and pages load `lib/db/client` separately. On one PGlite data
  directory, the two instances don't see each other's writes and can abort.
  This is a local-only artifact: Neon doesn't have it.

## Web vitals data model

`web_vitals_daily` has one row per (user, UTC day, route pattern, metric).
Each row holds:

- `count` and `sum`
- `histogram`: 18 fixed buckets. Every Google threshold is a bucket bound, so
  the good / needs-improvement / poor shares are exact.
- `dims`: counters such as `device:desktop`, `conn:4g` and `nav:reload`

p75 is interpolated inside its bucket. The bucket bounds in
`lib/vitals/metrics.ts` are part of the stored format. Rows are kept for 90
days.
