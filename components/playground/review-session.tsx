'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { gradeCardAction } from '@/app/(authed)/playground/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/empty-state'
import type { DueCard } from '@/lib/academy/service/reviews'
import { GRADES, type Grade } from '@/lib/academy/srs/sm2'

const GRADE_LABELS: Readonly<Record<Grade, string>> = { again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy' }

/** One card at a time: recall, reveal, grade (SM-2 schedules the next review). */
export function ReviewSession({ cards }: { cards: DueCard[] }) {
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [pending, start] = useTransition()
  const card = cards[index]

  if (!card) {
    return (
      <EmptyState
        title={cards.length === 0 ? 'No cards due' : 'All caught up'}
        description="Cards come back on a spaced schedule after you practise their skill."
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/playground">Back to today&apos;s plan</Link>
          </Button>
        }
      />
    )
  }

  const grade = (g: Grade): void => {
    start(async () => {
      const r = await gradeCardAction({ cardId: card.cardId, grade: g })
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      toast.success(`Next review in ${r.intervalDays} day${r.intervalDays === 1 ? '' : 's'}`)
      for (const name of r.earned) toast.success(`Achievement: ${name}`)
      setRevealed(false)
      setIndex((i) => i + 1)
    })
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-6">
        <p className="text-xs text-muted-foreground">
          {card.skillName} · card {index + 1} of {cards.length}
        </p>
        <p className="break-words text-base font-medium">{card.front}</p>
        {revealed ? (
          <>
            <p className="break-words rounded-lg bg-muted p-3 text-sm">{card.back}</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="How well did you remember it?">
              {GRADES.map((g) => (
                <Button key={g} type="button" size="sm" variant={g === 'good' ? 'default' : 'outline'} disabled={pending} onClick={() => grade(g)}>
                  {GRADE_LABELS[g]}
                </Button>
              ))}
            </div>
          </>
        ) : (
          <Button type="button" onClick={() => setRevealed(true)}>
            Show answer
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
