'use client'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { fluencyLabel } from '@/lib/resume/labels'
import { visibilityOf } from '@/lib/resume/visibility'
import {
  LANGUAGE_FLUENCIES,
  type CertificateItem,
  type EducationItem,
  type LanguageFluency,
  type LanguageItem,
} from '@/lib/resume/types'
import { move, newClientId, removeAt, replaceAt, RowActions, VisibilityToggle } from './controls'

interface ListProps<T> {
  value: T[]
  onChange: (next: T[]) => void
}

export function EducationCard({ value, onChange }: ListProps<EducationItem>) {
  const set = (i: number, patch: Partial<EducationItem>): void => onChange(replaceAt(value, i, { ...value[i]!, ...patch }))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Education</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {value.map((e, i) => (
          <div key={e.id} className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
            <Input aria-label={`Education ${i + 1} institution`} placeholder="Institution" value={e.institution} onChange={(x) => set(i, { institution: x.target.value })} />
            <Input aria-label={`Education ${i + 1} degree`} placeholder="Degree (B.Tech)" value={e.studyType} onChange={(x) => set(i, { studyType: x.target.value })} />
            <Input aria-label={`Education ${i + 1} area`} placeholder="Area (Computer Science)" value={e.area} onChange={(x) => set(i, { area: x.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <Input aria-label={`Education ${i + 1} start`} placeholder="Start (2014)" value={e.startDate} onChange={(x) => set(i, { startDate: x.target.value.trim() })} />
              <Input aria-label={`Education ${i + 1} end`} placeholder="End (2018)" value={e.endDate} onChange={(x) => set(i, { endDate: x.target.value.trim() })} />
            </div>
            <div className="flex items-center justify-between gap-2 sm:col-span-2">
              <VisibilityToggle label={`Education ${e.institution}`} value={visibilityOf('education', e, '_item')} onChange={(v) => set(i, { visibility: { ...e.visibility, _item: v } })} />
              <RowActions index={i} count={value.length} label={`education ${i + 1}`} onMove={(d) => onChange(move(value, i, d))} onRemove={() => onChange(removeAt(value, i))} />
            </div>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...value, { id: newClientId('e'), institution: 'Institution', area: '', studyType: '', url: '', startDate: '', endDate: '', score: '', visibility: {} }])}>
          <Plus className="size-3.5" /> Add education
        </Button>
      </CardContent>
    </Card>
  )
}

export function LanguagesCard({ value, onChange }: ListProps<LanguageItem>) {
  const set = (i: number, patch: Partial<LanguageItem>): void => onChange(replaceAt(value, i, { ...value[i]!, ...patch }))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Languages</CardTitle>
        <CardDescription>GCC variants show these; add your Arabic level even if basic.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {value.map((l, i) => (
          <div key={l.id} className="flex flex-wrap items-center gap-2">
            <Input aria-label={`Language ${i + 1}`} value={l.language} className="h-8 w-40" onChange={(x) => set(i, { language: x.target.value })} />
            <NativeSelect aria-label={`${l.language} level`} value={l.fluency} className="h-8 w-auto text-xs" onChange={(x) => set(i, { fluency: x.target.value as LanguageFluency })}>
              {LANGUAGE_FLUENCIES.map((f) => (
                <option key={f} value={f}>
                  {fluencyLabel(f)}
                </option>
              ))}
            </NativeSelect>
            <VisibilityToggle label={`Language ${l.language}`} value={visibilityOf('languages', l, '_item')} onChange={(v) => set(i, { visibility: { ...l.visibility, _item: v } })} />
            <RowActions index={i} count={value.length} label={`language ${l.language}`} onMove={(d) => onChange(move(value, i, d))} onRemove={() => onChange(removeAt(value, i))} />
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...value, { id: newClientId('l'), language: 'Arabic', fluency: 'basic', visibility: {} }])}>
          <Plus className="size-3.5" /> Add language
        </Button>
      </CardContent>
    </Card>
  )
}

export function CertificatesCard({ value, onChange }: ListProps<CertificateItem>) {
  const set = (i: number, patch: Partial<CertificateItem>): void => onChange(replaceAt(value, i, { ...value[i]!, ...patch }))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Certifications</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {value.map((c, i) => (
          <div key={c.id} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_1fr_7rem_auto_auto] sm:items-center">
            <Input aria-label={`Certification ${i + 1} name`} value={c.name} className="h-8" onChange={(x) => set(i, { name: x.target.value })} />
            <Input aria-label={`Certification ${i + 1} issuer`} placeholder="Issuer" value={c.issuer} className="h-8" onChange={(x) => set(i, { issuer: x.target.value })} />
            <Input aria-label={`Certification ${i + 1} date`} placeholder="2022-06" value={c.date} className="h-8" onChange={(x) => set(i, { date: x.target.value.trim() })} />
            <VisibilityToggle label={`Certification ${c.name}`} value={visibilityOf('certificates', c, '_item')} onChange={(v) => set(i, { visibility: { ...c.visibility, _item: v } })} />
            <RowActions index={i} count={value.length} label={`certification ${i + 1}`} onMove={(d) => onChange(move(value, i, d))} onRemove={() => onChange(removeAt(value, i))} />
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...value, { id: newClientId('c'), name: 'Certification', issuer: '', date: '', url: '', visibility: {} }])}>
          <Plus className="size-3.5" /> Add certification
        </Button>
      </CardContent>
    </Card>
  )
}
