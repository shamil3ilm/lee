import { handleCapture } from '@/lib/linkedin-posts/capture-handler'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/capture — the "Send to lee" bookmarklet's target. Authenticated
 * by the user's capture key in the form body (the cross-site POST carries no
 * session cookie); see lib/linkedin-posts/capture.ts. No GET: nothing is
 * accepted from a URL.
 */
export async function POST(req: Request): Promise<Response> {
  return handleCapture(req)
}
