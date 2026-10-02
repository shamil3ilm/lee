'use client'
import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  EXCLUSION_RULES,
  LANGUAGE_LEVELS,
  NOTICE_LABELS,
  NOTICE_PERIODS,
  RULE_LABELS,
} from '@/lib/discovery/relevance/discovery-prefs'
import { USD_PEGS } from '@/lib/discovery/relevance/pay'
import { TARGET_REGIONS } from '@/lib/discovery/relevance/places'
import type { SearchPrefsFormValues } from '@/lib/discovery/relevance/view'
import { ChoiceChip, PrefsFieldset } from './choice-chip'
import { TextField } from './target-sections'

export const selectCls =
  'h-9 rounded-md border border-input bg-card px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

const MODE_LABEL = { hard: 'Filter out', soft: 'Rank lower', off: 'Ignore' } as const

interface SectionProps {
  values: SearchPrefsFormValues
}

/** Per-rule hard / soft / off switches. */
export function RuleSection({ values }: SectionProps) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Exclusion rules</legend>
      <p className="text-xs text-muted-foreground">
        “Filter out” moves a posting to Filtered out with the reason; “Rank lower” keeps it in your inbox with a chip.
      </p>
      <div className="divide-y rounded-lg border">
        {EXCLUSION_RULES.map((r) => (
          <div key={r} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <label htmlFor={`rule-${r}`} className="text-sm">
              {RULE_LABELS[r]}
            </label>
            <select id={`rule-${r}`} name={`rule_${r}`} defaultValue={values.rules[r]} className={selectCls}>
              {(['hard', 'soft', 'off'] as const).map((m) => (
                <option key={m} value={m}>
                  {MODE_LABEL[m]}
                </option>
              ))}
            </select>
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <span className="text-sm">Pay below my range</span>
          <span className="text-xs text-muted-foreground">Always rank lower, never filtered</span>
        </div>
      </div>
    </fieldset>
  )
}

/** Where the user lives and where an employer must sponsor a visa. */
export function WorkAuthSection({ values }: SectionProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="sp-basedIn">Based in</Label>
        <select id="sp-basedIn" name="basedIn" defaultValue={values.basedIn} className={`${selectCls} w-full sm:w-64`}>
          <option value="">Not set</option>
          {TARGET_REGIONS.map((r) => (
            <option key={r.code} value={r.code}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <PrefsFieldset
        legend="Needs visa sponsorship for"
        description="GCC postings that offer a visa rank higher. “Must be in UAE / own visa” only adds a note (a visit visa is possible); “nationals only” follows the rule above."
      >
        {TARGET_REGIONS.map((r) => (
          <ChoiceChip
            key={r.code}
            name="sponsorshipFor"
            value={r.code}
            label={r.label}
            defaultChecked={values.sponsorshipFor.includes(r.code)}
          />
        ))}
      </PrefsFieldset>
    </div>
  )
}

const GCC_CURRENCIES = ['SAR', 'QAR', 'KWD', 'BHD', 'OMR'] as const

/** Pay floors: a GCC floor in AED/month (other GCC currencies derived) and an India floor in LPA. */
export function PaySection({ values }: SectionProps) {
  const [aed, setAed] = useState(values.payGccMonthlyAed)
  const n = Number(aed)
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <TextField
          name="payGccMonthlyAed"
          label="GCC floor (AED per month)"
          inputMode="numeric"
          value={aed}
          onChange={(e) => setAed(e.target.value.replace(/[^\d.]/g, ''))}
          placeholder="e.g. 8000"
        />
        {n > 0 ? (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            ≈ {GCC_CURRENCIES.map((c) => `${c} ${Math.round((n / USD_PEGS.AED) * USD_PEGS[c]).toLocaleString('en-US')}`).join(' · ')}
            {' '}(fixed USD pegs; KWD approximate)
          </p>
        ) : null}
      </div>
      <TextField
        name="payIndiaLpa"
        label="India floor (LPA, lakhs per year)"
        inputMode="decimal"
        defaultValue={values.payIndiaLpa}
        placeholder="e.g. 8"
      />
      <p className="text-xs text-muted-foreground sm:col-span-2">
        Most postings list no pay. When one does and it is below your floor, it ranks lower with a “below your range” chip; it is never filtered.
      </p>
    </div>
  )
}

interface LangRow {
  key: number
  name: string
  level: string
}

export function LanguagesSection({ values }: SectionProps) {
  const [rows, setRows] = useState<LangRow[]>(() =>
    (values.languages.length > 0 ? values.languages : [{ name: 'English', level: 'professional' }]).map((l, i) => ({ key: i, ...l })),
  )
  const add = (): void => setRows((r) => [...r, { key: Date.now(), name: '', level: 'basic' }])
  const remove = (key: number): void => setRows((r) => r.filter((x) => x.key !== key))
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Languages</legend>
      <p className="text-xs text-muted-foreground">
        “Fluent Arabic required” ranks lower if yours is below professional; “Arabic is a plus” never does. Languages you speak well are a small boost.
      </p>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={row.key} className="flex items-center gap-2">
            <Input name="langName" defaultValue={row.name} placeholder="Language" aria-label={`Language ${i + 1}`} className="min-w-0 flex-1" />
            <select name="langLevel" defaultValue={row.level} aria-label={`Level ${i + 1}`} className={selectCls}>
              {LANGUAGE_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <Button type="button" size="sm" variant="ghost" className="h-9 w-9 p-0" onClick={() => remove(row.key)} aria-label={`Remove language ${i + 1}`}>
              <X className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" size="sm" variant="outline" onClick={add} disabled={rows.length >= 12}>
        <Plus className="size-3.5" />
        Add language
      </Button>
    </fieldset>
  )
}

export function NoticeSection({ values }: SectionProps) {
  return (
    <PrefsFieldset legend="Availability / notice period" description="Pick every option you can do. Shown on Discovery and used later in outreach drafts; never filters.">
      {NOTICE_PERIODS.map((p) => (
        <ChoiceChip key={p} name="notice" value={p} label={NOTICE_LABELS[p]} defaultChecked={values.notice.includes(p)} />
      ))}
    </PrefsFieldset>
  )
}
