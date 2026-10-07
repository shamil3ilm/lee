'use client'
import { useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Download, FileText, Moon, ZoomIn, ZoomOut } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { clampPage, zoomIn, zoomLabel, zoomOut, ZOOM_PRESETS, type ZoomMode } from '@/lib/latex/pdf-zoom'
import { IconButton } from './icon-button'

export interface PdfNavProps {
  page: number
  pages: number
  scale: number
  dark: boolean
  hasPdf: boolean
  onPage: (page: number) => void
  onZoom: (mode: ZoomMode) => void
  onDark: (on: boolean) => void
}

/** Right side of the PDF toolbar: dark toggle, page navigation, zoom. */
interface PageInputProps {
  page: number
  pages: number
  disabled: boolean
  onPage: (page: number) => void
}

/** Typed page number; remounted (key) whenever the current page changes. */
function PageInput({ page, pages, disabled, onPage }: PageInputProps) {
  const [typed, setTyped] = useState(String(page))
  const commit = () => {
    const next = clampPage(Number(typed), page, pages)
    setTyped(String(next))
    if (next !== page) onPage(next)
  }
  return (
    <input
      value={typed}
      onChange={(e) => setTyped(e.target.value.replace(/\D/g, '').slice(0, 4))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
      }}
      disabled={disabled}
      inputMode="numeric"
      aria-label="Page number"
      className="h-6 w-8 rounded border bg-background text-center text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  )
}

export function PdfNav({ page, pages, scale, dark, hasPdf, onPage, onZoom, onDark }: PdfNavProps) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <IconButton label="Dark PDF" tip={dark ? 'Show the PDF in normal colours' : 'Show the PDF in dark colours'} pressed={dark} onClick={() => onDark(!dark)} disabled={!hasPdf} className="hidden @xl/pdf:inline-flex">
        <Moon />
      </IconButton>
      <IconButton label="Previous page" onClick={() => onPage(Math.max(1, page - 1))} disabled={!hasPdf || page <= 1} className="hidden @md/pdf:inline-flex">
        <ChevronLeft />
      </IconButton>
      <label className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
        <span className="sr-only">Page</span>
        <PageInput key={page} page={page} pages={pages} disabled={!hasPdf} onPage={onPage} />
        <span aria-label={`of ${pages} pages`}>/ {pages || '–'}</span>
      </label>
      <IconButton label="Next page" onClick={() => onPage(Math.min(pages, page + 1))} disabled={!hasPdf || page >= pages} className="hidden @md/pdf:inline-flex">
        <ChevronRight />
      </IconButton>
      <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
      <IconButton label="Zoom out" onClick={() => onZoom(zoomOut(scale))} disabled={!hasPdf} className="hidden @lg/pdf:inline-flex">
        <ZoomOut />
      </IconButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={!hasPdf}
            aria-label={`Zoom ${zoomLabel(scale)}`}
            className="inline-flex h-7 items-center gap-0.5 rounded-md px-1.5 text-xs tabular-nums text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          >
            {zoomLabel(scale)}
            <ChevronDown className="size-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onZoom('fit-width')}>Fit to width</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onZoom('fit-page')}>Fit to page</DropdownMenuItem>
          <DropdownMenuSeparator />
          {ZOOM_PRESETS.map((z) => (
            <DropdownMenuItem key={z} onSelect={() => onZoom(z)}>
              {zoomLabel(z)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <IconButton label="Zoom in" onClick={() => onZoom(zoomIn(scale))} disabled={!hasPdf} className="hidden @lg/pdf:inline-flex">
        <ZoomIn />
      </IconButton>
    </div>
  )
}

interface LogsButtonProps {
  errors: number
  warnings: number
  open: boolean
  onToggle: () => void
}

/** Logs icon with the error / warning count chip. */
export function LogsButton({ errors, warnings, open, onToggle }: LogsButtonProps) {
  const count = errors || warnings
  const label = errors ? `${errors} error${errors === 1 ? '' : 's'}` : warnings ? `${warnings} warning${warnings === 1 ? '' : 's'}` : 'No problems'
  return (
    <IconButton label={`Logs and errors: ${label}`} tip={`Logs · ${label}`} pressed={open} onClick={onToggle} className="relative w-auto gap-1 px-1.5">
      <FileText />
      {count ? (
        <span
          data-testid="problem-count"
          className={
            errors
              ? 'rounded-full bg-destructive px-1.5 text-[10px] font-semibold leading-4 text-destructive-foreground'
              : 'rounded-full bg-warning px-1.5 text-[10px] font-semibold leading-4 text-warning-foreground'
          }
        >
          {count}
        </span>
      ) : null}
    </IconButton>
  )
}

export function DownloadButton({ url, filename }: { url: string | null; filename: string }) {
  return (
    <IconButton
      label="Download PDF"
      disabled={!url}
      onClick={() => {
        if (!url) return
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        a.remove()
      }}
    >
      <Download />
    </IconButton>
  )
}
