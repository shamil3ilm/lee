'use client'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/native-select'
import { checkFactLock } from '@/lib/resume/fact-lock'
import { canOverride, isDomainWording, OVERRIDE_WARNING, presentation } from '@/lib/resume/readiness'
import type { Highlight, ResumeProfile } from '@/lib/resume/types'
import { moveHighlight, moveItem, setWording, toggleHighlight, toggleItem, toggleOverride, type PickSection } from '@/lib/variants/edit'
import type { ItemPick, Recipe } from '@/lib/variants/types'
import { Checkbox } from '@/components/ui/checkbox'

interface Readiness {
  depth: 'own' | 'ai_assisted' | 'learning'
  interviewReady: boolean
  domainReady: boolean
}

export function ReadinessBadge({ item }: { item: Readiness }) {
  const mode = presentation(item)
  if (mode === 'full') return null
  if (mode === 'domain') return <Badge variant="info">Design wording only</Badge>
  return <Badge variant="warning">{item.depth === 'learning' ? 'Learning' : 'Not interview-ready'}</Badge>
}

interface OverrideProps {
  item: Readiness & { id: string }
  recipe: Recipe
  onChange: (r: Recipe) => void
  label: string
}

function OverrideToggle({ item, recipe, onChange, label }: OverrideProps) {
  if (!canOverride(item)) return null
  const on = recipe.overrides.includes(item.id)
  return (
    <label className="flex items-start gap-1.5 text-xs text-warning">
      <Checkbox className="mt-0.5" checked={on} onChange={(e) => onChange(toggleOverride(recipe, item.id, e.target.checked))} aria-label={`Include ${label} anyway`} />
      <span>Include anyway — {OVERRIDE_WARNING}</span>
    </label>
  )
}

function wordingOptions(h: Highlight): Array<{ id: string; text: string; ok: boolean }> {
  const domainOnly = presentation(h) === 'domain'
  return h.alternates.map((a) => ({
    id: a.id,
    text: a.text,
    ok: domainOnly ? isDomainWording(a.text, h.text) : checkFactLock(a.text, h.text).ok,
  }))
}

interface HighlightRowsProps {
  section: PickSection
  itemId: string
  owner: string
  highlights: Highlight[]
  pick: ItemPick
  recipe: Recipe
  onChange: (r: Recipe) => void
}

function HighlightRows({ section, itemId, owner, highlights, pick, recipe, onChange }: HighlightRowsProps) {
  const chosen = pick.highlights.map((p) => highlights.find((h) => h.id === p.id)).filter((h): h is Highlight => Boolean(h))
  const rest = highlights.filter((h) => !pick.highlights.some((p) => p.id === h.id))
  return (
    <ul className="space-y-2">
      {[...chosen, ...rest].map((h, i) => {
        const on = i < chosen.length
        const picked = pick.highlights.find((p) => p.id === h.id)
        const blocked = presentation(h, recipe.overrides.includes(h.id)) === 'excluded'
        const options = wordingOptions(h)
        return (
          <li key={h.id} className="space-y-1.5 rounded-md border p-2">
            <div className="flex items-start gap-2">
              <Checkbox
                className="mt-1"
                checked={on}
                aria-label={`Include: ${h.text.slice(0, 60)}`}
                onChange={(e) => onChange(toggleHighlight(recipe, section, itemId, h.id, e.target.checked))}
              />
              <span className="min-w-0 flex-1 break-words text-sm">{h.text}</span>
              {on ? (
                <span className="flex shrink-0">
                  <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={i === 0} onClick={() => onChange(moveHighlight(recipe, section, itemId, h.id, -1))} aria-label={`Move up in ${owner}`}>
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={i === chosen.length - 1} onClick={() => onChange(moveHighlight(recipe, section, itemId, h.id, 1))} aria-label={`Move down in ${owner}`}>
                    <ArrowDown className="size-3.5" />
                  </Button>
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 pl-6">
              <ReadinessBadge item={h} />
              {on && blocked ? <span className="text-xs text-muted-foreground">Left out of the résumé until ready.</span> : null}
              {on && options.length > 0 ? (
                <NativeSelect
                  aria-label={`Wording for: ${h.text.slice(0, 40)}`}
                  value={picked?.wordingId ?? ''}
                  className="h-7 w-auto max-w-full text-xs"
                  onChange={(e) => onChange(setWording(recipe, section, itemId, h.id, e.target.value || null))}
                >
                  <option value="">Original wording</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id} disabled={!o.ok}>
                      {o.ok ? '' : '(facts changed) '}
                      {o.text.slice(0, 80)}
                    </option>
                  ))}
                </NativeSelect>
              ) : null}
            </div>
            {on ? <div className="pl-6"><OverrideToggle item={h} recipe={recipe} onChange={onChange} label={h.text.slice(0, 40)} /></div> : null}
          </li>
        )
      })}
    </ul>
  )
}

interface VariantItemsCardProps {
  profile: ResumeProfile
  recipe: Recipe
  onChange: (r: Recipe) => void
}

export function VariantItemsCard({ profile, recipe, onChange }: VariantItemsCardProps) {
  const block = (section: PickSection) => {
    const items = section === 'work' ? profile.work : profile.projects
    const picks = recipe[section]
    return items.map((item) => {
      const pick = picks.find((p) => p.id === item.id)
      const index = picks.findIndex((p) => p.id === item.id)
      const label = section === 'work' ? `${'position' in item ? item.position : ''} — ${item.name}` : item.name
      const projectReadiness = section === 'projects' && 'depth' in item ? (item as Readiness & { id: string }) : null
      return (
        <section key={item.id} aria-label={item.name} className="space-y-2 rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
              <Checkbox checked={Boolean(pick)} onChange={(e) => onChange(toggleItem(recipe, profile, section, item.id, e.target.checked))} />
              <span className="break-words">{label}</span>
            </label>
            {projectReadiness ? <ReadinessBadge item={projectReadiness} /> : null}
            {pick ? (
              <span className="flex">
                <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={index === 0} onClick={() => onChange(moveItem(recipe, section, item.id, -1))} aria-label={`Move ${item.name} up`}>
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={index === picks.length - 1} onClick={() => onChange(moveItem(recipe, section, item.id, 1))} aria-label={`Move ${item.name} down`}>
                  <ArrowDown className="size-3.5" />
                </Button>
              </span>
            ) : null}
          </div>
          {pick && projectReadiness ? <OverrideToggle item={projectReadiness} recipe={recipe} onChange={onChange} label={item.name} /> : null}
          {pick ? <HighlightRows section={section} itemId={item.id} owner={item.name} highlights={item.highlights} pick={pick} recipe={recipe} onChange={onChange} /> : null}
        </section>
      )
    })
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Experience and projects</CardTitle>
        <CardDescription>Pick and order items and the wording of each highlight. Facts come from your profile; wordings are fact-locked.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Experience</h3>
          {block('work')}
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Projects</h3>
          {profile.projects.length === 0 ? <p className="text-sm text-muted-foreground">No projects in your profile.</p> : block('projects')}
        </div>
      </CardContent>
    </Card>
  )
}
