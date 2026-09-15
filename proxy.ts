import { edgeAuth } from '@/lib/auth/edge'

// Next 16 renamed the `middleware.ts` file convention to `proxy.ts`.
// See node_modules/next/dist/lib/constants.js (PROXY_FILENAME = 'proxy').
// This file runs on the Edge runtime, so it must import the edge-safe
// NextAuth instance (no DB adapter — pglite/postgres-js are Node-only).
export default edgeAuth((req) => {
  const isAuthed = !!req.auth
  const url = req.nextUrl
  const isSignin = url.pathname.startsWith('/signin')
  const isApi = url.pathname.startsWith('/api')
  if (!isAuthed && !isSignin && !isApi) {
    return Response.redirect(new URL('/signin', url))
  }
})

export const config = {
  matcher: ['/((?!_next|favicon.ico|api/auth|api/health|api/cron).*)'],
}
