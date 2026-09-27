'use client'
import { useTransition } from 'react'
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
    ? 'Re-checking the rest of your inbox in the background.'
    : result.evaluated > 0
      ? `${result.filtered} of ${result.evaluated} postings filtered out.`
      : undefined
  toast.success(verb, { description: detail })
}

/**
 * Settings › Profile › Search preferences. Saving re-gates Discovery right
 * away (bounded), with the remainder queued.
 */
export function SearchPrefsForm({ values }: SearchPrefsFormProps) {
  const [pending, start] = useTransition()

  const onSubmit = (fd: FormData): void => {
    start(async () => report(await saveSearchPrefsAction(fd), 'Search preferences saved'))
  }
  const onClear = (): void => {
    start(async () => report(await clearSearchPrefsAction(), 'Filtering turned off'))
  }

  return (
    <Card id="search-preferences">
      <CardHeader>
        <CardTitle>Search preferences</CardTitle>
        <CardDescription>
          What Discovery keeps. Postings that do not fit go to “Filtered out” with the reason, before any AI scoring.
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
          <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
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
