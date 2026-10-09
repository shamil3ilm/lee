'use client'
import * as React from 'react'
import { Star, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { chainLabel } from '@/lib/regions/display'
import { searchRegions } from '@/lib/regions/picker'
import { MAX_PREFERRED, PREFERRED_BOOST, PREFERRED_LEVEL_LABELS, PREFERRED_LEVELS, type PreferredLevel, type PreferredRegion } from '@/lib/regions/preferred'
import { SETTINGS_ROOTS } from '@/lib/regions/taxonomy'
import { nodeName, shortName } from '@/lib/regions/tree'
import { cn } from '@/lib/utils'

const QUICK = ['ae', 'kw', 'sa', 'qa', 'bh', 'om', 'dubai', 'abu-dhabi', 'kerala', 'kochi'] as const

/**
 * Starred regions (Settings › Search): a ranking boost, never a filter.
 * Star a country (covers its cities) or a city (that city only) at
 * "Top priority" or "Preferred". Posts one hidden `preferredRegion` field
 * per star ("kw:top").
 */
export function PreferredRegionsField({ defaultValue }: { defaultValue: readonly PreferredRegion[] }) {
  const [value, setValue] = React.useState<PreferredRegion[]>([...defaultValue])
  const [query, setQuery] = React.useState('')
  const hits = query.trim() ? searchRegions(query, SETTINGS_ROOTS, 8) : []
  const full = value.length >= MAX_PREFERRED
  const add = (id: string): void => {
    if (full || value.some((v) => v.id === id)) return
    setValue([...value, { id, level: 'preferred' }])
    setQuery('')
  }
  const setLevel = (id: string, level: PreferredLevel): void => setValue(value.map((v) => (v.id === id ? { ...v, level } : v)))
  const remove = (id: string): void => setValue(value.filter((v) => v.id !== id))

  return (
    <div className="space-y-3 rounded-lg border p-3" data-testid="preferred-regions">
      <div>
        <p className="text-sm font-medium">Preferred regions</p>
        <p className="text-xs text-muted-foreground">
          Star regions you want ranked higher (a country covers its cities; a city only itself). Top priority adds +{PREFERRED_BOOST.match.top} to the Match Score’s region part, Preferred +{PREFERRED_BOOST.match.preferred}; the shortlist and company discovery add more. Other regions keep their normal weight.
        </p>
      </div>
      {value.length > 0 ? (
        <ul className="space-y-2" aria-label="Starred regions">
          {value.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-2">
              <Star className="size-4 fill-current text-warning" aria-hidden="true" />
              <span className="min-w-24 text-sm font-medium" title={chainLabel(v.id)}>
                {shortName(v.id)}
              </span>
              <NativeSelect
                aria-label={`Priority for ${nodeName(v.id)}`}
                value={v.level}
                onChange={(e) => setLevel(v.id, e.target.value as PreferredLevel)}
                className="h-8 w-auto"
              >
                {PREFERRED_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {PREFERRED_LEVEL_LABELS[l]}
                  </option>
                ))}
              </NativeSelect>
              <button
                type="button"
                onClick={() => remove(v.id)}
                aria-label={`Unstar ${nodeName(v.id)}`}
                className="grid size-8 place-items-center rounded-md hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
              <input type="hidden" name="preferredRegion" value={`${v.id}:${v.level}`} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No starred regions.</p>
      )}
      <div role="group" aria-label="Star a region" className="flex flex-wrap gap-1.5">
        {QUICK.filter((id) => !value.some((v) => v.id === id)).map((id) => (
          <button
            key={id}
            type="button"
            disabled={full}
            onClick={() => add(id)}
            className={cn(
              'inline-flex h-7 items-center gap-1 rounded-full border bg-card px-2.5 text-xs font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
            )}
            data-star={id}
          >
            <Star className="size-3" aria-hidden="true" />
            {shortName(id)}
          </button>
        ))}
      </div>
      <div className="space-y-1">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Star another place: Salmiya, Riyadh, Infopark…"
          aria-label="Search a region to star"
          className="h-8 sm:w-80"
          disabled={full}
        />
        {hits.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Matching places">
            {hits.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => add(h.id)}
                  className="inline-flex h-7 items-center gap-1 rounded-full border bg-card px-2.5 text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title={chainLabel(h.id)}
                >
                  <Star className="size-3" aria-hidden="true" />
                  {nodeName(h.id)}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
