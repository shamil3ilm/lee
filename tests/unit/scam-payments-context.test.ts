import { describe, expect, it } from 'vitest'
import { asksCandidateToPay, isPaymentsJob, isPaymentsWork, withoutPaymentsWork } from '@/lib/scam/rules/payments-context'
import { findAll, toFields } from '@/lib/scam/text'

describe('payments context', () => {
  it('reads payments work as the job, not a demand on the candidate', () => {
    expect(isPaymentsWork('Reconcile merchant processing fees across PSPs')).toBe(true)
    expect(isPaymentsWork('Integrate Western Union payouts')).toBe(true)
    expect(isPaymentsWork('Validate Visa fees and Mastercard scheme fees')).toBe(true)
    expect(isPaymentsWork('Registration fee Rs 500 before the interview')).toBe(false)
    expect(isPaymentsWork('Visa fee AED 4000 to be paid by the candidate')).toBe(false)
  })

  it('detects a candidate-directed payment ask', () => {
    expect(asksCandidateToPay('Selected candidates must pay a processing fee of Rs 1500')).toBe(true)
    expect(asksCandidateToPay('Visa fee AED 4000 to be paid by the candidate')).toBe(true)
    expect(asksCandidateToPay('keep 10% and send the remaining balance via Western Union')).toBe(true)
    expect(asksCandidateToPay('You will build and own the services that reconcile processing fees')).toBe(false)
    expect(asksCandidateToPay('Partner with Western Union on payout corridors')).toBe(false)
  })

  it('recognises a payments posting from three or more distinct terms', () => {
    const job = toFields({ title: 'Payments Engineer', description: 'Integrate gateway APIs, reconcile settlement and payouts.' })
    const other = toFields({ title: 'Driver', description: 'Registration fee Rs 500. Merchant area.' })
    expect(isPaymentsJob(job)).toBe(true)
    expect(isPaymentsJob(other)).toBe(false)
  })

  it('drops bare fee mentions in a payments job but keeps a stated amount', () => {
    const fields = toFields({
      title: 'Payments Analyst',
      description: 'Integrate gateway APIs and reconcile settlement files. Prepare MIS on processing fees. Registration fee Rs 500 before joining.',
    })
    const spans = findAll(fields, /\b(?:processing|registration)\s+fees?\b/)
    const kept = withoutPaymentsWork(fields, spans).map((s) => s.text.toLowerCase())
    expect(kept).toEqual(['registration fee'])
  })
})
