import { type NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new NextResponse('unauthorized', { status: 401 })
  }
  return NextResponse.json({ status: 'noop', message: 'discovery lands in v1.5' })
}
