import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { appOrigin, type IntegrationProvider } from './config'
import { stateCookieName, stateCookieOptions } from './oauth-state'

/**
 * SERVER-ONLY. Shared shape of the OAuth callback routes
 * (app/api/integrations/{github,linkedin}/callback): the signed-in user
 * only (a signed-out callback goes to /signin and burns nothing), the
 * state cookie is read and always cleared, and the user lands back on
 * Settings › Integrations with a short status code — never a token or a
 * provider error text in the URL.
 */

export interface CallbackInput {
  userId: string
  code: string | null
  state: string | null
  cookieState: string | null
  error: string | null
}

export async function handleOAuthCallback(
  req: NextRequest,
  provider: IntegrationProvider,
  complete: (input: CallbackInput) => Promise<{ ok: true } | { ok: false; reason: string }>,
): Promise<NextResponse> {
  const origin = appOrigin()
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return NextResponse.redirect(new URL('/signin', origin))
  const params = req.nextUrl.searchParams
  const cookie = stateCookieName(provider)
  const result = await complete({
    userId,
    code: params.get('code'),
    state: params.get('state'),
    cookieState: req.cookies.get(cookie)?.value ?? null,
    error: params.get('error'),
  })
  const status = result.ok ? 'connected' : result.reason
  const res = NextResponse.redirect(new URL(`/settings/integrations?${provider}=${encodeURIComponent(status)}#${provider}`, origin))
  res.cookies.set(cookie, '', { ...stateCookieOptions(provider), maxAge: 0 })
  res.headers.set('cache-control', 'no-store')
  res.headers.set('referrer-policy', 'no-referrer')
  return res
}
