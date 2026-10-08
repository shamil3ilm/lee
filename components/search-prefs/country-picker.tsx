'use client'
import { useId, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { focusRing } from '@/components/ui/focus-ring'
import { countryName, searchCountries } from '@/lib/ui/countries'
import { cn } from '@/lib/utils'

interface CountryPickerProps {
  /** Form field name; posted as a comma-separated list of ISO codes. */
  name: string
  label: string
  help?: string
  /** Stored CSV ("SG, DE"). Unknown two-letter codes are kept, not dropped. */
  defaultValue: string
  /** Codes already covered elsewhere (e.g. the region chips). */
  exclude?: readonly string[]
}

const NO_CODES: readonly string[] = []

function initialCodes(csv: string): string[] {
  const out: string[] = []
  for (const part of csv.split(',')) {
    const c = part.trim().toUpperCase()
    if (/^[A-Z]{2}$/.test(c) && !out.includes(c)) out.push(c)
  }
  return out
}

/**
 * Searchable country chips instead of typed ISO codes: type a name or a
 * code, pick with Enter or a click, remove with the chip's ×. Follows the
 * ARIA combobox pattern (input + listbox, active option by
 * `aria-activedescendant`). Posts the same CSV the server always read.
 */
export function CountryPicker({ name, label, help, defaultValue, exclude = NO_CODES }: CountryPickerProps) {
  const id = useId()
  const [codes, setCodes] = useState<string[]>(() => initialCodes(defaultValue))
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const matches = useMemo(() => searchCountries(query, [...codes, ...exclude]), [query, codes, exclude])
  const listId = `${id}-list`
  const showList = open && matches.length > 0

  const add = (code: string): void => {
    setCodes((prev) => (prev.includes(code) ? prev : [...prev, code]))
    setQuery('')
    setActive(0)
  }
  const remove = (code: string): void => setCodes((prev) => prev.filter((c) => c !== code))

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((a) => Math.min(a + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      // Never submit the whole form from the picker.
      e.preventDefault()
      const pick = matches[active]
      if (open && pick) add(pick.code)
    } else if (e.key === 'Escape') {
      setOpen(false)
    } else if (e.key === 'Backspace' && query === '' && codes.length > 0) {
      remove(codes[codes.length - 1]!)
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-input`}>{label}</Label>
      <input type="hidden" name={name} value={codes.join(', ')} />
      {codes.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={`${label}: selected`}>
          {codes.map((c) => (
            <li key={c} className="inline-flex items-center gap-1 rounded-full border bg-secondary py-0.5 pl-2.5 pr-1 text-xs text-secondary-foreground">
              {countryName(c)}
              <button
                type="button"
                onClick={() => remove(c)}
                aria-label={`Remove ${countryName(c)}`}
                className={cn('grid size-5 place-items-center rounded-full hover:bg-accent', focusRing)}
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="relative">
        <Input
          id={`${id}-input`}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${id}-opt-${active}` : undefined}
          aria-describedby={help ? `${id}-help` : undefined}
          autoComplete="off"
          placeholder="Type a country…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setActive(0)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {showList ? (
          <ul
            id={listId}
            role="listbox"
            aria-label={label}
            className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-md"
          >
            {matches.map((c, i) => (
              <li
                key={c.code}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                // mousedown, not click: it fires before the input's blur closes the list.
                onMouseDown={(e) => {
                  e.preventDefault()
                  add(c.code)
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'flex cursor-pointer items-center justify-between rounded-sm px-2 py-1.5',
                  i === active && 'bg-accent text-accent-foreground',
                )}
              >
                <span>{c.name}</span>
                <span className="text-xs text-muted-foreground">{c.code}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {help ? (
        <p id={`${id}-help`} className="text-xs text-muted-foreground">
          {help}
        </p>
      ) : null}
    </div>
  )
}
