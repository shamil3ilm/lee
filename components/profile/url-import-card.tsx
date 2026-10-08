'use client'
import { useState, useTransition } from 'react'
import { Globe } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { applyUrlImportAction, previewUrlImportAction } from '@/app/(authed)/settings/profile/import-actions'
import type { ImportProposal, ImportSection } from '@/lib/profile/url-import'
import { Checkbox } from '@/components/ui/checkbox'

const SECTION_LABELS: Record<ImportSection, string> = {
  skills: 'Skills to add',
  headline: 'Headline',
  summary: 'Summary',
  experience: 'Experience',
  projects: 'Projects',
  metrics: 'Results and metrics',
}

function sectionItems(p: ImportProposal, s: ImportSection): string[] {
  switch (s) {
    case 'skills':
      return p.skills.add
    case 'headline':
      return p.headline ? [`${p.headline.from ?? '(none)'} → ${p.headline.to}`] : []
    case 'summary':
      return p.summary ? [p.summary.to] : []
    default:
      return p[s].add
  }
}

/**
 * Import from a public résumé or portfolio page: fetched server-side, shown
 * as a per-section diff, saved only for the sections the user ticks.
 */
export function UrlImportCard() {
  const [url, setUrl] = useState('')
  const [proposal, setProposal] = useState<ImportProposal | null>(null)
  const [aiUsed, setAiUsed] = useState(false)
  const [chosen, setChosen] = useState<Set<ImportSection>>(new Set())
  const [pending, start] = useTransition()

  const sections = proposal
    ? (Object.keys(SECTION_LABELS) as ImportSection[]).filter((s) => sectionItems(proposal, s).length > 0)
    : []

  const preview = (): void =>
    start(async () => {
      const r = await previewUrlImportAction(url)
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      setProposal(r.proposal)
      setAiUsed(r.aiUsed)
      setChosen(new Set())
    })
  const toggle = (s: ImportSection): void =>
    setChosen((c) => {
      const n = new Set(c)
      if (n.has(s)) n.delete(s)
      else n.add(s)
      return n
    })
  const apply = (): void =>
    start(async () => {
      if (!proposal) return
      const r = await applyUrlImportAction(proposal, [...chosen])
      if ('error' in r) toast.error(r.error)
      else {
        toast.success(chosen.size > 0 ? 'Imported the selected sections' : 'Nothing selected')
        setProposal(null)
      }
    })

  return (
    <Card id="url-import" className="scroll-mt-28">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="size-4 text-muted-foreground" aria-hidden="true" />
          Import from a public page
        </CardTitle>
        <CardDescription>
          Your résumé page or portfolio. We read its text (no scripts), propose changes per section and save only what you confirm.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="url"
            aria-label="Page URL"
            placeholder="https://your-site.example/resume"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Button type="button" onClick={preview} disabled={pending || !url.trim()}>
            {pending && !proposal ? 'Reading…' : 'Preview import'}
          </Button>
        </div>
        {proposal ? (
          <div className="space-y-3" data-testid="url-import-diff">
            <p className="text-xs text-muted-foreground">
              {sections.length === 0 ? 'Nothing new on that page.' : 'Tick the sections to save.'}
              {aiUsed ? '' : ' (AI parsing unavailable: skills come from known terms only.)'}
            </p>
            {sections.map((s) => (
              <fieldset key={s} className="rounded-lg border p-3">
                <legend className="px-1">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Checkbox checked={chosen.has(s)} onChange={() => toggle(s)} />
                    {SECTION_LABELS[s]}
                  </label>
                </legend>
                {s === 'skills' ? (
                  <div className="flex flex-wrap gap-1.5">
                    {proposal.skills.add.map((k) => (
                      <Badge key={k} variant="success">
                        + {k}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {sectionItems(proposal, s).map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                )}
              </fieldset>
            ))}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setProposal(null)} disabled={pending}>
                Discard
              </Button>
              <Button type="button" onClick={apply} disabled={pending || chosen.size === 0}>
                Save selected
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
