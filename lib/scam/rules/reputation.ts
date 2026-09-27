import type { ReputationContext, ScamSignal } from '../types'
import type { RuleContext } from './types'

/**
 * Scam Shield boost from company reputation the user CONFIRMED (never from
 * raw fetched news or an unconfirmed AI draft). Evidence is the company name
 * in the posting, so the signal only fires when the posting names it.
 * Fraud alone reaches "caution"; wage theft alone only adds weight.
 */

export const REPUTATION_WEIGHTS = { fraud: 30, wage_theft: 20 } as const

const LABELS = {
  fraud: 'You confirmed news reports of fraud at this company',
  wage_theft: 'You confirmed reports of unpaid salaries / wage theft at this company',
} as const

function quote(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > 120 ? `${clean.slice(0, 119)}…` : clean
}

export function reputationSignals(ctx: RuleContext, rep: ReputationContext | null | undefined): ScamSignal[] {
  if (!rep || rep.flags.length === 0 || !ctx.companySpan) return []
  const span = ctx.companySpan
  return (['fraud', 'wage_theft'] as const).flatMap((category) => {
    const flag = rep.flags.find((f) => f.category === category)
    if (!flag) return []
    return [
      {
        id: `reputation.${category}_reports`,
        group: 'reputation' as const,
        weight: REPUTATION_WEIGHTS[category],
        label: `${LABELS[category]}: “${quote(flag.text)}”`,
        evidence: [span],
      },
    ]
  })
}
