'use client'
import * as React from 'react'
import Link from 'next/link'
import { Download, HelpCircle, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface CardShellProps {
  title: string
  /** Short explanation surfaced behind the info tooltip. */
  description: string
  /** Slug matching the /api/analytics/export/[metric] dispatcher. */
  exportMetric: string
  /** True when there's nothing to plot; renders the empty state instead of children. */
  isEmpty: boolean
  /** Copy shown in the empty state (e.g. "Add at least 5 applications..."). */
  emptyMessage: string
  emptyIcon: LucideIcon
  children: React.ReactNode
  className?: string
}

/**
 * Shared shell for every analytics insight card. Handles the standard
 * header (title + info tooltip + CSV download), the empty state, and a
 * fixed-height chart region so recharts' ResponsiveContainer can size
 * itself against a real parent.
 */
export function AnalyticsCardShell({
  title,
  description,
  exportMetric,
  isEmpty,
  emptyMessage,
  emptyIcon: EmptyIcon,
  children,
  className,
}: CardShellProps) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded"
                  aria-label={`About ${title}`}
                >
                  <HelpCircle className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[240px] text-xs">{description}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Button asChild size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs">
          <Link
            href={`/api/analytics/export/${exportMetric}`}
            aria-label={`Export ${title} as CSV`}
            prefetch={false}
          >
            <Download className="size-3.5" />
            CSV
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="flex-1 pt-0">
        {isEmpty ? (
          <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-md border border-dashed text-center">
            <EmptyIcon className="size-6 text-muted-foreground" />
            <p className="max-w-[220px] text-xs text-muted-foreground">{emptyMessage}</p>
          </div>
        ) : (
          <div className="h-56 w-full">{children}</div>
        )}
      </CardContent>
    </Card>
  )
}
