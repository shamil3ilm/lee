'use client'
import { X } from 'lucide-react'
import { MAIN_FILE } from '@/lib/latex/file-kinds'
import { cn } from '@/lib/utils'

interface FileTabsProps {
  tabs: readonly string[]
  active: string
  dirty: readonly string[]
  onSelect: (file: string) => void
  onClose: (file: string) => void
}

/** Open files as tabs; main.tex always stays open. */
export function FileTabs({ tabs, active, dirty, onSelect, onClose }: FileTabsProps) {
  return (
    <div role="tablist" aria-label="Open files" className="flex h-8 shrink-0 items-stretch overflow-x-auto border-b bg-muted/30">
      {tabs.map((file) => {
        const selected = file === active
        return (
          <div
            key={file}
            className={cn(
              'group flex shrink-0 items-center border-r text-xs',
              selected ? 'bg-background text-foreground shadow-[inset_0_2px_0_hsl(var(--primary))]' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            <button
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onSelect(file)}
              className="h-full px-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              {file}
              {dirty.includes(file) ? <span className="ml-1 text-muted-foreground" aria-label="unsaved">•</span> : null}
            </button>
            {file !== MAIN_FILE ? (
              <button
                type="button"
                onClick={() => onClose(file)}
                aria-label={`Close ${file}`}
                title={`Close ${file}`}
                className="mr-1 rounded p-0.5 opacity-60 hover:bg-muted hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
