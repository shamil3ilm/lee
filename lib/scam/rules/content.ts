import { findAll, TEXT_FIELDS } from '../text'
import type { EvidenceSpan, ScamFields } from '../types'
import { CUR } from './money'
import { fired, type Rule } from './types'

// ---------------------------------------------------------------------------
// Pay far above the norm
// ---------------------------------------------------------------------------

const AMOUNT = String.raw`(\d[\d,]*(?:\.\d+)?)\s*(k|lakhs?|lacs?)?`
const PERIOD = String.raw`(day|daily|hour|hr|week|task|order|review|like)`
const PAY_PER = new RegExp(
  String.raw`${CUR}\s*${AMOUNT}(?:\s*(?:-|to|–)\s*${CUR}?\s*${AMOUNT})?(?:\s*\/-)?\s*(?:\/|per|a|each|every)?\s*${PERIOD}\b`,
  'gi',
)
const PAY_PER_AMOUNT_FIRST = new RegExp(
  String.raw`\b${AMOUNT}(?:\s*(?:-|to|–)\s*${AMOUNT})?\s*${CUR}(?:\s*\/-)?\s*(?:\/|per|a|each|every)?\s*${PERIOD}\b`,
  'gi',
)

const EASY_CONTEXT =
  /\bno\s+(?:prior\s+)?(?:experience|skills?|qualifications?)\b|\bfreshers?\b|\bhousewi(?:fe|ves)\b|\bstudents?\b|\bwork\s+from\s+home\b|\bwfh\b|\bfrom\s+(?:your\s+)?(?:home|phone|mobile|smartphone)\b|\bpart[- ]time\b|\bspare\s+time\b/i

type Band = 'inr' | 'hard'
/** [easy-context threshold, always-suspicious threshold] per period, in INR / USD-like units. */
const THRESHOLDS: Record<'day' | 'hour' | 'week', Record<Band, [number, number]>> = {
  day: { inr: [1000, 5000], hard: [100, 1500] },
  hour: { inr: [500, 1500], hard: [40, 150] },
  week: { inr: [7000, 25000], hard: [700, 5000] },
}

function toNumber(raw: string | undefined, unit: string | undefined): number {
  if (!raw) return 0
  const n = Number.parseFloat(raw.replace(/,/g, ''))
  if (!Number.isFinite(n)) return 0
  const u = (unit ?? '').toLowerCase()
  if (u === 'k') return n * 1000
  if (u.startsWith('lakh') || u.startsWith('lac')) return n * 100_000
  return n
}

function normPeriod(p: string): 'day' | 'hour' | 'week' | 'unit' {
  const s = p.toLowerCase()
  if (s === 'day' || s === 'daily') return 'day'
  if (s === 'hour' || s === 'hr') return 'hour'
  if (s === 'week') return 'week'
  return 'unit'
}

function isInr(text: string): boolean {
  return /₹|\brs\.?|\binr\b/i.test(text)
}

function payTooHigh(fields: ScamFields): EvidenceSpan[] {
  const easy = TEXT_FIELDS.some((f) => EASY_CONTEXT.test(fields[f]))
  const out: EvidenceSpan[] = []
  for (const field of ['title', 'description', 'salary'] as const) {
    const text = fields[field]
    if (!text) continue
    const matches = [...text.matchAll(PAY_PER), ...text.matchAll(PAY_PER_AMOUNT_FIRST)]
    for (const m of matches) {
      const period = normPeriod(m[5] ?? '')
      const amount = Math.max(toNumber(m[1], m[2]), toNumber(m[3], m[4]))
      let suspicious = period === 'unit' && amount > 0
      if (period !== 'unit') {
        const [easyAt, hardAt] = THRESHOLDS[period][isInr(m[0]) ? 'inr' : 'hard']
        suspicious = amount >= hardAt || (easy && amount >= easyAt)
      }
      if (suspicious) out.push({ field, start: m.index ?? 0, text: m[0] })
      if (out.length >= 3) return out
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Phrase rules
// ---------------------------------------------------------------------------

const EARN =
  /\b(?:earn|earning|income|make|payout|get\s+paid)\b[^.\n]{0,40}(?:daily|per\s+day|every\s+day|weekly|per\s+week|\/\s*day|a\s+day|instantly|same\s+day)\b|\bdaily\s+(?:payouts?|payments?|income|earnings?)\b|\bweekly\s+payouts?\b/
const NO_EXP =
  /\bno\s+(?:prior\s+)?(?:experience|skills?|qualifications?)\s*(?:needed|required|necessary)?|\bfreshers?\s+(?:can|welcome)|\bany(?:one)?\s+can\s+(?:apply|do|join)\b|\bhousewi(?:fe|ves)\b/
const WFH =
  /\bwork\s+from\s+home\b|\bwfh\b|\bfrom\s+(?:your\s+)?(?:home|phone|mobile|smartphone)\b|\bpart[- ]time\b|\bspare\s+time\b|\b\d\s*(?:-|to)\s*\d\s*h(?:ou)?rs?\s*(?:a|per)?\s*day\b/

const TASK_SCHEME = [
  /\blike\s+(?:youtube\s+)?(?:videos?|posts?|pages?)\b/,
  /\b(?:subscribe|like)\s+(?:to\s+)?(?:youtube|instagram|facebook)\b/,
  /\b(?:rate|review|rating)\s+(?:hotels?|restaurants?|products?|apps?|movies?)\b/,
  /\bhotel\s+(?:reviews?|ratings?)\b/,
  /\b(?:product|app|merchant)\s+optimi[sz]ation\s+(?:tasks?|jobs?|work)\b/,
  /\boptimi[sz]e\s+\d+\s+(?:products|apps|orders)\b/,
  /\boptimi[sz]e\s+(?:products?|apps?|orders?)\s+(?:daily|per\s+day|a\s+day|to\s+earn|and\s+earn|for\s+commission)\b/,
  /\bboost\s+(?:app|product|store)\s+(?:ratings?|rankings?|sales)\b/,
  /\bgoogle\s+maps?\s+reviews?\b/,
  /\b(?:five|5)[- ]star\s+(?:reviews?|ratings?)\b/,
  /\bprepaid\s+tasks?\b/,
  /\border\s+grabbing\b/,
  /\bcomplete\s+(?:simple\s+)?tasks?\s+(?:and|to)\s+earn\b/,
  /\bcommission\s+(?:per|on\s+each|for\s+every)\s+(?:task|order|review|like)\b/,
  /\brecharge\s+(?:your\s+)?(?:account|wallet)\b/,
  /\bfollow\s+(?:instagram|social\s+media)\s+accounts?\b/,
]

const URGENCY = [
  /\burgent(?:ly)?\s+(?:hiring|requirement|opening|vacancy|need)\b/,
  /\blimited\s+(?:slots?|seats?|positions|vacancies|openings)\b/,
  /\bonly\s+\d+\s+(?:slots?|seats?|positions|vacancies)\s+(?:left|remaining|available)\b/,
  /\b(?:respond|reply|confirm|pay|register|join)\s+within\s+\d+\s*(?:hours?|hrs?|minutes?|mins?)\b/,
  /\b(?:offer|registration|slots?)\s+(?:is\s+)?(?:valid|closes?|expires?|ends?)\s+(?:only\s+)?(?:today|tonight|within|in\s+\d+)\b/,
  /\bact\s+(?:fast|now|quickly)\b/,
  /\bhurry\b/,
  /\blast\s+(?:chance|date\s+today)\b/,
]

const VAGUE = [
  /\bsimple\s+(?:copy[- ]paste\s+|typing\s+|data\s+entry\s+|online\s+)?(?:tasks?|work|job)\b/,
  /\beasy\s+(?:online\s+)?(?:tasks?|work|job|money)\b/,
  /\bno\s+(?:targets?|selling|sales\s+targets?)\b/,
  /\bjust\s+(?:need|require)\s+(?:a\s+)?(?:smartphone|phone|mobile|laptop|internet)\b/,
  /\bonly\s+(?:a\s+)?(?:smartphone|mobile|phone)\s+(?:and\s+internet\s+)?(?:is\s+)?(?:required|needed)\b/,
  /\bcopy[- ]paste\s+(?:work|job)s?\b/,
  /\bhome[- ]based\s+(?:typing|data\s+entry)\b/,
]

function spans(patterns: readonly RegExp[], fields: ScamFields, negatable = false): EvidenceSpan[] {
  return patterns.flatMap((p) => findAll(fields, p, undefined, { negatable })).slice(0, 3)
}

export const contentRules: readonly Rule[] = [
  {
    id: 'content.pay_too_high',
    group: 'content',
    weight: 30,
    label: 'Pay far above the norm for the work (per day / per task)',
    detect: (ctx) => fired(payTooHigh(ctx.fields)),
  },
  {
    id: 'content.easy_money',
    group: 'content',
    weight: 30,
    label: '“No experience, work from home, earn daily” pitch',
    detect(ctx) {
      const earn = findAll(ctx.fields, EARN, undefined, { max: 1 })
      if (earn.length === 0) return null
      const hooks = [
        ...findAll(ctx.fields, NO_EXP, undefined, { max: 1 }),
        ...findAll(ctx.fields, WFH, undefined, { max: 1 }),
      ]
      return hooks.length > 0 ? fired([...earn, ...hooks]) : null
    },
  },
  {
    id: 'content.task_scheme',
    group: 'content',
    weight: 45,
    label: 'Task scam: like videos, rate hotels, “optimise” products for commission',
    detect: (ctx) => fired(spans(TASK_SCHEME, ctx.fields)),
  },
  {
    id: 'content.urgency',
    group: 'content',
    weight: 15,
    label: 'Urgency or pressure to act immediately',
    detect: (ctx) => fired(spans(URGENCY, ctx.fields)),
  },
  {
    id: 'content.vague_duties',
    group: 'content',
    weight: 15,
    label: 'Vague duties (“simple work”, “just need a phone”)',
    detect: (ctx) => fired(spans(VAGUE, ctx.fields, true)),
  },
]
