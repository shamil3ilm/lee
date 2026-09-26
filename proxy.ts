import { edgeAuth } from '@/lib/auth/edge'

// Next 16 renamed the `middleware.ts` file convention to `proxy.ts`.
// See node_modules/next/dist/lib/constants.js (PROXY_FILENAME = 'proxy').
// Proxy runs on the Node.js runtime (the Next 16 default; the `runtime`
// segment option is not allowed here). It still uses the adapter-free
// NextAuth instance: it only needs to decode the session JWT, so there is no
// reason to open a database connection on every page request.
//
// This is a fast-path redirect for signed-out page loads, not the security
// boundary: app/(authed)/layout.tsx checks the session on every authed page,
// and every API route authenticates itself.
export default edgeAuth((req) => {
  const isAuthed = !!req.auth
  const url = req.nextUrl
  const isSignin = url.pathname.startsWith('/signin')
  // Defensive: the matcher already excludes /api.
  const isApi = url.pathname.startsWith('/api')
  if (!isAuthed && !isSignin && !isApi) {
    return Response.redirect(new URL('/signin', url))
  }
})

export const config = {
  matcher: [
    {
      // Page routes only. Skipped:
      // - api/*: route handlers authenticate themselves (and /api/auth,
      //   /api/health, /api/cron must stay reachable signed out);
      // - _next/*: build assets, image optimizer, internal routes;
      // - any path with a file extension: public files, favicon, and the
      //   `.rsc` / `.segment.rsc` transport forms of RSC requests.
      source: '/((?!api/|api$|_next/|.*\\..*).*)',
      // Router prefetches only warm the cache; the authed layout still
      // redirects if a signed-out prefetch is ever rendered.
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
