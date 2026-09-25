'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { SearchHit, SearchKind, SearchResults } from '@/lib/search/service'

interface CommandMenuDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const KIND_LABEL: Record<SearchKind, string> = {
  application: 'Applications',
  company: 'Companies',
  contact: 'Contacts',
  discovery: 'Discoveries',
}

const KIND_ORDER: SearchKind[] = ['application', 'company', 'contact', 'discovery']

const EMPTY_RESULTS: SearchResults = {
  applications: [],
  companies: [],
  contacts: [],
  discoveries: [],
}

function flatten(results: SearchResults): SearchHit[] {
  return [
    ...results.applications,
    ...results.companies,
    ...results.contacts,
    ...results.discoveries,
  ]
}

function groupOf(results: SearchResults, kind: SearchKind): SearchHit[] {
  switch (kind) {
    case 'application':
      return results.applications
    case 'company':
      return results.companies
    case 'contact':
      return results.contacts
    case 'discovery':
      return results.discoveries
  }
}

export function CommandMenuDialog({ open, onOpenChange }: CommandMenuDialogProps) {
  const router = useRouter()
  const [query, setQuery] = React.useState('')
  const [debouncedQuery, setDebouncedQuery] = React.useState('')
  const [results, setResults] = React.useState<SearchResults>(EMPTY_RESULTS)
  const [loading, setLoading] = React.useState(false)
  const [activeIndex, setActiveIndex] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  // Reset every time the dialog opens so the palette always starts fresh.
  React.useEffect(() => {
    if (open) {
      setQuery('')
      setDebouncedQuery('')
      setResults(EMPTY_RESULTS)
      setActiveIndex(0)
      // Autofocus after Radix mounts the content.
      const t = setTimeout(() => inputRef.current?.focus(), 20)
      return () => clearTimeout(t)
    }
    return undefined
  }, [open])

  // 300ms debounce on the query input.
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(t)
  }, [query])

  // Fetch when debounced query changes.
  React.useEffect(() => {
    const q = debouncedQuery.trim()
    if (q.length < 2) {
      setResults(EMPTY_RESULTS)
      setActiveIndex(0)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    fetch('/api/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('search failed')
        return (await r.json()) as SearchResults
      })
      .then((data) => {
        if (cancelled) return
        setResults(data)
        setActiveIndex(0)
      })
      .catch(() => {
        if (cancelled) return
        setResults(EMPTY_RESULTS)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [debouncedQuery])

  const flat = React.useMemo(() => flatten(results), [results])
  const showEmpty = !loading && debouncedQuery.trim().length >= 2 && flat.length === 0

  const navigateTo = React.useCallback(
    (hit: SearchHit): void => {
      onOpenChange(false)
      router.push(hit.href)
    },
    [onOpenChange, router],
  )

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (flat.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % flat.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 + flat.length) % flat.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const hit = flat[activeIndex]
      if (hit) navigateTo(hit)
    }
  }

  let renderedIndex = 0
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 sm:max-w-xl">
        <DialogHeader className="border-b p-3">
          <DialogTitle className="sr-only">Command menu</DialogTitle>
          <div className="flex items-center gap-2">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search applications, companies, contacts, discoveries…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              aria-label="Search"
            />
          </div>
        </DialogHeader>
        <div className="max-h-96 overflow-y-auto p-1">
          {loading && debouncedQuery.trim().length >= 2 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">Searching…</div>
          ) : null}
          {!loading && debouncedQuery.trim().length < 2 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Type at least 2 characters to search.
            </div>
          ) : null}
          {showEmpty ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No results for &quot;{debouncedQuery}&quot;.
            </div>
          ) : null}
          {!loading && flat.length > 0
            ? KIND_ORDER.map((kind) => {
                const hits = groupOf(results, kind)
                if (hits.length === 0) return null
                return (
                  <div key={kind} className="pb-1">
                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {KIND_LABEL[kind]}
                    </div>
                    {hits.map((hit) => {
                      const idx = renderedIndex
                      renderedIndex += 1
                      const isActive = idx === activeIndex
                      return (
                        <button
                          key={`${hit.kind}-${hit.id}`}
                          type="button"
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() => navigateTo(hit)}
                          className={cn(
                            'flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm',
                            isActive
                              ? 'bg-accent text-accent-foreground'
                              : 'hover:bg-accent/60',
                          )}
                        >
                          <span className="truncate">{hit.title}</span>
                          {hit.subtitle ? (
                            <span className="truncate text-xs text-muted-foreground">
                              {hit.subtitle}
                            </span>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                )
              })
            : null}
        </div>
        <div className="flex items-center justify-between border-t px-3 py-2 text-[10px] text-muted-foreground">
          <span>
            <kbd className="rounded border bg-muted px-1 font-mono">↑↓</kbd> navigate
            <span className="mx-2">·</span>
            <kbd className="rounded border bg-muted px-1 font-mono">Enter</kbd> open
            <span className="mx-2">·</span>
            <kbd className="rounded border bg-muted px-1 font-mono">Esc</kbd> close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
