'use client'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { visibilityOf } from '@/lib/resume/visibility'
import type { Basics, Visibility } from '@/lib/resume/types'
import { move, newClientId, removeAt, replaceAt, RowActions, VisibilityToggle } from './controls'

interface BasicsCardProps {
  value: Basics
  onChange: (next: Basics) => void
}

type TextKey = 'name' | 'label' | 'email' | 'phone' | 'url' | 'image' | 'nationality' | 'visaStatus' | 'noticePeriod' | 'dateOfBirth' | 'maritalStatus' | 'expectedSalary'

const CONTACT: Array<{ key: TextKey; label: string; placeholder?: string; type?: string }> = [
  { key: 'name', label: 'Full name' },
  { key: 'label', label: 'Headline', placeholder: 'Backend Engineer' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'phone', label: 'Phone', placeholder: '+971 50 000 0000' },
  { key: 'url', label: 'Website', placeholder: 'https://…' },
]

const REGION: Array<{ key: TextKey; label: string; placeholder?: string }> = [
  { key: 'nationality', label: 'Nationality' },
  { key: 'visaStatus', label: 'Visa status', placeholder: 'Available on visit visa / requires sponsorship' },
  { key: 'noticePeriod', label: 'Notice period', placeholder: '1 month' },
  { key: 'expectedSalary', label: 'Expected salary / CTC' },
  { key: 'dateOfBirth', label: 'Date of birth', placeholder: 'YYYY-MM-DD' },
  { key: 'maritalStatus', label: 'Marital status' },
  { key: 'image', label: 'Photo URL' },
]

export function BasicsCard({ value, onChange }: BasicsCardProps) {
  const vis = (field: string): Visibility => visibilityOf('basics', value, field)
  const setVis = (field: string, v: Visibility): void => onChange({ ...value, visibility: { ...value.visibility, [field]: v } })
  const set = (patch: Partial<Basics>): void => onChange({ ...value, ...patch })
  const field = (f: { key: TextKey; label: string; placeholder?: string; type?: string }) => (
    <FormField
      key={f.key}
      htmlFor={`basics-${f.key}`}
      label={f.label}
      aside={<VisibilityToggle label={f.label} value={vis(f.key)} onChange={(v) => setVis(f.key, v)} />}
    >
      <Input id={`basics-${f.key}`} type={f.type ?? 'text'} value={value[f.key]} placeholder={f.placeholder} onChange={(e) => set({ [f.key]: e.target.value } as Partial<Basics>)} />
    </FormField>
  )
  const loc = value.location
  return (
    <Card>
      <CardHeader>
        <CardTitle>Basics</CardTitle>
        <CardDescription>Who you are and how to reach you. Each field is public (published to your portfolio) or private (only on the résumés you send).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">{CONTACT.map(field)}</div>
        <FormField
          htmlFor="basics-summary"
          label="Summary"
          aside={<VisibilityToggle label="Summary" value={vis('summary')} onChange={(v) => setVis('summary', v)} />}
        >
          <Textarea id="basics-summary" rows={3} value={value.summary} onChange={(e) => set({ summary: e.target.value })} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField htmlFor="basics-city" label="City" aside={<VisibilityToggle label="Location detail" value={vis('location')} onChange={(v) => setVis('location', v)} />}>
            <Input id="basics-city" value={loc.city} onChange={(e) => set({ location: { ...loc, city: e.target.value } })} />
          </FormField>
          <FormField htmlFor="basics-region" label="Region / state">
            <Input id="basics-region" value={loc.region} onChange={(e) => set({ location: { ...loc, region: e.target.value } })} />
          </FormField>
          <FormField htmlFor="basics-country" label="Country code" aside={<VisibilityToggle label="Country" value={vis('countryCode')} onChange={(v) => setVis('countryCode', v)} />}>
            <Input id="basics-country" maxLength={2} value={loc.countryCode} placeholder="AE" onChange={(e) => set({ location: { ...loc, countryCode: e.target.value.toUpperCase() } })} />
          </FormField>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-medium">Region fields</h3>
          <p className="mb-3 text-xs text-muted-foreground">Shown only on the variants that turn them on (GCC résumés usually do).</p>
          <div className="grid gap-4 sm:grid-cols-2">{REGION.map(field)}</div>
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Profiles</h3>
          {value.profiles.map((p, i) => (
            <div key={p.id} className="grid gap-2 sm:grid-cols-[8rem_1fr_auto_auto] sm:items-center">
              <Input aria-label={`Profile ${i + 1} network`} value={p.network} placeholder="GitHub" onChange={(e) => set({ profiles: replaceAt(value.profiles, i, { ...p, network: e.target.value }) })} />
              <Input aria-label={`Profile ${i + 1} URL`} type="url" value={p.url} placeholder="https://github.com/…" onChange={(e) => set({ profiles: replaceAt(value.profiles, i, { ...p, url: e.target.value }) })} />
              <VisibilityToggle
                label={`${p.network || 'Profile'} link`}
                value={visibilityOf('profiles', p, '_item')}
                onChange={(v) => set({ profiles: replaceAt(value.profiles, i, { ...p, visibility: { ...p.visibility, _item: v } }) })}
              />
              <RowActions index={i} count={value.profiles.length} label={`profile ${i + 1}`} onMove={(d) => set({ profiles: move(value.profiles, i, d) })} onRemove={() => set({ profiles: removeAt(value.profiles, i) })} />
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={() => set({ profiles: [...value.profiles, { id: newClientId('p'), network: '', username: '', url: '', visibility: {} }] })}>
            <Plus className="size-3.5" /> Add profile
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
