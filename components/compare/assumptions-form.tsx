'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Calculator, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { fetchRatesAction, saveAssumptionsAction } from '@/app/(authed)/settings/current-job/actions'
import { parseAmount } from '@/lib/compare/form'
import { rateLine } from '@/lib/compare/fx'
import {
  DEFAULT_TAX,
  FLOATING_CURRENCIES,
  PLACE_CURRENCY,
  PLACE_LABELS,
  PLACES,
  type Assumptions,
  type CompareCurrency,
  type FloatingCurrency,
  type Place,
} from '@/lib/compare/types'
import { shortDay } from '@/lib/ui/date'

type PlaceRow = { taxRate: string; housing: string; living: string }

const str = (n: number | null | undefined): string => (n === null || n === undefined ? '' : String(n))

function initialPlaces(a: Assumptions): Record<Place, PlaceRow> {
  return Object.fromEntries(
    PLACES.map((p) => [p, { taxRate: str(a.places[p]?.taxRate), housing: str(a.places[p]?.housing), living: str(a.places[p]?.living) }]),
  ) as Record<Place, PlaceRow>
}

/** FX table + per-place tax and cost-of-living assumptions. */
export function AssumptionsForm({ initial, currency }: { initial: Assumptions; currency: CompareCurrency }) {
  const router = useRouter()
  const [rates, setRates] = useState<Record<FloatingCurrency, string>>({
    INR: str(initial.fx.rates.INR),
    EUR: str(initial.fx.rates.EUR),
    GBP: str(initial.fx.rates.GBP),
  })
  const [source, setSource] = useState(initial.fx.source)
  const [places, setPlaces] = useState(() => initialPlaces(initial))
  const [pending, start] = useTransition()

  const fx = {
    rates: Object.fromEntries(FLOATING_CURRENCIES.map((c) => [c, parseAmount(rates[c]) || null])) as Record<FloatingCurrency, number | null>,
    updatedAt: initial.fx.updatedAt,
    source,
  }
  const previews = (['AED', 'SAR', 'USD'] as const)
    .filter((c) => c !== currency)
    .map((c) => rateLine(c, currency, fx))
    .filter((l): l is string => l !== null)

  const fetchRates = (): void =>
    start(async () => {
      const r = await fetchRatesAction()
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      setRates({ INR: str(r.rates.rates.INR), EUR: str(r.rates.rates.EUR), GBP: str(r.rates.rates.GBP) })
      setSource('ecb')
      toast.success(`ECB rates of ${shortDay(r.rates.date)} filled in. Review, then save.`)
    })

  const invalid = [...Object.values(rates), ...PLACES.flatMap((p) => Object.values(places[p]))].some((v) =>
    Number.isNaN(parseAmount(v)),
  )

  const save = (): void =>
    start(async () => {
      if (invalid) {
        toast.error('Use plain numbers, like 83.2 or 5000.')
        return
      }
      const payload = {
        fx,
        places: Object.fromEntries(
          PLACES.map((p) => [p, { taxRate: parseAmount(places[p].taxRate), housing: parseAmount(places[p].housing), living: parseAmount(places[p].living) }]),
        ),
      }
      const r = await saveAssumptionsAction(payload)
      if ('error' in r) toast.error(r.error)
      else {
        toast.success(r.message ?? 'Saved')
        router.refresh()
      }
    })

  const setPlace = (p: Place, patch: Partial<PlaceRow>): void => setPlaces((all) => ({ ...all, [p]: { ...all[p], ...patch } }))

  return (
    <Card id="assumptions">
      <CardHeader className="space-y-1.5">
        <CardTitle className="flex items-center gap-2">
          <Calculator className="size-4" aria-hidden="true" />
          Money assumptions
        </CardTitle>
        <CardDescription>
          Used for the take-home estimate. GCC currencies convert through their US-dollar pegs; INR, EUR and GBP only through the
          rates you set here. Nothing is guessed: a missing rate or cost leaves that part unknown.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <section aria-labelledby="fx-title" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="fx-title" className="text-sm font-semibold">
                FX table <span className="font-normal text-muted-foreground">(units per 1 USD)</span>
              </h3>
              <Button type="button" size="sm" variant="outline" onClick={fetchRates} disabled={pending}>
                <Download className="size-4" />
                Fetch ECB rates
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {FLOATING_CURRENCIES.map((c) => (
                <label key={c} className="grid gap-1.5 text-sm">
                  <span className="font-medium">{c} per USD</span>
                  <Input inputMode="decimal" value={rates[c]} onChange={(e) => {
                      setRates((r) => ({ ...r, [c]: e.target.value }))
                      setSource('manual')
                    }}
                  />
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground" data-testid="fx-updated">
              {initial.fx.updatedAt
                ? `Last updated ${shortDay(initial.fx.updatedAt)}${initial.fx.source === 'ecb' ? ' from ECB reference rates' : ' by you'}.`
                : 'Not set yet.'}{' '}
              {previews.length > 0 ? previews.join(' · ') : null}
            </p>
          </section>

          <section aria-labelledby="col-title" className="space-y-3">
            <h3 id="col-title" className="text-sm font-semibold">
              Tax and living costs per place <span className="font-normal text-muted-foreground">(monthly, local currency)</span>
            </h3>
            <ul className="divide-y rounded-lg border">
              {PLACES.map((p) => (
                <li key={p} className="grid gap-2 p-3 sm:grid-cols-[8rem_repeat(3,minmax(0,1fr))] sm:items-center">
                  <span className="text-sm font-medium">
                    {PLACE_LABELS[p]} <span className="text-xs font-normal text-muted-foreground">{PLACE_CURRENCY[p]}</span>
                  </span>
                  <Input
                    aria-label={`${PLACE_LABELS[p]} effective tax %`}
                    placeholder={DEFAULT_TAX[p] === null ? 'Tax % (not set)' : `Tax % (default ${DEFAULT_TAX[p]})`}
                    inputMode="decimal"
                    value={places[p].taxRate}
                    onChange={(e) => setPlace(p, { taxRate: e.target.value })}
                  />
                  <Input
                    aria-label={`${PLACE_LABELS[p]} housing per month`}
                    placeholder="Housing"
                    inputMode="decimal"
                    value={places[p].housing}
                    onChange={(e) => setPlace(p, { housing: e.target.value })}
                  />
                  <Input
                    aria-label={`${PLACE_LABELS[p]} other living costs per month`}
                    placeholder="Other living costs"
                    inputMode="decimal"
                    value={places[p].living}
                    onChange={(e) => setPlace(p, { living: e.target.value })}
                  />
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              The UAE, Saudi Arabia, Qatar, Kuwait, Bahrain and Oman levy no personal income tax on salaries (Oman plans one for high
              earners from 2028), so they default to 0%. India has no default: set your effective rate.
            </p>
          </section>

          <Button type="submit" disabled={pending}>
            Save assumptions
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
