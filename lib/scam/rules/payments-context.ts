import type { EvidenceSpan, ScamFields } from '../types'
import { CUR } from './currency'

/**
 * Payments and remittance JDs name fees, deposits and money-transfer brands
 * as the WORK ("reconcile processing fees", "integrate Western Union
 * payouts", "validate Visa fees"). A scam names them as something the
 * CANDIDATE pays ("pay a processing fee of Rs 1500", "send the balance via
 * Western Union"). The fee and cheque rules keep a match when its sentence
 * asks the candidate to pay, and drop it when the sentence is about payments
 * work and asks the candidate for nothing.
 *
 * Kept deliberately narrow: no word here appears in the Gulf agency-fee
 * vocabulary (visa, medical, ticket, attestation, package, agent), so those
 * rules stay as strong as before.
 */

/** Payments / remittance / billing domain vocabulary (the job's subject matter). */
const PAYMENTS_DOMAIN = new RegExp(
  [
    String.raw`\breconcil\w*`,
    String.raw`\bsettlements?\b`,
    String.raw`\bmerchants?\b`,
    String.raw`\bgateways?\b`,
    String.raw`\bpsps?\b`,
    String.raw`\bacquir(?:er|ers|ing)\b`,
    String.raw`\bissuers?\b|\bissuing\b`,
    String.raw`\binterchange\b`,
    String.raw`\bscheme\s+fees?\b`,
    String.raw`\bcard\s+networks?\b|\bmastercard\b|\bamex\b|\bmada\b|\bknet\b`,
    String.raw`\bmdr\b`,
    String.raw`\bchargebacks?\b`,
    String.raw`\bledgers?\b`,
    String.raw`\bcorridors?\b`,
    String.raw`\bremittances?\b`,
    String.raw`\bpayouts?\b`,
    String.raw`\bswift\b|\biso\s*20022\b|\bmt103\b`,
    String.raw`\bbilling\b|\binvoic\w*`,
    String.raw`\bfee\s+engine\b|\bpricing\s+engine\b`,
    String.raw`\b(?:transaction|fx)\s+(?:fees?|charges?|markups?)\b`,
    String.raw`\bapis?\b|\bwebhooks?\b|\bsdks?\b`,
    String.raw`\bintegrat\w*`,
    String.raw`\bcorrespondent\s+banks?\b`,
    String.raw`\bkyc\s+vendors?\b`,
  ].join('|'),
  'i',
)

/**
 * The sentence asks the candidate to pay or hand money over: "you must pay",
 * "to be paid by the candidate", "deposit … before the interview",
 * "keep 10% and send the balance", "receive funds into your account".
 */
const CANDIDATE_PAYS = new RegExp(
  [
    String.raw`\b(?:you|candidates?|applicants?|trainees?|interns?|selected|shortlisted|joiners?)\b[^.\n]{0,40}\b(?:pay|deposit|transfer|remit|send|wire|forward|receive)\b`,
    String.raw`\b(?:paid|payable|borne|deposited|charged)\s+(?:by|from)\s+(?:the\s+)?(?:you|candidates?|applicants?|employees?|trainees?|selected)\b`,
    String.raw`\b(?:pay|deposit|transfer|send|wire)\b[^.\n]{0,40}\b(?:to\s+(?:us|our|the\s+(?:company|agent|recruiter|hr))|our\s+(?:agent|office|account))\b`,
    String.raw`\byour\s+(?:own\s+)?(?:registration|processing|joining|training|verification|security|visa)\b`,
    String.raw`\b(?:before|to\s+(?:confirm|book|secure|activate|get|receive))\b[^.\n]{0,30}\b(?:interview|joining|offer|seat|slot|merchant\s+id|id\s+card|onboarding)\b`,
    String.raw`\bkeep(?:ing)?\s+\d+\s*%`,
  ].join('|'),
  'i',
)

/** The sentence around a span (split on . ! ? ; and line breaks). */
export function sentenceAt(text: string, start: number, end: number): string {
  const before = text.slice(0, start)
  const from = Math.max(before.lastIndexOf('.'), before.lastIndexOf('!'), before.lastIndexOf('?'), before.lastIndexOf(';'), before.lastIndexOf('\n')) + 1
  const rest = text.slice(end).search(/[.!?;\n]/)
  return text.slice(from, rest === -1 ? text.length : end + rest)
}

export function asksCandidateToPay(sentence: string): boolean {
  return CANDIDATE_PAYS.test(sentence)
}

export function isPaymentsWork(sentence: string): boolean {
  return PAYMENTS_DOMAIN.test(sentence)
}

/** An amount with a currency: "Rs 1500", "AED 3,500", "$250". */
const AMOUNT = new RegExp(String.raw`${CUR}\s*\d[\d,]*|\d[\d,]*\s*(?:rs|inr|aed|sar|qar|kwd|omr|bhd|usd|dollars|rupees)\b`, 'i')

/** Distinct payments terms a whole posting must name to read as a payments job. */
export const PAYMENTS_JOB_MIN_TERMS = 3

/** True when the posting as a whole is about payments work (3+ distinct terms). */
export function isPaymentsJob(fields: ScamFields): boolean {
  const text = `${fields.title}\n${fields.description}`
  const re = new RegExp(PAYMENTS_DOMAIN.source, 'gi')
  const terms = new Set([...text.matchAll(re)].map((m) => m[0].toLowerCase()))
  return terms.size >= PAYMENTS_JOB_MIN_TERMS
}

/**
 * Keep a fee / transfer match only when it is plausibly a demand on the
 * candidate:
 *  - its sentence asks the candidate to pay → keep (always);
 *  - its sentence is about payments work → drop;
 *  - in a payments job, a bare mention with no amount ("MIS on processing
 *    fees") → drop; with an amount ("registration fee Rs 500") → keep;
 *  - anywhere else → keep, as before.
 * Plain scam wording outside payments jobs is untouched.
 */
export function withoutPaymentsWork(fields: ScamFields, spans: readonly EvidenceSpan[]): EvidenceSpan[] {
  if (spans.length === 0) return []
  const paymentsJob = isPaymentsJob(fields)
  return spans.filter((s) => {
    const sentence = sentenceAt(fields[s.field], s.start, s.start + s.text.length)
    if (asksCandidateToPay(sentence)) return true
    if (isPaymentsWork(sentence)) return false
    return !paymentsJob || AMOUNT.test(sentence)
  })
}
