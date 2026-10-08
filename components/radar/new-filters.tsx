import { Button } from '@/components/ui/button'
import { FormActions, FormField } from '@/components/ui/form-field'
import { NativeSelect } from '@/components/ui/native-select'
import { PERIODS, type WhatsNewFilters } from '@/lib/radar/new/filters'
import { GROUP_LABELS, MODEL_GROUPS, NEW_CATEGORIES, NEW_CATEGORY_LABELS } from '@/lib/radar/new/types'

/** GET filter form for /radar/new (works without JavaScript). */
export function NewFilters({ filters }: { filters: WhatsNewFilters }) {
  return (
    <form
      method="get"
      action="/radar/new"
      role="search"
      aria-label="Filter What's new"
      className="grid gap-3 sm:grid-cols-3 lg:grid-cols-[repeat(3,minmax(0,12rem))_auto_auto] lg:items-end"
    >
      <FormField htmlFor="new-category" label="Category">
        <NativeSelect id="new-category" name="category" defaultValue={filters.category ?? ''}>
          <option value="">All categories</option>
          {NEW_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {NEW_CATEGORY_LABELS[c]}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField htmlFor="new-group" label="Model type">
        <NativeSelect id="new-group" name="group" defaultValue={filters.group ?? ''}>
          <option value="">All model types</option>
          {MODEL_GROUPS.map((g) => (
            <option key={g} value={g}>
              {GROUP_LABELS[g]}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField htmlFor="new-period" label="Period">
        <NativeSelect id="new-period" name="period" defaultValue={filters.period}>
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm sm:col-span-2 lg:col-span-1 lg:pb-2">
        <legend className="sr-only">Show only</legend>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" name="relevant" value="1" defaultChecked={filters.relevantOnly} className="size-4 accent-primary" />
          Relevant to me
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" name="open" value="1" defaultChecked={filters.openOnly} className="size-4 accent-primary" />
          Open source only
        </label>
      </fieldset>
      <FormActions>
        <Button type="submit" className="w-full sm:w-auto">
          Filter
        </Button>
      </FormActions>
    </form>
  )
}
