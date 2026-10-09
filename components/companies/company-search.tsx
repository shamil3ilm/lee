'use client'
import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Plus, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addCompanyFromSearch, findCompanyByName } from '@/app/(authed)/discoveries/company-actions'
import type { ResolveOption } from '@/lib/company-discovery/search'
import { placeName } from '@/lib/regions/display'
import { cn } from '@/lib/utils'

/**
 * "Find a company by name": lee suggests matches (Wikidata, the
 * well-known employers list, website guesses it checked); the user picks
 * one, may correct the website, and confirms. Nothing is stored before that.
 */

const SOURCE_LABEL: Readonly<Record<ResolveOption['source'], string>> = {
  wikidata: 'Wikidata',
  seed: 'Known employer',
  guess: 'Website guess',
}

function OptionMeta({ o }: { o: ResolveOption }) {
  const parts = [
    o.regionIds[0] ? placeName(o.regionIds[0]) : null,
    o.founded ? `founded ${o.founded}` : null,
    o.employees ? `${o.employees.toLocaleString('en-US')} employees` : null,
    o.source === 'guess' ? (o.reachable === true ? 'site answers' : o.reachable === false ? 'site did not answer' : 'not checked') : null,
  ].filter(Boolean)
  return (
    <span className="block text-xs text-muted-foreground">
      {o.description ? `${o.description}. ` : ''}
      {parts.join(' · ')}
    </span>
  )
}

export function CompanySearch() {
  const router = useRouter()
  const inputId = useId()
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<ResolveOption[] | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [website, setWebsite] = useState('')
  const [pending, start] = useTransition()

  const find = (e: React.FormEvent): void => {
    e.preventDefault()
    start(async () => {
      const r = await findCompanyByName(query)
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      setOptions(r.options)
      const first = r.options[0] ?? null
      setPicked(first?.id ?? null)
      setWebsite(first?.website ?? '')
    })
  }

  const pick = (o: ResolveOption): void => {
    setPicked(o.id)
    setWebsite(o.website ?? '')
  }

  const add = (): void => {
    const o = options?.find((x) => x.id === picked)
    if (!o) return
    start(async () => {
      const r = await addCompanyFromSearch({
        name: o.name,
        website: website.trim() || null,
        regionIds: o.regionIds,
        industries: o.industries,
        ...(o.wikidataId ? { wikidataId: o.wikidataId } : {}),
        ...(o.founded ? { founded: o.founded } : {}),
        ...(o.employees ? { employees: o.employees } : {}),
      })
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      toast.success(r.message ?? 'Added')
      setOptions(null)
      setQuery('')
      router.refresh()
    })
  }

  return (
    <section className="space-y-2 rounded-xl border bg-card p-3" aria-label="Find a company" data-testid="company-search">
      <form onSubmit={find} className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor={inputId}>Find a company by name</Label>
          <Input
            id={inputId}
            value={query}
            onChange={(e) => setQuery(e.target.value.slice(0, 80))}
            placeholder="CareStack, or Acme Payments, Dubai"
            autoComplete="off"
            data-testid="company-search-input"
          />
        </div>
        <Button type="submit" size="sm" variant="outline" disabled={pending || query.trim().length < 2} data-testid="company-search-submit">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Search className="size-4" aria-hidden="true" />}
          Find
        </Button>
      </form>
      {options !== null ? (
        options.length === 0 ? (
          <p className="text-sm text-muted-foreground" role="status">
            No match. Paste its website with “Add companies” instead.
          </p>
        ) : (
          <div className="space-y-2">
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-medium">Is it one of these? Pick one, check the website, then add it.</legend>
              {options.map((o) => (
                <label
                  key={o.id}
                  className={cn('flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-sm', picked === o.id ? 'border-primary bg-muted' : 'border-border')}
                  data-testid="company-search-option"
                >
                  <input type="radio" name="company-choice" className="mt-1" checked={picked === o.id} onChange={() => pick(o)} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{o.name}</span>
                      <Badge variant="neutral" className="font-normal">
                        {SOURCE_LABEL[o.source]}
                      </Badge>
                      {o.website ? <span className="truncate text-xs text-muted-foreground">{o.website.replace(/^https:\/\//, '')}</span> : null}
                    </span>
                    <OptionMeta o={o} />
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <Label htmlFor={`${inputId}-site`}>Website</Label>
                <Input id={`${inputId}-site`} value={website} onChange={(e) => setWebsite(e.target.value.slice(0, 300))} placeholder="https://company.example" data-testid="company-search-website" />
              </div>
              <Button type="button" size="sm" onClick={add} disabled={pending || !picked} data-testid="company-search-add">
                <Plus className="size-4" aria-hidden="true" />
                Add company
              </Button>
            </div>
          </div>
        )
      ) : null}
    </section>
  )
}
