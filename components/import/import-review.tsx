'use client'
import { Checkbox } from '@/components/ui/checkbox'
import { pickedCount, readinessOf, sectionState, setItem, setReadiness, setSection } from '@/lib/import/selection'
import { REVIEW_SECTIONS, SECTION_LABELS, type ImportItem, type ReviewSection, type ReviewSelection } from '@/lib/import/types'
import { ReviewRow } from './review-row'
import { SkillChips } from './skill-chips'

interface ImportReviewProps {
  items: readonly ImportItem[]
  selection: ReviewSelection
  onChange: (next: ReviewSelection) => void
  disabled?: boolean
  /** Section titles that differ per importer ("Positions" for LinkedIn). */
  labels?: Partial<Record<ReviewSection, string>>
  /** Profile editing in lee is off: public items become portfolio suggestions. */
  suggestOnly: boolean
}

/**
 * The shared per-item import review (public page, LinkedIn export, CV).
 * Each section has a tri-state checkbox (all / some / none) that controls
 * its items; skills are chips; every other item is a row with its status
 * (new / already in lee / update with a diff) and, for new items that carry
 * readiness, a "Mine — I can explain it" toggle (default: not ready).
 */
export function ImportReview({ items, selection, onChange, disabled = false, labels, suggestOnly }: ImportReviewProps) {
  const sections = REVIEW_SECTIONS.filter((s) => items.some((i) => i.section === s))
  return (
    <div className="space-y-3" data-testid="import-review">
      {sections.map((section) => {
        const rows = items.filter((i) => i.section === section)
        const state = sectionState(items, selection, section)
        const title = labels?.[section] ?? SECTION_LABELS[section]
        const leeOnly = rows.every((r) => !r.isPublic)
        return (
          <fieldset key={section} className="min-w-0 rounded-lg border p-3" data-testid={`import-section-${section}`}>
            <legend className="px-1">
              <Checkbox
                checked={state === 'all'}
                indeterminate={state === 'some'}
                disabled={disabled}
                onChange={(e) => onChange(setSection(items, selection, section, e.currentTarget.checked))}
                aria-label={`${title}: select all`}
                label={
                  <span className="font-medium">
                    {title}{' '}
                    <span className="font-normal text-muted-foreground">
                      ({pickedCount(items, selection, section)} of {rows.length})
                    </span>
                  </span>
                }
              />
            </legend>
            {suggestOnly && !leeOnly ? <p className="mb-1 text-xs text-muted-foreground">Goes to your portfolio as a suggestion.</p> : null}
            {leeOnly ? <p className="mb-1 text-xs text-muted-foreground">Saved in lee only (never published).</p> : null}
            {section === 'skills' ? (
              <SkillChips items={items} selection={selection} disabled={disabled} onChange={onChange} />
            ) : (
              <ul className="divide-y">
                {rows.map((item) => (
                  <ReviewRow
                    key={item.key}
                    item={item}
                    picked={selection.picked.includes(item.key)}
                    readiness={readinessOf(selection, item.key)}
                    disabled={disabled}
                    onPick={(on) => onChange(setItem(selection, item.key, on))}
                    onReadiness={(r) => onChange(setReadiness(selection, item.key, r))}
                  />
                ))}
              </ul>
            )}
          </fieldset>
        )
      })}
    </div>
  )
}
