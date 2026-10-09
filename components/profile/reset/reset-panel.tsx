'use client'
import { useMemo, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { countsSummary, importSourceLabel } from '@/lib/import/labels'
import {
  isEmptySelection,
  PROFILE_SECTION_LABELS,
  PROFILE_SECTIONS,
  RESET_TARGET_LABELS,
  RESET_TARGETS,
  type ImportBatchView,
  type ProfileSection,
  type ResetCounts,
  type ResetSelection,
  type ResetTarget,
} from '@/lib/reset/types'
import { shortDate } from '@/lib/ui/date'
import { ResetDialog } from './reset-dialog'
import { UndoLastImport } from './undo-last-import'

interface ResetPanelProps {
  counts: ResetCounts
  batches: readonly ImportBatchView[]
  lastImport: ImportBatchView | null
  /** lee may change public facts for this user (canEditPublicFacts, lib/portfolio/lock.ts). */
  editable: boolean
}

const toggle = <T,>(list: readonly T[], value: T, on: boolean): T[] => (on ? [...list.filter((x) => x !== value), value] : list.filter((x) => x !== value))

/** Unticking the overlay unticks "Also reset interview-ready flags" with it. */
function toggleTarget(cur: readonly ResetTarget[], t: ResetTarget, on: boolean): ResetTarget[] {
  const next = toggle(cur, t, on)
  return t === 'overlay' && !on ? next.filter((x) => x !== 'readiness') : next
}

interface TargetBoxProps {
  target: ResetTarget
  counts: ResetCounts
  checked: boolean
  disabled?: boolean
  onToggle: (on: boolean) => void
}

function TargetBox({ target: t, counts, checked, disabled = false, onToggle }: TargetBoxProps) {
  const help = RESET_TARGET_LABELS[t].help
  return (
    <Checkbox
      checked={checked}
      disabled={disabled || counts.targets[t] === 0}
      onChange={(e) => onToggle(e.currentTarget.checked)}
      label={
        <span>
          {RESET_TARGET_LABELS[t].label} <span className="text-muted-foreground">({counts.targets[t].toLocaleString('en-US')})</span>
        </span>
      }
      description={t === 'variants' && counts.variantsKept > 0 ? `${help} ${counts.variantsKept} will be archived.` : help}
    />
  )
}

/**
 * Settings › Profile › Reset details: a danger zone. Tick what to reset
 * (each with its count), review exactly what goes, download a backup, then
 * confirm. Public profile sections come from the portfolio while profile
 * editing in lee is off, so they are shown but cannot be ticked.
 */
export function ResetPanel({ counts, batches, lastImport, editable }: ResetPanelProps) {
  const [profile, setProfile] = useState<ProfileSection[]>([])
  const [targets, setTargets] = useState<ResetTarget[]>([])
  const [imports, setImports] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const selection = useMemo<ResetSelection>(() => ({ profile, targets, importBatchIds: imports }), [profile, targets, imports])
  const all = profile.length === PROFILE_SECTIONS.length
  const clear = (): void => {
    setProfile([])
    setTargets([])
    setImports([])
  }

  return (
    <Card id="reset-details" className="scroll-mt-28 border-danger/40" data-testid="reset-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-danger">
          <TriangleAlert className="size-4" aria-hidden="true" />
          Reset details
        </CardTitle>
        <CardDescription>
          Clear what you added, part by part. You see exactly what goes and can download a backup first. Applications, documents already sent,
          tailored CVs and discoveries are never touched.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <UndoLastImport last={lastImport} />

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Master profile (résumé facts)</legend>
          {editable ? null : (
            <p className="text-xs text-muted-foreground" id="reset-portfolio-note">
              Comes from your portfolio: edit or remove these in profile.json. lee’s own overlay is below.
            </p>
          )}
          <Checkbox
            checked={all}
            indeterminate={profile.length > 0 && !all}
            disabled={!editable}
            aria-describedby={editable ? undefined : 'reset-portfolio-note'}
            onChange={(e) => setProfile(e.currentTarget.checked ? [...PROFILE_SECTIONS] : [])}
            label={<span className="font-medium">All sections</span>}
          />
          <div className="ml-6 grid gap-1.5 sm:grid-cols-2">
            {PROFILE_SECTIONS.map((s) => (
              <Checkbox
                key={s}
                checked={profile.includes(s)}
                disabled={!editable || counts.profile[s] === 0}
                onChange={(e) => {
                  const on = e.currentTarget.checked
                  setProfile((cur) => toggle(cur, s, on))
                }}
                label={
                  <span>
                    {PROFILE_SECTION_LABELS[s]} <span className="text-muted-foreground">({counts.profile[s]})</span>
                  </span>
                }
                description={editable ? undefined : 'Comes from your portfolio'}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">lee’s data</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {RESET_TARGETS.filter((t) => t !== 'readiness').map((t) => (
              <div key={t} className="space-y-1.5">
                <TargetBox target={t} counts={counts} checked={targets.includes(t)} onToggle={(on) => setTargets((cur) => toggleTarget(cur, t, on))} />
                {t === 'overlay' ? (
                  <div className="ml-6">
                    <TargetBox
                      target="readiness"
                      counts={counts}
                      checked={targets.includes('readiness')}
                      disabled={!targets.includes('overlay')}
                      onToggle={(on) => setTargets((cur) => toggle(cur, 'readiness', on))}
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </fieldset>

        {batches.length > 0 ? (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Items added by an import</legend>
            <div className="space-y-1.5">
              {batches.map((b) => (
                <Checkbox
                  key={b.id}
                  checked={imports.includes(b.id)}
                  onChange={(e) => {
                  const on = e.currentTarget.checked
                  setImports((cur) => toggle(cur, b.id, on))
                }}
                  label={
                    <span>
                      {importSourceLabel(b.source)}, {shortDate(b.importedAt)}{' '}
                      <span className="text-muted-foreground">
                        ({countsSummary(b.counts)}
                        {b.mode === 'suggested' ? ', suggested for the portfolio' : ''})
                      </span>
                    </span>
                  }
                />
              ))}
            </div>
          </fieldset>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={isEmptySelection(selection)}>
            Clear selection
          </Button>
          <Button type="button" variant="outline" size="sm" className="border-danger/40 text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setOpen(true)} disabled={isEmptySelection(selection)} data-testid="reset-review">
            Review reset…
          </Button>
        </div>
        {open ? <ResetDialog open onOpenChange={setOpen} selection={selection} onDone={clear} /> : null}
      </CardContent>
    </Card>
  )
}
