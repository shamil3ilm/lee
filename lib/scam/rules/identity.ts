import { findAll } from '../text'
import type { EvidenceSpan, ScamFields } from '../types'
import { fired, type Rule } from './types'

const ID_TERM = String.raw`(?:aadhaa?r(?:\s+card)?|aadhar|pan\s*(?:card|number|no\.?)|passport(?![- ]size)|driving\s+licen[cs]e|voter\s*id|emirates\s*id|national\s*id|iqama|ssn|social\s+security(?:\s+number)?)`
const ASK = String.raw`(?:send|share|submit|upload|provide|forward|whatsapp|attach|scan|copy\s+of|photo\s+of|picture\s+of|image\s+of|details\s+of)`

const ID_REQUEST = new RegExp(String.raw`\b${ASK}\b[^.\n]{0,30}\b${ID_TERM}`)
const ID_ANY = new RegExp(String.raw`\b${ID_TERM}`)

const BANK_TERM = String.raw`(?:otp|one[- ]time\s+password|bank\s+(?:account\s+)?(?:details|number|statement|login|password)|account\s+number|ifsc(?:\s+code)?|debit\s+card|credit\s+card|card\s+(?:details|number)|cvv|upi\s+pin|net\s*banking(?:\s+(?:id|password|login))?|atm\s+pin)`
const BANK_ASK = String.raw`(?:send|share|submit|provide|forward|tell\s+us|give\s+us|whatsapp|disclose|mention)`
const BANK_REQUEST = new RegExp(String.raw`\b${BANK_ASK}\b[^.\n]{0,30}\b${BANK_TERM}\b`)

const GOOGLE_FORM = /(?:forms\.gle\/\S+|docs\.google\.com\/forms\S*|google\s+form)/

/** "…at the time of joining", "after the offer" — documents after an offer are normal. */
const POST_OFFER =
  /\b(?:after|upon|on|at\s+the\s+time\s+of|during|post)[- ]?\s*(?:the\s+)?(?:offer|selection|joining|onboarding)\b|\bbackground\s+verification\b/i

function sentenceAround(text: string, start: number, end: number): string {
  const from = Math.max(text.lastIndexOf('.', start), text.lastIndexOf('\n', start)) + 1
  const dot = text.indexOf('.', end)
  const nl = text.indexOf('\n', end)
  const stops = [dot, nl].filter((i) => i >= 0)
  const to = stops.length > 0 ? Math.min(...stops) : text.length
  return text.slice(from, to)
}

function preOffer(fields: ScamFields, spans: EvidenceSpan[]): EvidenceSpan[] {
  return spans.filter((s) => {
    const text = fields[s.field]
    return !POST_OFFER.test(sentenceAround(text, s.start, s.start + s.text.length))
  })
}

export const identityRules: readonly Rule[] = [
  {
    id: 'identity.id_documents',
    group: 'identity',
    weight: 35,
    label: 'Asks for Aadhaar / PAN / passport or other ID before any offer',
    detect: (ctx) =>
      fired(preOffer(ctx.fields, findAll(ctx.fields, ID_REQUEST, undefined, { negatable: true }))),
  },
  {
    id: 'identity.bank_otp',
    group: 'identity',
    weight: 45,
    label: 'Asks for bank details, card numbers or an OTP',
    detect: (ctx) =>
      fired(preOffer(ctx.fields, findAll(ctx.fields, BANK_REQUEST, undefined, { negatable: true }))),
  },
  {
    id: 'identity.form_with_id',
    group: 'identity',
    weight: 25,
    label: 'Sends you to a Google Form that collects ID details',
    detect(ctx) {
      const form = findAll(ctx.fields, GOOGLE_FORM, ['description', 'applyUrl'], { max: 1 })
      if (form.length === 0) return null
      const id = findAll(ctx.fields, ID_ANY, undefined, { negatable: true, max: 1 })
      return id.length > 0 ? fired([...form, ...id]) : null
    },
  },
]
