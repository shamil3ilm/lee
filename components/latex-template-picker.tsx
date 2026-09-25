'use client'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FileText, Loader2, Mail, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  createBlank,
  createBlankCoverLetter,
  createFromMasterCV,
  createFromTemplate,
  type CreateLatexResult,
} from '@/app/(authed)/documents/new/latex/actions'
import { getTemplatePreview } from '@/lib/latex/previews'

export type TemplateKind = 'cv' | 'cover_letter'
export type TemplateCategory =
  | 'minimalist'
  | 'modern'
  | 'academic'
  | 'creative'
  | 'classic'

export interface TemplateSummary {
  id: string
  name: string
  description: string
  kind: TemplateKind
  category: TemplateCategory
  packages: string[]
}

interface LatexTemplatePickerProps {
  templates: TemplateSummary[]
  hasMaster: boolean
}

type PendingAction =
  | { kind: 'template'; id: string }
  | { kind: 'ai'; id: string }
  | { kind: 'blank' }
  | { kind: 'blank_letter' }
  | null

const CATEGORY_ORDER: TemplateCategory[] = [
  'minimalist',
  'modern',
  'classic',
  'academic',
  'creative',
]

const CATEGORY_LABEL: Record<TemplateCategory, string> = {
  minimalist: 'Minimalist',
  modern: 'Modern',
  classic: 'Classic',
  academic: 'Academic',
  creative: 'Creative',
}

const CATEGORY_BADGE: Record<
  TemplateCategory,
  'blue' | 'violet' | 'emerald' | 'neutral' | 'indigo'
> = {
  minimalist: 'neutral',
  modern: 'blue',
  classic: 'indigo',
  academic: 'emerald',
  creative: 'violet',
}

function groupByCategory(templates: TemplateSummary[]): Array<{
  category: TemplateCategory
  items: TemplateSummary[]
}> {
  const byCategory = new Map<TemplateCategory, TemplateSummary[]>()
  for (const t of templates) {
    const bucket = byCategory.get(t.category) ?? []
    bucket.push(t)
    byCategory.set(t.category, bucket)
  }
  return CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((c) => ({
    category: c,
    items: byCategory.get(c)!,
  }))
}

export function LatexTemplatePicker({ templates, hasMaster }: LatexTemplatePickerProps) {
  const [pending, setPending] = useState<PendingAction>(null)
  const [, startTransition] = useTransition()

  const cvGroups = useMemo(
    () => groupByCategory(templates.filter((t) => t.kind === 'cv')),
    [templates],
  )
  const letterGroups = useMemo(
    () => groupByCategory(templates.filter((t) => t.kind === 'cover_letter')),
    [templates],
  )

  function isBusy(): boolean {
    return pending !== null
  }

  function handleResult(result: CreateLatexResult | undefined) {
    // On success the server action calls redirect() which throws NEXT_REDIRECT
    // and the client transitions to the new URL; we only ever see a returned
    // value here when the action failed and returned an { error } envelope.
    if (result && 'error' in result) toast.error(result.error)
    setPending(null)
  }

  function pickTemplate(id: string) {
    setPending({ kind: 'template', id })
    startTransition(async () => {
      const result = await createFromTemplate(id)
      handleResult(result)
    })
  }

  function pickBlank() {
    setPending({ kind: 'blank' })
    startTransition(async () => {
      const result = await createBlank()
      handleResult(result)
    })
  }

  function pickBlankLetter() {
    setPending({ kind: 'blank_letter' })
    startTransition(async () => {
      const result = await createBlankCoverLetter()
      handleResult(result)
    })
  }

  function pickAI(templateId: string) {
    setPending({ kind: 'ai', id: templateId })
    startTransition(async () => {
      const result = await createFromMasterCV(templateId)
      handleResult(result)
    })
  }

  function renderCard(t: TemplateSummary) {
    const templateBusy = pending?.kind === 'template' && pending.id === t.id
    const aiBusy = pending?.kind === 'ai' && pending.id === t.id
    const isLetter = t.kind === 'cover_letter'
    const previewSvg = getTemplatePreview(t.id)
    // Defense-in-depth: the previews module only produces our own <svg>
    // strings, but the getter takes an external id — refuse to inject
    // anything that isn't clearly SVG markup.
    const safePreview = previewSvg.startsWith('<svg') ? previewSvg : null
    return (
      <Card
        key={t.id}
        className={cn(
          'group flex flex-col overflow-hidden transition-all',
          isBusy() && !templateBusy && !aiBusy && 'opacity-60',
        )}
      >
        <div className="aspect-[5/7] w-full overflow-hidden border-b bg-muted">
          {safePreview ? (
            <div
              aria-hidden
              className="flex h-full w-full items-center justify-center p-3 transition-transform duration-200 group-hover:scale-[1.02]"
              // eslint-disable-next-line react/no-danger -- SVG is authored in
              // lib/latex/previews.ts; getter validates the prefix.
              dangerouslySetInnerHTML={{ __html: safePreview }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
              No preview
            </div>
          )}
        </div>
        <CardHeader>
          <div className="mb-1 flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              {isLetter ? (
                <Mail className="size-4" />
              ) : (
                <FileText className="size-4" />
              )}
              {t.name}
            </CardTitle>
            <Badge variant={CATEGORY_BADGE[t.category]} className="text-[10px]">
              {CATEGORY_LABEL[t.category]}
            </Badge>
          </div>
          <CardDescription>{t.description}</CardDescription>
          <p className="mt-2 text-[11px] text-muted-foreground">
            <span className="font-semibold">Packages:</span>{' '}
            {t.packages.join(', ')}
          </p>
        </CardHeader>
        <CardContent className="mt-auto flex flex-col gap-2">
          <Button
            type="button"
            variant="default"
            onClick={() => pickTemplate(t.id)}
            disabled={isBusy()}
          >
            {templateBusy ? <Loader2 className="size-4 animate-spin" /> : null}
            Use template
          </Button>
          {isLetter ? null : (
            <Button
              type="button"
              variant="outline"
              onClick={() => pickAI(t.id)}
              disabled={isBusy() || !hasMaster}
              title={
                hasMaster
                  ? undefined
                  : 'Save a master CV first to enable AI generation.'
              }
            >
              {aiBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              AI-generate from master CV
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-8">
      {/* --- CVs & Resumes --- */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">CVs &amp; Resumes</h2>
          <p className="text-sm text-muted-foreground">
            Pick a layout for your LaTeX CV. AI generation uses your saved master
            CV for the source content.
          </p>
        </div>
        {cvGroups.map((group) => (
          <div key={group.category}>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {CATEGORY_LABEL[group.category]}
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map(renderCard)}
            </div>
          </div>
        ))}
      </section>

      {/* --- Cover Letters --- */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Cover Letters</h2>
          <p className="text-sm text-muted-foreground">
            LaTeX cover-letter templates. Placeholders are filled with sample
            content when no application context is available.
          </p>
        </div>
        {letterGroups.map((group) => (
          <div key={group.category}>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {CATEGORY_LABEL[group.category]}
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map(renderCard)}
            </div>
          </div>
        ))}
      </section>

      {/* --- Blank --- */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Or start blank</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Card>
            <CardContent className="flex items-center justify-between gap-3 py-5">
              <div>
                <p className="font-medium">Empty CV</p>
                <p className="text-xs text-muted-foreground">
                  A minimal \documentclass stub. Write from scratch.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={pickBlank}
                disabled={isBusy()}
              >
                {pending?.kind === 'blank' ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                Blank CV
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between gap-3 py-5">
              <div>
                <p className="font-medium">Empty cover letter</p>
                <p className="text-xs text-muted-foreground">
                  A minimal letter stub. Fill in recipient, greeting, body.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={pickBlankLetter}
                disabled={isBusy()}
              >
                {pending?.kind === 'blank_letter' ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                Blank letter
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
