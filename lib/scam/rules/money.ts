import { findAll } from '../text'
import { fired, type Rule } from './types'

/** Currency tokens common in India, the Gulf and the US. */
export const CUR = String.raw`(?:₹|\$|(?<![a-z])(?:rs\.?|inr|usd|aed|dhs?\.?|sar|qar|kwd|omr|bhd)(?![a-z]))`

const FEE_NOUN = String.raw`(?:fees?|charges?|deposit|amount)`

const UPFRONT_FEE = [
  new RegExp(
    String.raw`\b(?:registration|joining|training|processing|visa\s+processing|onboarding|application|documentation|verification|kit|interview|refundable|security|caution|placement|enrol?ll?ment|admin(?:istrative)?|courier|id\s+card|laptop\s+security)\s+${FEE_NOUN}\b`,
  ),
  new RegExp(
    String.raw`\b(?:pay|deposit|transfer|send)\s+(?:a|an|the)?\s*(?:small|nominal|one[- ]time|minimal|token|refundable)?\s*(?:fee|amount|deposit|charges?)\b`,
  ),
  new RegExp(String.raw`\b(?:pay|deposit|transfer)\s+${CUR}\s*\d[\d,]*`),
  new RegExp(String.raw`\bfee\s+of\s+${CUR}\s*\d[\d,]*`),
]

const EQUIPMENT_BUY =
  /\b(?:buy|purchase|order|procure)\b[^.\n]{0,60}\b(?:equipment|laptop|computer|macbook|software|office\s+supplies|home\s+office|printer|devices?|starter\s+kit)\b/
const EQUIPMENT_HOOK = [
  /\b(?:approved|designated|preferred|our|company'?s?)\s+vendors?\b/,
  /\b(?:send|mail|issue)\s+you\s+(?:a|the)\s+(?:cheque|check)\b/,
  /\breimburs\w*\b[^.\n]{0,40}\b(?:after|once|with\s+your\s+first|in\s+your\s+first)\b/,
]

const CHEQUE = [
  /\b(?:deposit|cash|mobile[- ]deposit)\s+(?:a|the|this)?\s*(?:cheque|check)\b/,
  /\b(?:send|mail|courier)\s+you\s+(?:a|the)\s+(?:cheque|check)\b/,
  /\b(?:wire|transfer|send)\s+(?:back\s+)?the\s+(?:remaining|remainder|balance|excess|difference)\b/,
  /\bmoney\s+orders?\b/,
  /\bwestern\s+union\b/,
  /\bmoneygram\b/,
]

const GIFT_CARD = [
  /\b(?:buy|purchase|send|pay|redeem|scratch)\b[^.\n]{0,40}\b(?:gift\s*cards?|itunes\s+cards?|google\s+play\s+cards?|steam\s+cards?)\b/,
  /\b(?:gift\s*cards?|itunes\s+cards?|google\s+play\s+cards?)\b[^.\n]{0,40}\b(?:codes?|as\s+payment)\b/,
]
const CRYPTO =
  /\b(?:deposit|send|transfer|recharge|top[- ]?up|invest)\b[^.\n]{0,25}\b(?:usdt|bitcoin|btc|tether|crypto(?:currency)?|trc-?20)\b/

function anyOf(patterns: readonly RegExp[], ctx: Parameters<Rule['detect']>[0], negatable = true) {
  return patterns.flatMap((p) => findAll(ctx.fields, p, undefined, { negatable }))
}

export const moneyRules: readonly Rule[] = [
  {
    id: 'money.upfront_fee',
    group: 'money',
    weight: 45,
    label: 'Asks you to pay a fee or deposit (registration, training, security, visa…)',
    detect: (ctx) => fired(anyOf(UPFRONT_FEE, ctx).slice(0, 3)),
  },
  {
    id: 'money.equipment_reimbursement',
    group: 'money',
    weight: 40,
    label: 'You buy equipment from “their vendor” and get reimbursed later',
    detect(ctx) {
      const buy = findAll(ctx.fields, EQUIPMENT_BUY, undefined, { negatable: true, max: 1 })
      if (buy.length === 0) return null
      const hook = anyOf(EQUIPMENT_HOOK, ctx, false)
      return hook.length > 0 ? fired([...buy, hook[0]!]) : null
    },
  },
  {
    id: 'money.cheque_cashing',
    group: 'money',
    weight: 45,
    label: 'Cheque deposit / wire-back or money-order scheme',
    detect: (ctx) => fired(anyOf(CHEQUE, ctx).slice(0, 3)),
  },
  {
    id: 'money.crypto_giftcard',
    group: 'money',
    weight: 40,
    label: 'Payment in gift cards or crypto',
    detect: (ctx) => fired([...anyOf(GIFT_CARD, ctx), ...findAll(ctx.fields, CRYPTO, undefined, { negatable: true })].slice(0, 3)),
  },
]
