'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Check, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  acceptRoleSuggestionAction,
  dismissRoleSuggestionAction,
  refineRoleSuggestionsAction,
} from '@/app/(authed)/settings/profile/search-actions'
import type { RoleSuggestion, SuggestionResult } from '@/lib/discovery/relevance/suggest'

const PRIORITY_LABEL: Record<RoleSuggestion['priority'], string> = {
  strong: 'Strong fit',
  possible: 'Possible',
  stretch: 'Stretch',
  fallback: 'Fallback',
}

interface RoleSuggestionsProps {
  result: SuggestionResult
}

/**
 * "What else suits me": suggestions from the profile and master CV, each
 * with its evidence. Accept adds the role to the targets; dismiss hides it
 * for good. Nothing is applied automatically.
 */
export function RoleSuggestions({ result }: RoleSuggestionsProps) {
  const [extra, setExtra] = useState<RoleSuggestion[]>([])
  const [gone, setGone] = useState<Set<string>>(new Set())
  const [pending, start] = useTransition()
  const list = [...result.suggestions, ...extra].filter((s) => !gone.has(s.id))

  const hide = (id: string): void => setGone((g) => new Set(g).add(id))
  const accept = (s: RoleSuggestion): void =>
    start(async () => {
      const r = await acceptRoleSuggestionAction(s.family)
      if ('error' in r) toast.error(r.error)
      else {
        hide(s.id)
        toast.success(`Added “${s.label}” to your target roles`)
      }
    })
  const dismiss = (s: RoleSuggestion): void =>
    start(async () => {
      const r = await dismissRoleSuggestionAction(s.id)
      if ('error' in r) toast.error(r.error)
      else hide(s.id)
    })
  const refine = (): void =>
    start(async () => {
      const r = await refineRoleSuggestionsAction()
      if ('error' in r) toast.error(r.error)
      else if ('skipped' in r) toast(r.message, { description: r.fixHint })
      else if (r.suggestions.length === 0) toast('No further roles suggested.')
      else setExtra(r.suggestions)
    })

  return (
    <Card id="role-suggestions">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-muted-foreground" aria-hidden="true" />
          Roles that may suit you
        </CardTitle>
        <CardDescription>From your profile and master CV (never from tailored CVs). Accept to add a role to your targets.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {result.sparse ? (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            Your profile is sparse, so suggestions are limited. Complete{' '}
            <Link href="/settings/profile#cv-import" className="underline underline-offset-2">Settings › Profile</Link> or import a CV or LinkedIn export
            into your profile, then check back.
          </p>
        ) : null}
        {list.length === 0 && !result.sparse ? (
          <p className="text-sm text-muted-foreground">No new suggestions. Your targets already cover what your profile shows.</p>
        ) : null}
        <ul className="space-y-2">
          {list.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{s.label}</span>
                  <Badge variant={s.priority === 'strong' ? 'success' : s.priority === 'stretch' ? 'warning' : 'neutral'}>
                    {PRIORITY_LABEL[s.priority]}
                  </Badge>
                  {s.source === 'ai' ? <Badge variant="info">AI</Badge> : null}
                </div>
                <p className="text-xs text-muted-foreground">Because {s.reasons.map((r) => r.replace(/^Your /, 'your ')).join('; ')}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" onClick={() => accept(s)} disabled={pending}>
                  <Check className="size-3.5" />
                  Accept
                </Button>
                <Button size="sm" variant="ghost" onClick={() => dismiss(s)} disabled={pending} aria-label={`Dismiss ${s.label}`}>
                  <X className="size-3.5" />
                  Dismiss
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <Button size="sm" variant="outline" onClick={refine} disabled={pending || result.sparse}>
          <Sparkles className="size-3.5" />
          Refine with AI
        </Button>
      </CardContent>
    </Card>
  )
}
