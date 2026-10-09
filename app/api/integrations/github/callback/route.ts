import type { NextRequest } from 'next/server'
import { handleOAuthCallback } from '@/lib/integrations/callback'
import { completeGitHubConnect } from '@/lib/integrations/github/service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

/** GitHub App user authorization callback (Settings › Integrations › Connect GitHub). */
export async function GET(req: NextRequest) {
  return handleOAuthCallback(req, 'github', ({ userId, ...input }) => completeGitHubConnect(userId, input))
}
