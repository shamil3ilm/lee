import type {
  ChoiceInput,
  ChoiceResult,
  DecisionProvider,
  ScoreInput,
  ScoreResult,
  YesNoInput,
  YesNoResult,
} from './types'

// Ordered vendor/keyword → category patterns. First hit wins. Ordering
// matters: put more specific patterns first (e.g. 'apple music' before
// 'apple'). All patterns compared case-insensitively.
const EXPENSE_KEYWORD_MAP: ReadonlyArray<{ keywords: string[]; category: string }> = [
  // Subscriptions
  { keywords: ['netflix', 'spotify', 'apple music', 'youtube premium', 'prime video', 'amazon prime', 'disney+', 'hbo', 'openai', 'chatgpt', 'anthropic', 'claude', 'github copilot', 'notion', 'canva'], category: 'subscription' },
  // Utilities
  { keywords: ['dewa', 'electricity', 'power bill'], category: 'electricity' },
  { keywords: ['sewa', 'water bill'], category: 'water' },
  { keywords: ['du', 'etisalat', 'internet', 'wifi', 'broadband', 'fibre', 'fiber'], category: 'internet' },
  // Dining / groceries
  { keywords: ['talabat', 'careem now', 'deliveroo', 'zomato', 'noon food', 'ubereats', 'uber eats'], category: 'dining' },
  { keywords: ['restaurant', 'cafe', 'coffee', 'starbucks', 'costa', 'tim hortons', 'mcdonalds', 'kfc', 'burger', 'pizza', 'shawarma', 'sushi'], category: 'dining' },
  { keywords: ['carrefour', 'lulu', 'spinneys', 'waitrose', 'union coop', 'choithram', 'geant', 'nesto', 'grocery', 'groceries', 'supermarket'], category: 'groceries' },
  // Transport / fuel
  { keywords: ['adnoc', 'enoc', 'eppco', 'fuel', 'petrol', 'diesel', 'gasoline'], category: 'fuel' },
  { keywords: ['uber', 'careem', 'taxi', 'rta', 'metro', 'salik', 'nol'], category: 'transport' },
  // Housing
  { keywords: ['rent', 'ejari', 'apartment', 'landlord'], category: 'rent' },
  { keywords: ['mortgage', 'home loan'], category: 'mortgage' },
  // Health / insurance
  { keywords: ['pharmacy', 'clinic', 'hospital', 'doctor', 'dental', 'lab test'], category: 'health' },
  { keywords: ['insurance', 'policy premium'], category: 'insurance' },
  // Entertainment / shopping
  { keywords: ['cinema', 'vox', 'reel', 'movie ticket', 'concert', 'theatre'], category: 'entertainment' },
  { keywords: ['amazon', 'noon.com', 'noon ', 'namshi', 'shein', 'ikea', 'ace hardware'], category: 'shopping' },
  // Travel
  { keywords: ['emirates', 'flydubai', 'etihad', 'flight', 'airbnb', 'booking.com', 'hotel', 'trip', 'wego'], category: 'travel' },
  // Education
  { keywords: ['coursera', 'udemy', 'edx', 'pluralsight', 'course fee', 'tuition'], category: 'education' },
  // Fees / tax
  { keywords: ['bank fee', 'service charge', 'stripe fee', 'exchange fee'], category: 'fees' },
  { keywords: ['tax', 'vat', 'zakat'], category: 'tax' },
]

/**
 * Deterministic keyword-match provider. Never fails, zero latency, zero
 * cost. Used both as the DECISION_PROVIDER=heuristic direct implementation
 * and as the final fallback layer under the composed provider.
 */
export class HeuristicDecisionProvider implements DecisionProvider {
  async choice<T extends string>(input: ChoiceInput<T>): Promise<ChoiceResult<T>> {
    const haystack = `${input.text} ${input.context ?? ''}`.toLowerCase()
    for (const entry of EXPENSE_KEYWORD_MAP) {
      for (const kw of entry.keywords) {
        if (haystack.includes(kw)) {
          if ((input.options as readonly string[]).includes(entry.category)) {
            return { pick: entry.category as T, confidence: 0.7 }
          }
        }
      }
    }
    // No keyword hit. Prefer 'other' if it's a valid option, else the first
    // option (spec: default 'other' for unmapped input).
    const other = (input.options as readonly string[]).includes('other')
      ? 'other'
      : (input.options[0] as string | undefined)
    if (!other) throw new Error('heuristic.choice: no options provided')
    return { pick: other as T, confidence: 0.3 }
  }

  async yesNo(input: YesNoInput): Promise<YesNoResult> {
    // Placeholder — heuristic defaults to false with mid confidence unless a
    // clear yes-word appears in the question. Real usage will refine per
    // call-site as future features graduate to yesNo decisions.
    const t = `${input.text} ${input.question}`.toLowerCase()
    if (/\b(yes|true|approved|recommended)\b/.test(t)) {
      return { answer: true, confidence: 0.5 }
    }
    return { answer: false, confidence: 0.5 }
  }

  async score(input: ScoreInput): Promise<ScoreResult> {
    // Middle of the scale. Placeholder — always deterministic.
    const [min, max] = input.scale ?? [0, 1]
    return { score: (min + max) / 2 }
  }
}

// Re-exported so tests can assert against the keyword map directly.
export const _internal = { EXPENSE_KEYWORD_MAP }
