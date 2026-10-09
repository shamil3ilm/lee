'use client'
import { createContext, useContext } from 'react'
import { ArrowDown, ArrowUp, Eye, EyeOff, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { DEPTH_LABELS } from '@/lib/resume/readiness'
import { DEPTHS, type Depth, type Visibility } from '@/lib/resume/types'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'

/**
 * Public facts come from the portfolio (lib/portfolio/lock.ts): when true,
 * public fields and items are shown read-only and visibility can't change;
 * the lee-only overlay (readiness, wordings, kinds, stack) and private
 * items stay editable. New items are added as private.
 */
const FactsLockContext = createContext(false)
export const FactsLockProvider = FactsLockContext.Provider

export function useFactsLocked(): boolean {
  return useContext(FactsLockContext)
}

/** Visibility for an item added while facts are locked: private, so it never touches the portfolio. */
export function addedVisibility(locked: boolean): Record<string, Visibility> {
  return locked ? { _item: 'private' } : {}
}

/** Immutable list helpers. */
export function replaceAt<T>(list: readonly T[], i: number, next: T): T[] {
  return list.map((x, j) => (j === i ? next : x))
}
export function removeAt<T>(list: readonly T[], i: number): T[] {
  return list.filter((_, j) => j !== i)
}
export function move<T>(list: readonly T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir
  if (j < 0 || j >= list.length) return [...list]
  const out = [...list]
  ;[out[i], out[j]] = [out[j]!, out[i]!]
  return out
}

export function newClientId(prefix: string): string {
  return `${prefix}-${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
}

interface VisibilityToggleProps {
  value: Visibility
  onChange: (v: Visibility) => void
  label: string
}

/** Public / private switch for one field or item. */
export function VisibilityToggle({ value, onChange, label }: VisibilityToggleProps) {
  const locked = useFactsLocked()
  const isPublic = value === 'public'
  return (
    <button
      type="button"
      onClick={() => onChange(isPublic ? 'private' : 'public')}
      disabled={locked}
      aria-pressed={isPublic}
      aria-label={`${label}: ${isPublic ? 'public' : 'private'}${locked ? '' : ' (toggle)'}`}
      title={locked ? (isPublic ? 'Public: from your portfolio' : 'Private: only in lee') : isPublic ? 'Public: on your portfolio' : 'Private: never published'}
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default',
        isPublic ? 'border-transparent bg-info-soft text-info' : 'border-transparent bg-neutral-soft text-neutral',
      )}
    >
      {isPublic ? <Eye className="size-3" aria-hidden="true" /> : <EyeOff className="size-3" aria-hidden="true" />}
      {isPublic ? 'Public' : 'Private'}
    </button>
  )
}

interface ReadinessValue {
  depth: Depth
  interviewReady: boolean
  domainReady: boolean
  ownedAspects: string
}

interface ReadinessControlsProps {
  value: ReadinessValue
  onChange: (patch: Partial<ReadinessValue>) => void
  label: string
  compact?: boolean
}

/**
 * Depth + the two readiness flags. Private: they steer variants, tailoring
 * and the study list, and are never published.
 */
export function ReadinessControls({ value, onChange, label, compact = false }: ReadinessControlsProps) {
  const setDepth = (depth: Depth): void =>
    onChange(depth === 'own' ? { depth, interviewReady: true, domainReady: true } : { depth, interviewReady: false, domainReady: depth === 'ai_assisted' ? value.domainReady : false })
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs', compact && 'text-[11px]')}>
      <NativeSelect
        aria-label={`${label}: how well you know it`}
        value={value.depth}
        onChange={(e) => setDepth(e.target.value as Depth)}
        className="h-7 w-auto text-xs"
      >
        {DEPTHS.map((d) => (
          <option key={d} value={d}>
            {DEPTH_LABELS[d]}
          </option>
        ))}
      </NativeSelect>
      {value.depth !== 'own' || !value.interviewReady ? (
        <>
          <label className="inline-flex items-center gap-1.5">
            <Checkbox
              checked={value.domainReady}
              onChange={(e) => onChange({ domainReady: e.target.checked, ...(e.target.checked ? {} : { interviewReady: false }) })}
            />
            Own the design / domain
          </label>
          <label className="inline-flex items-center gap-1.5">
            <Checkbox
              checked={value.interviewReady}
              onChange={(e) => onChange({ interviewReady: e.target.checked, ...(e.target.checked ? { domainReady: true } : {}) })}
            />
            Interview-ready
          </label>
        </>
      ) : null}
    </div>
  )
}

interface RowActionsProps {
  index: number
  count: number
  label: string
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
}

export function RowActions({ index, count, label, onMove, onRemove }: RowActionsProps) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move ${label} up`}>
        <ArrowUp className="size-3.5" />
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={index === count - 1} onClick={() => onMove(1)} aria-label={`Move ${label} down`}>
        <ArrowDown className="size-3.5" />
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onRemove} aria-label={`Remove ${label}`}>
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  )
}
