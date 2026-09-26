'use client'
import { ListTree } from 'lucide-react'
import type { OutlineItem } from '@/lib/latex/outline'

interface OutlinePanelProps {
  items: readonly OutlineItem[]
  onJump: (line: number) => void
}

/** Section outline (\part … \subparagraph, starred too); click to jump. */
export function OutlinePanel({ items, onJump }: OutlinePanelProps) {
  const minLevel = items.reduce((m, o) => Math.min(m, o.level), Infinity)
  return (
    <nav aria-label="Document outline" className="flex h-full min-h-0 flex-col text-xs">
      <p className="flex items-center gap-1.5 border-b px-3 py-2 font-semibold text-muted-foreground">
        <ListTree className="size-3.5" />
        Outline
      </p>
      {items.length === 0 ? (
        <p className="px-3 py-2 text-muted-foreground">No sections yet. Add \section&#123;…&#125; to see them here.</p>
      ) : (
        <ul className="min-h-0 overflow-y-auto py-1">
          {items.map((item) => (
            <li key={`${item.from}-${item.title}`}>
              <button
                type="button"
                onClick={() => onJump(item.line)}
                className="block w-full truncate py-1 pr-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                style={{ paddingLeft: `${0.75 + (item.level - minLevel) * 0.75}rem` }}
                title={`${item.title} (line ${item.line})`}
              >
                <span className={item.level - minLevel === 0 ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                  {item.title || `\\${item.command}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  )
}
