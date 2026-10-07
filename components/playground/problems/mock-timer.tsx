'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Timer } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

function remaining(endsAt: string, now: number): number {
  return Math.max(0, Math.floor((Date.parse(endsAt) - now) / 1000))
}

function clock(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return `${h > 0 ? `${h}:` : ''}${String(m).padStart(h > 0 ? 2 : 1, '0')}:${String(s).padStart(2, '0')}`
}

/** Countdown for a running mock assessment; at zero it points back to the results. */
export function MockTimer({ endsAt, mockId }: { endsAt: string; mockId: string }) {
  const [left, setLeft] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => setLeft(remaining(endsAt, Date.now()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [endsAt])
  const over = left === 0
  return (
    <div className="flex items-center gap-2" role="timer" aria-live="off">
      <Badge variant={over ? 'danger' : left !== null && left < 300 ? 'warning' : 'info'} className="gap-1 tabular-nums">
        <Timer className="size-3.5" aria-hidden />
        {left === null ? '…' : over ? 'Time is up' : clock(left)}
      </Badge>
      <Link href={`/playground/problems/mock/${mockId}`} className="text-sm text-primary underline-offset-4 hover:underline">
        {over ? 'See your results' : 'Mock overview'}
      </Link>
    </div>
  )
}
