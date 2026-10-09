import type { NextRequest } from 'next/server'
import { handleOAuthCallback } from '@/lib/integrations/callback'
import { completeLinkedInConnect } from '@/lib/integrations/linkedin/service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

/** Sign In with LinkedIn (OpenID Connect) callback (Settings › Integrations › Connect LinkedIn). */
export async function GET(req: NextRequest) {
  return handleOAuthCallback(req, 'linkedin', ({ userId, ...input }) => completeLinkedInConnect(userId, input))
}
