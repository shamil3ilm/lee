import type { RadarBriefInput, RadarBriefResult } from './prompts/radar-brief'

/**
 * Deterministic radar brief for the fixture provider (E2E, tests): the first
 * sentence of each source becomes a "what it is" sentence quoting itself,
 * so the verbatim check passes — plus one sentence with an invented quote,
 * which the check must drop.
 */

function firstSentence(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  const m = /^(.{20,200}?[.!?])(\s|$)/.exec(clean)
  return (m?.[1] ?? clean.slice(0, 120)).trim()
}

export function pseudoRadarBrief(input: RadarBriefInput): RadarBriefResult {
  const what = input.sources
    .map((s) => ({ text: firstSentence(s.text), quote: firstSentence(s.text), source: s.id }))
    .filter((s) => s.quote.length >= 20)
  return {
    what,
    architecture: [
      { text: `${input.name} uses a novel architecture.`, quote: 'a sentence that appears in no source at all', source: input.sources[0]?.id ?? 'S1' },
    ],
    workflow: [],
    how_to_use: [],
    tradeoffs: [],
    security: [],
    compared_with: [],
  }
}
