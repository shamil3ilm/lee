'use client'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { Question } from '@/lib/compare/verdict'

/** Questions for the recruiter / HR, one per unknown, copyable as a list. */
export function QuestionsList({ questions, id }: { questions: readonly Question[]; id: string }) {
  if (questions.length === 0) return null
  const copy = async (): Promise<void> => {
    const text = questions.map((q) => `- ${q.text}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Questions copied')
    } catch {
      toast.error('Could not copy. Select the list and copy it instead.')
    }
  }
  return (
    <section aria-labelledby={`questions-${id}`} className="space-y-2" data-testid="compare-questions">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`questions-${id}`} className="text-sm font-semibold">
          Unknowns to ask
        </h3>
        <Button type="button" size="sm" variant="outline" onClick={copy}>
          <Copy className="size-4" />
          Copy questions
        </Button>
      </div>
      <ul className="list-inside list-disc space-y-1 text-sm">
        {questions.map((q) => (
          <li key={q.id}>{q.text}</li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Paste them into outreach or your interview prep.</p>
    </section>
  )
}
