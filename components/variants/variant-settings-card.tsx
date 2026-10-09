'use client'
import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { LOCKED_OFF } from '@/lib/variants/presets'
import { moveSection, sectionRows, toggleSection } from '@/lib/variants/edit'
import {
  isPaperSize,
  PAPER_LABELS,
  PAPER_SIZES,
  REGION_FIELD_LABELS,
  REGION_FIELDS,
  REGION_LABELS,
  REGION_PAPER,
  REGIONS,
  SECTION_LABELS,
  TEMPLATE_LABELS,
  TEMPLATES,
  type Recipe,
  type Region,
  type VariantTemplate,
} from '@/lib/variants/types'
import { Checkbox } from '@/components/ui/checkbox'

interface VariantSettingsCardProps {
  name: string
  onName: (name: string) => void
  /** The "publish to portfolio" toggle, address and status. */
  portfolio: ReactNode
  recipe: Recipe
  onChange: (next: Recipe) => void
  families: Array<{ id: string; label: string }>
}

export function VariantSettingsCard({ name, onName, portfolio, recipe, onChange, families }: VariantSettingsCardProps) {
  const set = (patch: Partial<Recipe>): void => onChange({ ...recipe, ...patch })
  const locked = LOCKED_OFF[recipe.region]
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recipe</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField htmlFor="variant-name" label="Name">
            <Input id="variant-name" value={name} onChange={(e) => onName(e.target.value)} />
          </FormField>
          <FormField htmlFor="variant-region" label="Region">
            <NativeSelect id="variant-region" value={recipe.region} onChange={(e) => set({ region: e.target.value as Region })}>
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {REGION_LABELS[r]}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField htmlFor="variant-family" label="Role">
            <NativeSelect id="variant-family" value={recipe.roleFamily ?? ''} onChange={(e) => set({ roleFamily: e.target.value || null })}>
              <option value="">General</option>
              {families.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField htmlFor="variant-length" label="Length">
              <NativeSelect id="variant-length" value={String(recipe.lengthTarget)} onChange={(e) => set({ lengthTarget: e.target.value === '2' ? 2 : 1 })}>
                <option value="1">1 page</option>
                <option value="2">2 pages</option>
              </NativeSelect>
            </FormField>
            <FormField htmlFor="variant-paper" label="Paper">
              <NativeSelect id="variant-paper" value={recipe.paper ?? ''} onChange={(e) => set({ paper: isPaperSize(e.target.value) ? e.target.value : null })}>
                <option value="">{`Region default (${PAPER_LABELS[REGION_PAPER[recipe.region]]})`}</option>
                {PAPER_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {PAPER_LABELS[size]}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          <FormField htmlFor="variant-template" label="Template" className="sm:col-span-2">
            <NativeSelect id="variant-template" value={recipe.template} onChange={(e) => set({ template: e.target.value as VariantTemplate })}>
              {TEMPLATES.map((t) => (
                <option key={t} value={t}>
                  {TEMPLATE_LABELS[t]}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </div>
        <FormField htmlFor="variant-headline" label="Headline">
          <Input id="variant-headline" value={recipe.headline} onChange={(e) => set({ headline: e.target.value })} />
        </FormField>
        <FormField htmlFor="variant-summary" label="Summary" help="Numbers here must appear in your profile; lee flags any that don’t.">
          <Textarea id="variant-summary" rows={3} value={recipe.summary} onChange={(e) => set({ summary: e.target.value })} aria-describedby="variant-summary-help" />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-sm font-medium">Sections</legend>
            {sectionRows(recipe).map(({ key, on }, i, rows) => (
              <div key={key} className="flex items-center gap-2 text-sm">
                <label className="flex flex-1 items-center gap-2">
                  <Checkbox checked={on} onChange={(e) => onChange(toggleSection(recipe, key, e.target.checked))} />
                  {SECTION_LABELS[key]}
                </label>
                {on ? (
                  <>
                    <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={i === 0} onClick={() => onChange(moveSection(recipe, key, -1))} aria-label={`Move ${SECTION_LABELS[key]} up`}>
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={!rows[i + 1]?.on} onClick={() => onChange(moveSection(recipe, key, 1))} aria-label={`Move ${SECTION_LABELS[key]} down`}>
                      <ArrowDown className="size-3.5" />
                    </Button>
                  </>
                ) : null}
              </div>
            ))}
          </fieldset>
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-sm font-medium">Region fields</legend>
            {REGION_FIELDS.map((f) => {
              const isLocked = locked.includes(f)
              return (
                <label key={f} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    disabled={isLocked}
                    checked={recipe.fields[f] && !isLocked}
                    onChange={(e) => set({ fields: { ...recipe.fields, [f]: e.target.checked } })}
                  />
                  <span className={isLocked ? 'text-muted-foreground' : undefined}>
                    {REGION_FIELD_LABELS[f]}
                    {isLocked ? ` — never for ${REGION_LABELS[recipe.region]}` : ''}
                  </span>
                </label>
              )
            })}
          </fieldset>
        </div>
        {portfolio}
      </CardContent>
    </Card>
  )
}
