import type { Comparison } from './compare'
import { narrativeInput, savedNarrative, type SavedNarrative } from './narrative'
import { compareOne } from './service'

/** What the "Compare with current job" card renders for one opportunity. */
export interface ComparisonCardData {
  comparison: Comparison | null
  hasCurrent: boolean
  saved: SavedNarrative | null
  citations: Record<string, string>
}

export async function loadComparisonCard(userId: string, key: string, now: Date = new Date()): Promise<ComparisonCardData> {
  const { settings, comparison } = await compareOne(userId, key, now)
  const input = comparison ? narrativeInput(comparison) : null
  const citations = input ? Object.fromEntries([...input.facts, ...input.unknowns].map((f) => [f.id, f.text])) : {}
  return {
    comparison,
    hasCurrent: settings.current !== null,
    saved: savedNarrative(settings.narratives, key),
    citations,
  }
}
