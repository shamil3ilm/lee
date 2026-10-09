import { pickedItems } from './selection'
import { portfolioSnippets, type PortfolioSnippet } from './snippet'
import type { ImportItem, ReviewSelection } from './types'

/** Client-safe. What every import's Apply returns to the review. */
export type ImportApplyResult =
  | {
      ok: true
      /** 'saved': public facts were written; 'suggested': they are portfolio suggestions. */
      mode: 'saved' | 'suggested'
      batchId: string
      /** Items saved in lee (lee-only data, or everything when saved). */
      saved: number
      snippets: PortfolioSnippet[]
      /** "Open profile.json on GitHub", when a portfolio repo is configured. */
      profileUrl: string | null
    }
  | { ok: false; error: string }

/** Snippets for the ticked public items that are not already in lee. */
export function suggestionSnippets(items: readonly ImportItem[], sel: ReviewSelection, skillGroup: string): PortfolioSnippet[] {
  return portfolioSnippets(
    pickedItems(items, sel).filter((i) => i.status !== 'duplicate'),
    skillGroup,
  )
}
