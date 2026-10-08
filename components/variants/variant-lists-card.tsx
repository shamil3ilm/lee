'use client'
import { useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { fluencyLabel } from '@/lib/resume/labels'
import { backedSkillIds, canOverride, OVERRIDE_WARNING } from '@/lib/resume/readiness'
import type { ResumeProfile } from '@/lib/resume/types'
import { toggleId, toggleOverride, type IdSection } from '@/lib/variants/edit'
import type { Recipe } from '@/lib/variants/types'
import { ReadinessBadge } from './variant-items-card'
import { Checkbox } from '@/components/ui/checkbox'

interface Props {
  profile: ResumeProfile
  recipe: Recipe
  onChange: (r: Recipe) => void
}

function Check({ checked, label, onChange, disabled }: { checked: boolean; label: React.ReactNode; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <Checkbox className="mt-1" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0 break-words">{label}</span>
    </label>
  )
}

export function VariantListsCard({ profile, recipe, onChange }: Props) {
  const backed = useMemo(() => backedSkillIds(profile), [profile])
  const toggle = (section: IdSection, id: string, on: boolean): void => onChange(toggleId(recipe, section, id, on))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Skills, education, languages</CardTitle>
        <CardDescription>A skill counts when you marked it ready or an interview-ready item mentions it.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-2">
        <fieldset className="space-y-1.5 sm:col-span-2">
          <legend className="mb-1 text-sm font-medium">Skills</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {profile.skills.flatMap((g) =>
              g.skills.map((s) => {
                const ok = backed.has(s.id)
                const overridden = recipe.overrides.includes(s.id)
                return (
                  <div key={s.id} className="space-y-1">
                    <Check
                      checked={recipe.skills.includes(s.id)}
                      onChange={(on) => toggle('skills', s.id, on)}
                      label={
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          {s.name}
                          <span className="text-xs text-muted-foreground">{g.name}</span>
                          {ok ? null : <ReadinessBadge item={s} />}
                        </span>
                      }
                    />
                    {!ok && canOverride(s) && recipe.skills.includes(s.id) ? (
                      <label className="flex items-start gap-1.5 pl-6 text-xs text-warning">
                        <Checkbox className="mt-0.5" checked={overridden} onChange={(e) => onChange(toggleOverride(recipe, s.id, e.target.checked))} />
                        Include anyway — {OVERRIDE_WARNING}
                      </label>
                    ) : null}
                  </div>
                )
              }),
            )}
          </div>
        </fieldset>
        <fieldset className="space-y-1.5">
          <legend className="mb-1 text-sm font-medium">Education</legend>
          {profile.education.map((e) => (
            <Check key={e.id} checked={recipe.education.includes(e.id)} onChange={(on) => toggle('education', e.id, on)} label={`${e.studyType || 'Studies'} · ${e.institution}`} />
          ))}
        </fieldset>
        <fieldset className="space-y-1.5">
          <legend className="mb-1 text-sm font-medium">Languages</legend>
          {profile.languages.map((l) => (
            <Check key={l.id} checked={recipe.languages.includes(l.id)} onChange={(on) => toggle('languages', l.id, on)} label={`${l.language} — ${fluencyLabel(l.fluency)}`} />
          ))}
        </fieldset>
        <fieldset className="space-y-1.5 sm:col-span-2">
          <legend className="mb-1 text-sm font-medium">Certifications</legend>
          {profile.certificates.map((c) => (
            <Check key={c.id} checked={recipe.certificates.includes(c.id)} onChange={(on) => toggle('certificates', c.id, on)} label={c.name} />
          ))}
        </fieldset>
      </CardContent>
    </Card>
  )
}
