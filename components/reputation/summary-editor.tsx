'use client'
import { Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  RED_FLAG_CATEGORIES,
  RED_FLAG_LABELS,
  type Claim,
  type RedFlag,
  type RedFlagCategory,
  type SummaryDraft,
} from '@/lib/reputation/types'

type ListKey = 'pros' | 'cons' | 'redFlags'

interface EditorProps {
  draft: SummaryDraft
  citations: Record<string, string>
  onChange: (next: SummaryDraft) => void
}

const SECTION_LABEL: Record<ListKey, string> = { pros: 'Pros', cons: 'Cons', redFlags: 'Red flags' }

function Cites({
  cites,
  citations,
  onChange,
}: {
  cites: string[]
  citations: Record<string, string>
  onChange: (next: string[]) => void
}) {
  const available = Object.entries(citations).filter(([id]) => !cites.includes(id))
  return (
    <div className="flex flex-wrap items-center gap-1">
      {cites.map((id) => (
        <span key={id} className="inline-flex max-w-full items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-xs">
          <span className="truncate" title={citations[id] ?? id}>
            {citations[id] ?? `Unknown source (${id})`}
          </span>
          <button type="button" aria-label="Remove source" onClick={() => onChange(cites.filter((c) => c !== id))}>
            <X className="size-3" />
          </button>
        </span>
      ))}
      {available.length > 0 ? (
        <select
          aria-label="Add a source"
          className="h-7 max-w-[14rem] rounded border border-input bg-card px-1 text-xs"
          value=""
          onChange={(e) => e.target.value && onChange([...cites, e.target.value])}
        >
          <option value="">+ source…</option>
          {available.map(([id, label]) => (
            <option key={id} value={id}>
              {label.slice(0, 80)}
            </option>
          ))}
        </select>
      ) : null}
      {cites.length === 0 ? <span className="text-xs text-danger">Needs a source</span> : null}
    </div>
  )
}

function ClaimRow<T extends Claim>({
  claim,
  citations,
  onChange,
  onRemove,
  children,
}: {
  claim: T
  citations: Record<string, string>
  onChange: (next: T) => void
  onRemove: () => void
  children?: React.ReactNode
}) {
  return (
    <li className="space-y-1.5 rounded-md border px-3 py-2">
      <div className="flex items-start gap-2">
        <Textarea
          rows={2}
          maxLength={400}
          value={claim.text}
          aria-label="Claim"
          onChange={(e) => onChange({ ...claim, text: e.target.value })}
        />
        <Button type="button" variant="ghost" size="icon" aria-label="Remove claim" onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>
      {children}
      <Cites cites={claim.cites} citations={citations} onChange={(cites) => onChange({ ...claim, cites })} />
    </li>
  )
}

export function SummaryEditor({ draft, citations, onChange }: EditorProps) {
  const replaceAt = <K extends ListKey>(key: K, i: number, value: SummaryDraft[K][number]) =>
    onChange({ ...draft, [key]: draft[key].map((c, j) => (j === i ? value : c)) })
  const removeAt = (key: ListKey, i: number) => onChange({ ...draft, [key]: draft[key].filter((_, j) => j !== i) })
  const add = (key: ListKey) => {
    const blank: RedFlag = { text: '', cites: [], category: 'other', gccRelevance: '' }
    const next = key === 'redFlags' ? blank : { text: '', cites: [] }
    onChange({ ...draft, [key]: [...draft[key], next] })
  }

  return (
    <div className="space-y-4">
      {(['redFlags', 'cons', 'pros'] as const).map((key) => (
        <section key={key} className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{SECTION_LABEL[key]}</h4>
            <Button type="button" variant="ghost" size="sm" onClick={() => add(key)}>
              <Plus /> Add
            </Button>
          </div>
          <ul className="space-y-2">
            {key === 'redFlags'
              ? draft.redFlags.map((f, i) => (
                  <ClaimRow
                    key={i}
                    claim={f}
                    citations={citations}
                    onChange={(next) => replaceAt('redFlags', i, next)}
                    onRemove={() => removeAt('redFlags', i)}
                  >
                    <div className="grid gap-1.5 sm:grid-cols-[12rem_1fr]">
                      <select
                        aria-label="Category"
                        className="h-8 rounded border border-input bg-card px-2 text-xs"
                        value={f.category}
                        onChange={(e) => replaceAt('redFlags', i, { ...f, category: e.target.value as RedFlagCategory })}
                      >
                        {RED_FLAG_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {RED_FLAG_LABELS[c]}
                          </option>
                        ))}
                      </select>
                      <Input
                        className="h-8 text-xs"
                        maxLength={400}
                        placeholder="Why it matters for a GCC hire (optional)"
                        value={f.gccRelevance}
                        onChange={(e) => replaceAt('redFlags', i, { ...f, gccRelevance: e.target.value })}
                      />
                    </div>
                  </ClaimRow>
                ))
              : draft[key].map((c, i) => (
                  <ClaimRow
                    key={i}
                    claim={c}
                    citations={citations}
                    onChange={(next) => replaceAt(key, i, next)}
                    onRemove={() => removeAt(key, i)}
                  />
                ))}
          </ul>
        </section>
      ))}
      <section className="space-y-1">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">GCC note</h4>
        <Textarea
          rows={2}
          maxLength={600}
          value={draft.gccNote}
          aria-label="GCC note"
          onChange={(e) => onChange({ ...draft, gccNote: e.target.value })}
        />
      </section>
    </div>
  )
}
