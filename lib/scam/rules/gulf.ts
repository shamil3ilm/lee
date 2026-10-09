import { findAll } from '../text'
import { CUR } from './money'
import { fired, type Rule, type RuleContext } from './types'

/**
 * Gulf recruitment-agency fee scams (the Kerala-to-Gulf pattern): the
 * candidate pays the "agency" for the medical, attestation, visa stamping,
 * the air ticket or a "package", usually over WhatsApp, with the offer
 * letter promised after payment. Legitimate employers pay these costs and
 * licensed Indian agents' fees are capped, so a candidate-paid Gulf fee is
 * a strong signal on its own; with an amount it is decisive.
 *
 * Legit postings that only NAME the things ("medical insurance", "visa
 * provided", "degree attestation required", "salary + service charge" in a
 * hotel, "annual air ticket") never fire: every pattern needs a fee or a
 * payment, and fees "borne by the company" are negated.
 */

const FEE = String.raw`(?:charges?|fees?|cost|amount|payment)`

const GULF_FEE: readonly RegExp[] = [
  new RegExp(String.raw`\bmedical\s+(?:test\s+|check-?up\s+|examination\s+|fitness\s+|screening\s+)?${FEE}\b`),
  new RegExp(String.raw`\battestation\s+${FEE}\b`),
  new RegExp(String.raw`\b(?:visa\s+)?stamping\s+${FEE}\b`),
  new RegExp(String.raw`\bservice\s+(?:charges?|fees?)\b[^.\n]{0,40}\b(?:visa|stamping|selection|deployment)\b`),
  new RegExp(String.raw`\b(?:after|on|upon)\s+(?:the\s+)?visa\s+stamping\b[^.\n]{0,40}\b(?:pay|charges?|fees?)\b`),
  new RegExp(String.raw`\bvisa\s+(?:processing\s+)?${FEE}\b`),
  /\bpay\s+(?:for\s+)?(?:your|the)\s+(?:own\s+)?(?:work\s+|employment\s+)?visa\b/,
  new RegExp(String.raw`\b(?:air\s+)?tickets?\s+(?:charges?|fare|cost|amount)?\s*(?:will\s+be\s+|to\s+be\s+)?(?:deducted|recovered|adjusted)\b`),
  new RegExp(String.raw`\b(?:emigration|e-?migrate|mofa|embassy|gamca|wafid|police\s+clearance|pcc|biometrics?|deployment|ticket)\s+${FEE}\b`),
  /\bvisit\s+visa\b[^.\n]{0,60}\b(?:package|job\s+guarantee|guaranteed\s+(?:job|placement))\b/,
  new RegExp(String.raw`\bpackage\s+(?:of\s+|amount\s+|cost\s+)?${CUR}\s*\d[\d,]*[^.\n]{0,40}\b(?:includ\w*|with|covers?)\s+(?:the\s+)?visa\b`),
  /\b(?:100\s*%\s*)?job\s+guarantee\w*\b/,
  /\brefundable\s+(?:\w+\s+){0,2}deposit\b|\b(?:ticket|visa)\s+deposit\b/,
]

/** A stated amount next to a Gulf fee makes it decisive. */
const WITH_AMOUNT = new RegExp(String.raw`${CUR}\s*\d[\d,]*`)

const OFFER_FOR_FEE: readonly RegExp[] = [
  /\boffer\s+letter\b[^.\n]{0,60}\b(?:after|on|upon|against|once\s+you\s+(?:pay|make))\s+(?:the\s+|your\s+)?(?:payment|paying|deposit|fees?)\b/,
  /\b(?:pay|payment|fees?|charges?|deposit)\b[^.\n]{0,60}\b(?:before|to\s+(?:get|receive|issue|release|confirm|secure|book))\s+(?:the\s+|your\s+)?offer\s+letter\b/,
  /\boffer\s+letter\s+(?:fee|charges?)\b/,
]

const PASSPORT_AND_FEE: readonly RegExp[] = [
  /\b(?:send|submit|share|courier|hand\s+over|deposit)\s+(?:your\s+)?(?:original\s+)?passport\b[^.\n]{0,50}\b(?:fees?|payment|charges?|amount|money)\b/,
  /\b(?:fees?|payment|charges?|amount)\b[^.\n]{0,50}\b(?:with|and|along\s+with)\s+(?:your\s+)?(?:original\s+)?passport\b/,
]

const MESSAGING = /\b(?:whats\s?app|telegram)\b/
/** A request to pay (not "pay package" or "payments team"). */
const PAYMENT_ASK = new RegExp(
  String.raw`\b(?:pay|transfer|deposit|send)\s+(?:the\s+|a\s+|your\s+|us\s+)?(?:fees?|amount|money|charges?|deposit|payment|${CUR}\s*\d|\d)` +
    String.raw`|\b(?:payment|fees?|charges?)\s+(?:via|through|by|on|to)\s+(?:upi|gpay|google\s+pay|phonepe|paytm|whats\s?app|bank\s+transfer|our\s+(?:office|account))\b` +
    String.raw`|\b(?:upi|gpay|phonepe|paytm)\s+(?:id|number|no\.?)\b`,
)

/** "Visa fees, medical test charges and air ticket are paid by the company." */
const EMPLOYER_PAYS =
  /\b(?:paid|borne|covered|provided|reimbursed|taken\s+care\s+of|sponsored)\s+(?:for\s+)?by\s+(?:the\s+)?(?:company|employer|client|us|hiring\s+company)\b|\bfree\s+of\s+(?:cost|charge)\b|\bat\s+(?:the\s+)?(?:company|employer)(?:'s)?\s+(?:cost|expense)\b/i

/** The sentence around a span (split on . ! ? and line breaks). */
function sentenceOf(text: string, start: number, end: number): string {
  const before = text.slice(0, start)
  const from = Math.max(before.lastIndexOf('.'), before.lastIndexOf('!'), before.lastIndexOf('?'), before.lastIndexOf('\n')) + 1
  const rest = text.slice(end).search(/[.!?\n]/)
  return text.slice(from, rest === -1 ? text.length : end + rest)
}

function gulfFee(ctx: RuleContext) {
  const spans = GULF_FEE.flatMap((p) => findAll(ctx.fields, p, undefined, { negatable: true }))
    .filter((s) => !EMPLOYER_PAYS.test(sentenceOf(ctx.fields[s.field], s.start, s.start + s.text.length)))
    .slice(0, 3)
  if (spans.length === 0) return null
  const amount = spans.some((s) => WITH_AMOUNT.test(sentenceOf(ctx.fields[s.field], s.start, s.start + s.text.length).toLowerCase()))
  return fired(spans, amount ? { weight: 55, label: 'Asks you to pay Gulf agency charges with a stated amount (medical, attestation, visa, ticket…)' } : {})
}

export const gulfRules: readonly Rule[] = [
  {
    id: 'money.gulf_agency_fee',
    group: 'money',
    weight: 45,
    label: 'Asks you to pay Gulf agency charges (medical, attestation, visa stamping, ticket, package)',
    detect: gulfFee,
  },
  {
    id: 'money.offer_letter_fee',
    group: 'money',
    weight: 45,
    label: 'Offer letter only after you pay',
    detect: (ctx) => fired(OFFER_FOR_FEE.flatMap((p) => findAll(ctx.fields, p, undefined, { negatable: true })).slice(0, 2)),
  },
  {
    id: 'identity.passport_with_fee',
    group: 'identity',
    weight: 40,
    label: 'Asks for your passport together with a fee',
    detect: (ctx) => fired(PASSPORT_AND_FEE.flatMap((p) => findAll(ctx.fields, p, undefined, { negatable: true })).slice(0, 2)),
  },
  {
    id: 'channel.messaging_payment',
    group: 'channel',
    weight: 25,
    label: 'WhatsApp / Telegram contact that also asks for a payment',
    detect(ctx) {
      const chat = findAll(ctx.fields, MESSAGING, undefined, { max: 1 })
      if (chat.length === 0) return null
      const pay = findAll(ctx.fields, PAYMENT_ASK, undefined, { negatable: true, max: 1 })
      return pay.length > 0 ? fired([chat[0]!, pay[0]!]) : null
    },
  },
]
