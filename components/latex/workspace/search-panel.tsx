'use client'
import { useDeferredValue, useMemo, useState } from 'react'
import { CaseSensitive } from 'lucide-react'
import { MAX_HITS, searchProject } from '@/lib/latex/project-search'
import { IconButton } from './icon-button'

interface SearchPanelProps {
  files: readonly { name: string; text: string }[]
  onOpen: (file: string, line: number) => void
}

/** Find in project: every open text file, click a hit to jump to it. */
export function SearchPanel({ files, onOpen }: SearchPanelProps) {
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const deferred = useDeferredValue(query)
  const hits = useMemo(() => searchProject(files, deferred, { caseSensitive }), [files, deferred, caseSensitive])
  return (
    <div className="flex h-full min-h-0 flex-col text-xs">
      <div className="flex h-8 shrink-0 items-center border-b px-3">
        <h2 className="font-semibold text-muted-foreground">Search</h2>
      </div>
      <div className="flex items-center gap-1 border-b p-2">
        <input
          autoFocus
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find in project"
          aria-label="Find in project"
          className="h-7 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <IconButton label="Match case" pressed={caseSensitive} onClick={() => setCaseSensitive((v) => !v)}>
          <CaseSensitive />
        </IconButton>
      </div>
      <p className="px-3 py-1.5 text-muted-foreground" aria-live="polite">
        {deferred
          ? `${hits.length >= MAX_HITS ? `${MAX_HITS}+` : hits.length} result${hits.length === 1 ? '' : 's'} in ${files.length} file${files.length === 1 ? '' : 's'}`
          : 'Searches main.tex and the text files you have open.'}
      </p>
      <ul className="min-h-0 flex-1 overflow-y-auto pb-2">
        {hits.map((h) => (
          <li key={`${h.file}:${h.line}:${h.column}`}>
            <button
              type="button"
              onClick={() => onOpen(h.file, h.line)}
              className="block w-full px-3 py-1 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
            >
              <span className="block font-mono text-[11px] text-muted-foreground">
                {h.file}:{h.line}
              </span>
              <span className="block truncate font-mono">
                {h.preview.slice(0, h.start)}
                <mark className="rounded-sm bg-warning/30 text-foreground">{h.preview.slice(h.start, h.end)}</mark>
                {h.preview.slice(h.end)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
