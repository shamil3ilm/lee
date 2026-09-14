import { auth } from '@/lib/auth'

export default auth((req) => {
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
