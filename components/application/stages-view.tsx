'use client'
import { useState } from 'react'
import { Columns3, List } from 'lucide-react'
import { LazyStagesBoard } from '@/components/board/lazy'
import type { StageBoardItem } from '@/components/stages-board'
import { focusRing } from '@/components/ui/focus-ring'
import { cn } from '@/lib/utils'

type View = 'list' | 'board'

interface StagesViewProps {
  /** Interview stages for the board; the toggle shows only when there are some. */
  stages: StageBoardItem[]
  /** The timeline (list view), rendered by the server. */
  children: React.ReactNode
}

/**
 * Application detail › Timeline. Stages are listed once, in the timeline;
 * the drag-and-drop stage board is one click away (it used to be a second
 * card listing the same stages). The board only loads when chosen.
 */
export function StagesView({ stages, children }: StagesViewProps) {
  const [view, setView] = useState<View>('list')
  return (
    <div className="space-y-3">
      {stages.length > 0 ? (
        <div role="group" aria-label="Show stages as" className="inline-flex h-8 items-center rounded-lg bg-muted p-0.5 text-xs">
          {(
            [
              ['list', 'List', List],
              ['board', 'Board', Columns3],
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn(
                'inline-flex h-7 items-center gap-1 rounded-md px-2.5 font-medium transition-colors',
                view === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                focusRing,
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      ) : null}
      {view === 'board' ? <LazyStagesBoard stages={stages} /> : children}
    </div>
  )
}
