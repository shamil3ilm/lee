'use client'
import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { checkDomainWording, checkFactLock, factLockMessage } from '@/lib/resume/fact-lock'
import { highlightSchema, type Highlight } from '@/lib/resume/types'
import { visibilityOf } from '@/lib/resume/visibility'
import { addWording, removeWording } from '@/lib/resume/wordings'
import { move, newClientId, ReadinessControls, removeAt, replaceAt, RowActions, VisibilityToggle } from './controls'

interface HighlightsEditorProps {
  owner: string
  value: Highlight[]
  onChange: (next: Highlight[]) => void
}

function WordingAdder({ highlight, onAdd }: { highlight: Highlight; onAdd: (next: Highlight) => void }) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const lock = draft.trim() ? checkFactLock(draft, highlight.text) : null
  const domainOnly = !highlight.interviewReady && highlight.domainReady
  const domain = draft.trim() && domainOnly ? checkDomainWording(draft) : null
  const add = (): void => {
    const r = addWording(highlight, draft, 'user', () => newClientId('w'))
    if (!r.ok) {
      setError(r.error)
      return
    }
    setDraft('')
    setError(null)
    onAdd(r.highlight)
  }
  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Input aria-label="New wording" value={draft} placeholder="Another wording (same facts, same numbers)" onChange={(e) => setDraft(e.target.value)} className="h-8 text-xs" />
        <Button type="button" size="sm" variant="outline" className="h-8" onClick={add} disabled={!draft.trim() || lock?.ok === false}>
          <Plus className="size-3.5" /> Add
        </Button>
      </div>
      {lock && !lock.ok ? <p className="text-[11px] text-destructive">{factLockMessage(lock)}</p> : null}
      {domain && !domain.ok ? (
        <p className="text-[11px] text-warning">Domain-only item: variants use this wording only if it reads as design work (not “{domain.claims.join('”, “')}”).</p>
      ) : null}
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  )
}

/** Highlights with stable ids, readiness, visibility and fact-locked wordings. */
export function HighlightsEditor({ owner, value, onChange }: HighlightsEditorProps) {
  const set = (i: number, h: Highlight): void => onChange(replaceAt(value, i, h))
  return (
    <div className="space-y-3">
      {value.map((h, i) => (
        <div key={h.id} className="space-y-2 rounded-md border p-3">
          <div className="flex items-start gap-2">
            <Textarea aria-label={`${owner} highlight ${i + 1}`} rows={2} value={h.text} onChange={(e) => set(i, { ...h, text: e.target.value })} className="min-w-0 flex-1 text-sm" />
            <RowActions index={i} count={value.length} label={`highlight ${i + 1}`} onMove={(d) => onChange(move(value, i, d))} onRemove={() => onChange(removeAt(value, i))} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <VisibilityToggle label={`Highlight ${i + 1}`} value={visibilityOf('highlight', h, '_item')} onChange={(v) => set(i, { ...h, visibility: { ...h.visibility, _item: v } })} />
            <ReadinessControls label={`Highlight ${i + 1}`} value={h} onChange={(patch) => set(i, { ...h, ...patch })} compact />
          </div>
          {h.alternates.length > 0 ? (
            <ul className="space-y-1">
              {h.alternates.map((a) => {
                const stale = !checkFactLock(a.text, h.text).ok
                return (
                  <li key={a.id} className="flex items-start gap-2 text-xs">
                    <span className="min-w-0 flex-1 break-words text-muted-foreground">{a.text}</span>
                    {a.source === 'ai' ? <Badge variant="info">AI</Badge> : null}
                    {stale ? <Badge variant="warning">Facts changed</Badge> : null}
                    <button type="button" aria-label="Remove wording" className="text-muted-foreground hover:text-foreground" onClick={() => set(i, removeWording(h, a.id))}>
                      <X className="size-3.5" />
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : null}
          <WordingAdder highlight={h} onAdd={(next) => set(i, next)} />
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={() => onChange([...value, highlightSchema.parse({ id: newClientId('h'), text: 'New highlight', depth: 'own' })])}>
        <Plus className="size-3.5" /> Add highlight
      </Button>
    </div>
  )
}
