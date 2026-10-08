'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  clearSearchPrefsAction,
  saveSearchPrefsAction,
  type SearchPrefsResult,
} from '@/app/(authed)/settings/profile/search-actions'
import type { SearchPrefsFormValues } from '@/lib/discovery/relevance/view'
import { TargetSections } from './target-sections'
import { LearnedTitles } from './learned-titles'
import { RecheckProgress, type RecheckStart } from './recheck-progress'
import { LanguagesSection, NoticeSection, PaySection, RuleSection, WorkAuthSection } from './rule-sections'

interface SearchPrefsFormProps {
  values: SearchPrefsFormValues
}

function report(result: SearchPrefsResult, verb: string): void {
  if ('error' in result) {
    toast.error(result.error)
    return
  }
  const detail = result.pending
    ? `Re-checking ${result.total} jobs… ${result.filtered} filtered out so far.`
    : result.evaluated > 0
      ? `${result.filtered} of ${result.evaluated} postings filtered out.`
      : undefined
  toast.success(verb, { description: detail })
}

/**
 * Settings › Search. Saving re-gates Discovery right
 * away (bounded), with the remainder queued.
 */
export function SearchPrefsForm({ values }: SearchPrefsFormProps) {
  const [pending, start] = useTransition()
  const [progress, setProgress] = useState<RecheckStart | null>(null)

  const after = (result: SearchPrefsResult, verb: string): void => {
    report(result, verb)
    if ('success' in result && result.total > 0) setProgress({ total: result.total, filtered: result.filtered, pending: result.pending })
  }
  const onSubmit = (fd: FormData): void => {
    start(async () => after(await saveSearchPrefsAction(fd), 'Search preferences saved'))
  }
  const onClear = (): void => {
    start(async () => after(await clearSearchPrefsAction(), 'Filtering turned off'))
  }

  return (
    <Card id="search-preferences">
      <CardHeader>
        <CardTitle>Search preferences</CardTitle>
        <CardDescription>
          What Discovery keeps and how it ranks. Only clear mismatches and your deal-breakers are filtered out, always with the reason.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={onSubmit} className="space-y-8" aria-label="Search preferences">
          <TargetSections values={values} />
          <RuleSection values={values} />
          <WorkAuthSection values={values} />
          <PaySection values={values} />
          <LanguagesSection values={values} />
          <NoticeSection values={values} />
          <LearnedTitles titles={values.learnedTitles} />
          {/* One Save for the whole form, kept in reach on a long page. */}
          <div
            data-testid="search-prefs-actions"
            className="sticky bottom-0 z-10 -mx-6 flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t bg-card px-6 py-3"
          >
            {progress ? <span className="mr-auto"><RecheckProgress key={`${progress.total}-${progress.filtered}`} start={progress} /></span> : null}
            {values.saved ? (
              <Button type="button" variant="ghost" onClick={onClear} disabled={pending}>
                Turn off filtering
              </Button>
            ) : null}
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save preferences'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
