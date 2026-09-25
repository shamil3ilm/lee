'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FileText, Loader2, Sparkles } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  createBlank,
  createFromMasterCV,
  createFromTemplate,
  type CreateLatexResult,
} from '@/app/(authed)/documents/new/latex/actions'

interface TemplateSummary {
  id: string
  name: string
  description: string
}

interface LatexTemplatePickerProps {
  templates: TemplateSummary[]
  hasMaster: boolean
}

type PendingAction =
  | { kind: 'template'; id: string }
  | { kind: 'ai'; id: string }
  | { kind: 'blank' }
  | null

export function LatexTemplatePicker({ templates, hasMaster }: LatexTemplatePickerProps) {
  const [pending, setPending] = useState<PendingAction>(null)
  const [, startTransition] = useTransition()

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

  function pickAI(templateId: string) {
    setPending({ kind: 'ai', id: templateId })
    startTransition(async () => {
      const result = await createFromMasterCV(templateId)
      handleResult(result)
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Templates
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => {
            const templateBusy =
              pending?.kind === 'template' && pending.id === t.id
            const aiBusy = pending?.kind === 'ai' && pending.id === t.id
            return (
              <Card
                key={t.id}
                className={cn(
                  'flex flex-col',
                  isBusy() && !templateBusy && !aiBusy && 'opacity-60',
                )}
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="size-4" />
                    {t.name}
                  </CardTitle>
                  <CardDescription>{t.description}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="default"
                    onClick={() => pickTemplate(t.id)}
                    disabled={isBusy()}
                  >
                    {templateBusy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : null}
                    Use template
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => pickAI(t.id)}
                    disabled={isBusy() || !hasMaster}
                    title={hasMaster ? undefined : 'Save a master CV first to enable AI generation.'}
                  >
                    {aiBusy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                    AI-generate from master CV
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Or start blank
        </h2>
        <Card>
          <CardContent className="flex items-center justify-between gap-3 py-5">
            <div>
              <p className="font-medium">Empty document</p>
              <p className="text-xs text-muted-foreground">
                A minimal \documentclass stub. Write from scratch.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={pickBlank} disabled={isBusy()}>
              {pending?.kind === 'blank' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Blank
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
