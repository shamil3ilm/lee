'use client'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import type { PortfolioSettings, WorkItem } from '@/lib/resume/types'
import { newClientId, removeAt, replaceAt, RowActions, move, useFactsLocked } from './controls'
import { csv, fromCsv } from './work-card'

interface PortfolioCardProps {
  value: PortfolioSettings
  work: WorkItem[]
  onChange: (next: PortfolioSettings) => void
}

/** meta.x-portfolio inputs: page name, canonical URL, case studies, the 60-second view. */
export function PortfolioCard({ value, work, onChange }: PortfolioCardProps) {
  const locked = useFactsLocked()
  const q = value.quickView
  const setQ = (patch: Partial<PortfolioSettings['quickView']>): void => onChange({ ...value, quickView: { ...q, ...patch } })
  return (
    <Card>
      <CardHeader>
        <CardTitle>Portfolio page</CardTitle>
        <CardDescription>
          {locked
            ? 'From your portfolio’s profile.json: the site name, the file’s canonical URL, case studies and the 60-second view.'
            : 'The site name, the file’s canonical URL (lee reads your portfolio’s profile.json from its site when no repository is set), case studies and the 60-second view.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <fieldset disabled={locked} className="min-w-0 space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField htmlFor="pf-display" label="Display name">
            <Input id="pf-display" value={value.displayName} onChange={(e) => onChange({ ...value, displayName: e.target.value })} />
          </FormField>
          <FormField htmlFor="pf-canonical" label="Canonical URL" hint="(of profile.json)">
            <Input id="pf-canonical" type="url" value={value.canonical} placeholder="https://you.example.dev/profile.json" onChange={(e) => onChange({ ...value, canonical: e.target.value })} />
          </FormField>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Case studies</h3>
          {value.caseStudies.map((cs, i) => {
            const job = work.find((w) => w.id === cs.workId)
            return (
              <div key={`${cs.id}-${i}`} className="grid gap-2 rounded-md border p-2 sm:grid-cols-2">
                <Input aria-label={`Case study ${i + 1} title`} value={cs.title} className="h-8" onChange={(e) => onChange({ ...value, caseStudies: replaceAt(value.caseStudies, i, { ...cs, title: e.target.value }) })} />
                <Input aria-label={`Case study ${i + 1} URL`} type="url" value={cs.url} className="h-8" onChange={(e) => onChange({ ...value, caseStudies: replaceAt(value.caseStudies, i, { ...cs, url: e.target.value }) })} />
                <NativeSelect aria-label={`Case study ${i + 1} job`} value={cs.workId} className="h-8 text-xs" onChange={(e) => {
                  const w = work.find((x) => x.id === e.target.value)
                  onChange({ ...value, caseStudies: replaceAt(value.caseStudies, i, { ...cs, workId: e.target.value, highlightId: w?.highlights[0]?.id ?? '' }) })
                }}>
                  {work.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </NativeSelect>
                <NativeSelect aria-label={`Case study ${i + 1} highlight`} value={cs.highlightId} className="h-8 text-xs" onChange={(e) => onChange({ ...value, caseStudies: replaceAt(value.caseStudies, i, { ...cs, highlightId: e.target.value }) })}>
                  {(job?.highlights ?? []).map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.text.slice(0, 80)}
                    </option>
                  ))}
                </NativeSelect>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <Input aria-label={`Case study ${i + 1} id`} value={cs.id} className="h-8 max-w-48 text-xs" onChange={(e) => onChange({ ...value, caseStudies: replaceAt(value.caseStudies, i, { ...cs, id: e.target.value.toLowerCase() }) })} />
                  <div className="ml-auto">
                    <RowActions index={i} count={value.caseStudies.length} label={`case study ${i + 1}`} onMove={(d) => onChange({ ...value, caseStudies: move(value.caseStudies, i, d) })} onRemove={() => onChange({ ...value, caseStudies: removeAt(value.caseStudies, i) })} />
                  </div>
                </div>
              </div>
            )
          })}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={work.length === 0 || !work[0]!.highlights[0]}
            onClick={() =>
              onChange({
                ...value,
                caseStudies: [
                  ...value.caseStudies,
                  { id: `case-${value.caseStudies.length + 1}`, title: 'Case study', url: 'https://', workId: work[0]!.id, highlightId: work[0]!.highlights[0]!.id },
                ],
              })
            }
          >
            <Plus className="size-3.5" /> Add case study
          </Button>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-medium">60-second view</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField htmlFor="qv-role" label="Role">
              <Input id="qv-role" value={q.role} onChange={(e) => setQ({ role: e.target.value })} />
            </FormField>
            <FormField htmlFor="qv-skills" label="Skills" hint="(comma separated)">
              <Input id="qv-skills" value={csv(q.skills)} onChange={(e) => setQ({ skills: fromCsv(e.target.value) })} />
            </FormField>
          </div>
          <FormField htmlFor="qv-line" label="One line">
            <Textarea id="qv-line" rows={2} value={q.line} onChange={(e) => setQ({ line: e.target.value })} />
          </FormField>
          {q.results.map((r, i) => (
            <div key={r.id} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[10rem_1fr_auto] sm:items-start">
              <Input aria-label={`Result ${i + 1} lead`} value={r.lead} className="h-8" onChange={(e) => setQ({ results: replaceAt(q.results, i, { ...r, lead: e.target.value }) })} />
              <Input aria-label={`Result ${i + 1} text`} value={r.text} className="h-8" onChange={(e) => setQ({ results: replaceAt(q.results, i, { ...r, text: e.target.value }) })} />
              <RowActions index={i} count={q.results.length} label={`result ${i + 1}`} onMove={(d) => setQ({ results: move(q.results, i, d) })} onRemove={() => setQ({ results: removeAt(q.results, i) })} />
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" disabled={q.results.length >= 6} onClick={() => setQ({ results: [...q.results, { id: newClientId('q'), lead: 'Result', text: 'What changed', link: null }] })}>
            <Plus className="size-3.5" /> Add result
          </Button>
        </div>
        </fieldset>
      </CardContent>
    </Card>
  )
}
