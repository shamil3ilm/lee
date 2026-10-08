import { Button } from '@/components/ui/button'
import { FormActions, FormField } from '@/components/ui/form-field'
import { NativeSelect } from '@/components/ui/native-select'
import { SINCE_OPTIONS, type ParsedFeedParams } from '@/lib/radar/filters'
import { RADAR_KINDS, RADAR_KIND_LABELS, RADAR_SOURCES, RADAR_SOURCE_LABELS } from '@/lib/radar/types'

/** GET filter form for /radar (works without JavaScript). */
export function FeedFilters({ raw }: { raw: ParsedFeedParams['raw'] }) {
  return (
    <form
      method="get"
      action="/radar"
      role="search"
      aria-label="Filter the Radar"
      className="grid gap-3 sm:grid-cols-3 lg:grid-cols-[repeat(3,minmax(0,12rem))_auto_auto] lg:items-end"
    >
      <FormField htmlFor="radar-source" label="Source">
        <NativeSelect id="radar-source" name="source" defaultValue={raw.source}>
          <option value="">All sources</option>
          {RADAR_SOURCES.map((s) => (
            <option key={s} value={s}>
              {RADAR_SOURCE_LABELS[s]}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField htmlFor="radar-type" label="Type">
        <NativeSelect id="radar-type" name="type" defaultValue={raw.type}>
          <option value="">All types</option>
          {RADAR_KINDS.map((k) => (
            <option key={k} value={k}>
              {RADAR_KIND_LABELS[k]}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField htmlFor="radar-since" label="Seen">
        <NativeSelect id="radar-since" name="since" defaultValue={raw.since}>
          {SINCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm sm:col-span-2 lg:col-span-1 lg:pb-2">
        <legend className="sr-only">Show only</legend>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" name="watched" value="1" defaultChecked={raw.watched} className="size-4 accent-primary" />
          Watch terms only
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" name="saved" value="1" defaultChecked={raw.saved} className="size-4 accent-primary" />
          Saved
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
