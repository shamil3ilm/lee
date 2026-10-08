'use client'
import { Loader2 } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type { CodingSubmitResult } from '@/lib/academy/coding/submit'
import type { PublicProblem } from '@/lib/academy/problems/public'
import { RunResultView, SubmitResultView, type RunView } from './result-view'
import { Checkbox } from '@/components/ui/checkbox'

export type ConsoleTab = 'testcase' | 'result'

export interface ConsolePanelProps {
  problem: PublicProblem
  tab: ConsoleTab
  onTab: (tab: ConsoleTab) => void
  custom: string
  useCustom: boolean
  onCustom: (text: string) => void
  onUseCustom: (use: boolean) => void
  status: string | null
  run: RunView | null
  submit: { result: CodingSubmitResult; stdout: string } | null
  error: string | null
}

export function ConsolePanel(p: ConsolePanelProps) {
  const sql = p.problem.kind === 'sql'
  const params = p.problem.kind === 'function' ? p.problem.fn.params.map((x) => x.name).join(', ') : ''
  return (
    <Tabs value={p.tab} onValueChange={(v) => p.onTab(v as ConsoleTab)} className="flex h-full min-h-0 flex-col">
      <TabsList className="w-full justify-start">
        <TabsTrigger value="testcase">Test case</TabsTrigger>
        <TabsTrigger value="result">Result</TabsTrigger>
      </TabsList>
      <div className="min-h-0 flex-1 overflow-y-auto pt-3">
        <TabsContent value="testcase" className="mt-0 space-y-2">
          <p className="text-xs text-muted-foreground">
            Run checks the {p.problem.samples.length} sample{p.problem.samples.length === 1 ? '' : 's'}
            {p.useCustom ? ' and your custom input' : ''}. Ctrl+Enter runs, Ctrl+Shift+Enter submits.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={p.useCustom} onChange={(e) => p.onUseCustom(e.target.checked)} />
            Also run a custom input
          </label>
          {p.useCustom ? (
            <div className="space-y-1">
              <Label htmlFor="custom-input">{sql ? 'Seed data (INSERT statements)' : `One JSON value per line: ${params}`}</Label>
              <Textarea
                id="custom-input"
                value={p.custom}
                onChange={(e) => p.onCustom(e.target.value)}
                rows={sql ? 6 : Math.max(2, p.problem.kind === 'function' ? p.problem.fn.params.length + 1 : 3)}
                spellCheck={false}
                className="font-mono text-xs"
              />
            </div>
          ) : null}
        </TabsContent>
        <TabsContent value="result" className="mt-0" aria-live="polite">
          {p.status ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="run-status">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {p.status}
            </p>
          ) : p.error ? (
            <p className="text-sm text-danger" role="alert">
              {p.error}
            </p>
          ) : p.submit ? (
            <SubmitResultView result={p.submit.result} stdout={p.submit.stdout} sql={sql} />
          ) : p.run ? (
            <RunResultView run={p.run} sql={sql} />
          ) : (
            <p className="text-sm text-muted-foreground">Run your code to see results here.</p>
          )}
        </TabsContent>
      </div>
    </Tabs>
  )
}
