'use client'
import { AlertTriangle, X } from 'lucide-react'
import type { ImportReportItem } from './report-store'

interface ImportReportProps {
  items: readonly ImportReportItem[]
  onJump: (file: string, line: number) => void
  onDismiss: () => void
}

/**
 * After a project import: referenced files that are missing and files that
 * could not be stored. An item with a file and line opens it there.
 */
export function ImportReport({ items, onJump, onDismiss }: ImportReportProps) {
  if (items.length === 0) return null
  return (
    <div role="status" className="flex shrink-0 items-start gap-2 border-b bg-warning-soft px-3 py-2 text-xs text-warning" data-testid="import-report">
      <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          Imported, with {items.length} thing{items.length === 1 ? '' : 's'} to check:
        </p>
        <ul className="mt-1 max-h-24 space-y-0.5 overflow-y-auto">
          {items.map((item, i) => (
            <li key={i} className="min-w-0 break-words">
              {item.file && item.line ? (
                <button
                  type="button"
                  className="text-left underline decoration-dotted underline-offset-2 hover:decoration-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => onJump(item.file!, item.line!)}
                >
                  {item.file}:{item.line}
                </button>
              ) : null}{' '}
              {item.message}
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss the import report"
        className="rounded p-0.5 hover:bg-warning/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
