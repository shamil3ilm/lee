'use client'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import type { CurrentJobForm, Tri } from '@/lib/compare/form'
import {
  CRITERIA,
  CRITERION_LABELS,
  MAX_WANT_MORE,
  RATING_KEYS,
  RATING_LABELS,
  type Criterion,
  type HealthCover,
} from '@/lib/compare/types'
import { cn } from '@/lib/utils'

/** Benefits, self-ratings and "what I want more of" for the current-job form. */

export interface SectionProps {
  form: CurrentJobForm
  set: (patch: Partial<CurrentJobForm>) => void
}

function TriSelect({ id, value, onChange }: { id: string; value: Tri; onChange: (v: Tri) => void }) {
  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value as Tri)}>
      <option value="">Not sure</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </NativeSelect>
  )
}

const TRI_FIELDS: ReadonlyArray<{ key: 'bonus' | 'pfGratuity' | 'wfh' | 'learningBudget' | 'housing' | 'transport' | 'flights'; label: string }> = [
  { key: 'bonus', label: 'Bonus' },
  { key: 'pfGratuity', label: 'PF / gratuity' },
  { key: 'wfh', label: 'Work from home' },
  { key: 'learningBudget', label: 'Learning budget' },
  { key: 'housing', label: 'Housing / allowance' },
  { key: 'transport', label: 'Transport allowance' },
  { key: 'flights', label: 'Annual flight home' },
]

export function BenefitsSection({ form, set }: SectionProps) {
  return (
    <section aria-labelledby="cj-benefits" className="space-y-3">
      <h3 id="cj-benefits" className="text-sm font-semibold">
        Benefits
      </h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FormField htmlFor="cj-health" label="Health insurance">
          <NativeSelect id="cj-health" value={form.health} onChange={(e) => set({ health: e.target.value as HealthCover })}>
            <option value="unknown">Not sure</option>
            <option value="none">None</option>
            <option value="self">Just me</option>
            <option value="family">Me and my family</option>
          </NativeSelect>
        </FormField>
        {TRI_FIELDS.map((f) => (
          <FormField key={f.key} htmlFor={`cj-${f.key}`} label={f.label}>
            <TriSelect id={`cj-${f.key}`} value={form[f.key]} onChange={(v) => set({ [f.key]: v } as Partial<CurrentJobForm>)} />
          </FormField>
        ))}
        <FormField htmlFor="cj-leave" label="Paid leave" hint="(days a year)">
          <Input id="cj-leave" inputMode="numeric" value={form.leaveDays} onChange={(e) => set({ leaveDays: e.target.value })} />
        </FormField>
        <FormField htmlFor="cj-bonus-note" label="Bonus details" hint="(optional)">
          <Input id="cj-bonus-note" value={form.bonusNote} maxLength={200} onChange={(e) => set({ bonusNote: e.target.value })} />
        </FormField>
      </div>
      <FormField htmlFor="cj-other" label="Other benefits" hint="(optional)">
        <Textarea id="cj-other" rows={2} maxLength={500} value={form.other} onChange={(e) => set({ other: e.target.value })} />
      </FormField>
    </section>
  )
}

export function RatingsSection({ form, set }: SectionProps) {
  return (
    <section aria-labelledby="cj-ratings" className="space-y-3">
      <div>
        <h3 id="cj-ratings" className="text-sm font-semibold">
          How it feels now
        </h3>
        <p className="text-xs text-muted-foreground">1 is poor, 5 is great. Unrated stays unknown.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {RATING_KEYS.map((k) => (
          <FormField key={k} htmlFor={`cj-rate-${k}`} label={RATING_LABELS[k]}>
            <NativeSelect
              id={`cj-rate-${k}`}
              value={form.ratings[k]}
              onChange={(e) => set({ ratings: { ...form.ratings, [k]: e.target.value } })}
            >
              <option value="">Not rated</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        ))}
      </div>
    </section>
  )
}

export function WantMoreSection({ form, set }: SectionProps) {
  const toggle = (c: Criterion): void => {
    const on = form.wantMore.includes(c)
    if (!on && form.wantMore.length >= MAX_WANT_MORE) return
    set({ wantMore: on ? form.wantMore.filter((x) => x !== c) : [...form.wantMore, c] })
  }
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">What I want more of</legend>
      <p className="text-xs text-muted-foreground">Pick up to {MAX_WANT_MORE}. They count double in the comparison total.</p>
      <div className="flex flex-wrap gap-2 pt-1">
        {CRITERIA.map((c) => {
          const checked = form.wantMore.includes(c)
          const disabled = !checked && form.wantMore.length >= MAX_WANT_MORE
          return (
            <label
              key={c}
              className={cn(
                'inline-flex cursor-pointer select-none items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors',
                'text-muted-foreground hover:bg-muted',
                'has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground',
                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background',
                disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              <input type="checkbox" className="sr-only" checked={checked} disabled={disabled} onChange={() => toggle(c)} />
              {CRITERION_LABELS[c]}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
