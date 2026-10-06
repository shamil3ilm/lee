'use client'
import { useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import Link from 'next/link'
import { AlertTriangle, MoreVertical, Pencil, ScrollText, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  toggleSourceEnabled,
  removeSource,
} from '@/app/(authed)/settings/sources/actions'
import { relativeFromNow } from '@/lib/ui/date'
import { humanizeLabel } from '@/lib/ui/labels'
import { getSourceKind } from '@/lib/discovery/source-kinds'
import { joinMeta } from '@/lib/ui/meta'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

const SourceEditDialog = dynamic(
  () => import('@/components/source-edit-dialog').then((m) => m.SourceEditDialog),
  { ssr: false },
)

export interface SourceRowItem {
  id: string
  name: string
  kind: string
  enabled: boolean
  configSummary: string
  /** Board slug / feed URL, pre-filled in the edit form. */
  configValue: string
  lastPolledAt: string | null
  lastError: string | null
  errorCount: number
  /** Last successful poll, e.g. "12 found · 3 new · 1 quarantined". */
  lastResult: string | null
}

export function SourceRow({ source }: { source: SourceRowItem }) {
  const [isPending, startTransition] = useTransition()
  const [enabled, setEnabled] = useState(source.enabled)

  const handleToggle = (): void => {
    const next = !enabled
    setEnabled(next)
    startTransition(async () => {
      const result = await toggleSourceEnabled(source.id, next)
      if (!('success' in result)) {
        setEnabled(!next)
        toast.error(result.error)
      }
    })
  }

  const [editOpen, setEditOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const handleRemove = (): void => {
    startTransition(async () => {
      const result = await removeSource(source.id)
      if ('success' in result) {
        toast.success('Source removed')
        setConfirmOpen(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="slate">{getSourceKind(source.kind)?.label ?? humanizeLabel(source.kind)}</Badge>
            <span className="truncate text-sm font-semibold">{source.name}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {/* Present parts only (no leading "·" or "— ·"), as one inline
                run of text so a "·" never starts a wrapped line. */}
            <span suppressHydrationWarning>
              {joinMeta([
                source.configSummary,
                source.lastPolledAt ? `checked ${relativeFromNow(source.lastPolledAt)}` : 'never checked',
              ])}
              {source.lastResult && source.errorCount === 0 ? (
                <>
                  {' · '}
                  <span data-testid="source-last-result">{source.lastResult}</span>
                </>
              ) : null}
            </span>
            {source.errorCount > 0 && source.lastError ? (
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 text-danger">
                      <AlertTriangle className="size-3.5" />
                      {source.errorCount} error{source.errorCount === 1 ? '' : 's'}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">
                    {source.lastError}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
            {source.lastPolledAt ? (
              <Link
                href={`/settings/logs?category=source&source=${source.id}&range=30d`}
                className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
              >
                <ScrollText className="size-3.5" aria-hidden />
                Log
              </Link>
            ) : null}
          </div>
          {source.errorCount > 0 && source.lastError ? (
            <p className="mt-1 line-clamp-1 break-all text-xs text-danger" data-testid="source-last-error">
              Last error: {source.lastError}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="sr-only"
              checked={enabled}
              onChange={handleToggle}
              disabled={isPending}
              aria-label={enabled ? 'Disable source' : 'Enable source'}
            />
            <span
              className={[
                'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                enabled ? 'bg-primary' : 'bg-muted',
              ].join(' ')}
            >
              <span
                className={[
                  'inline-block h-4 w-4 transform rounded-full bg-card shadow ring-1 ring-border transition-transform',
                  enabled ? 'translate-x-4' : 'translate-x-0.5',
                ].join(' ')}
              />
            </span>
            <span>{enabled ? 'On' : 'Off'}</span>
          </label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                aria-label={`Actions for ${source.name}`}
              >
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                <Pencil className="size-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-danger focus:text-danger"
                onSelect={() => setConfirmOpen(true)}
              >
                <Trash2 className="size-4" />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
      {editOpen ? (
        <SourceEditDialog
          source={{
            id: source.id,
            name: source.name,
            kind: source.kind,
            enabled,
            configValue: source.configValue,
          }}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      ) : null}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Remove "${source.name}"?`}
        description={
          <>
            <p>
              This deletes the source and every discovery it found that is still in your inbox
              (new or dismissed). Applications you already saved from it are kept.
            </p>
            <p>To pause it and keep its discoveries, turn it Off instead.</p>
          </>
        }
        confirmLabel="Remove"
        pending={isPending}
        onConfirm={handleRemove}
      />
    </Card>
  )
}
