import { referralHint } from '@/lib/integrations/linkedin/connections'
import { logger } from '@/lib/logger'
import { ReferralHintCard } from './referral-hint-card'

interface ReferralHintProps {
  userId: string
  company: string | null | undefined
  role: string | null
  myName: string | null
}

/** "You know 2 people at Careem": the user's own LinkedIn connections at this company. Renders nothing when none. */
export async function ReferralHint({ userId, company, role, myName }: ReferralHintProps) {
  const hint = await referralHint(userId, company).catch((err: unknown) => {
    logger.warn('referral_hint_failed', { err: err instanceof Error ? err.name : 'unknown' })
    return null
  })
  if (!hint) return null
  return <ReferralHintCard hint={hint} role={role} myName={myName} />
}
