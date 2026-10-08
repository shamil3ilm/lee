'use client'
import * as React from 'react'
import Link from 'next/link'
import { Download, HelpCircle, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
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
  /**
   * `chart` (default) gives children a fixed-height box for Recharts'
   * ResponsiveContainer. `content` lets lists and tables grow to their
   * natural height so nothing is cut off at the card edge.
   */
  body?: 'chart' | 'content'
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
  body = 'chart',
}: CardShellProps) {
  return (
    <Card className={cn('flex min-w-0 flex-col', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-1">
          <CardTitle>{title}</CardTitle>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* 24px target (WCAG 2.5.8) around a 14px icon. */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6 text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
                  aria-label={`About ${title}`}
                >
                  <HelpCircle />
                </Button>
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
          <EmptyState size="sm" className="h-56" icon={EmptyIcon} title="Nothing to chart yet" description={emptyMessage} />
        ) : (
          <div className={body === 'chart' ? 'h-56 w-full' : 'min-h-56 w-full'}>{children}</div>
        )}
      </CardContent>
    </Card>
  )
}
