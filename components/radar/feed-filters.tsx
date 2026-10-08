import { AutoApplyForm } from '@/components/filters/auto-apply-form'
import { Checkbox } from '@/components/ui/checkbox'
import { FormField } from '@/components/ui/form-field'
import { NativeSelect } from '@/components/ui/native-select'
import { SINCE_OPTIONS, type ParsedFeedParams } from '@/lib/radar/filters'
import { RADAR_KINDS, RADAR_KIND_LABELS, RADAR_SOURCES, RADAR_SOURCE_LABELS } from '@/lib/radar/types'

/** Filters for /radar that apply on change (a GET form without JavaScript). */
export function FeedFilters({ raw, status }: { raw: ParsedFeedParams['raw']; status?: string }) {
  return (
    <AutoApplyForm
      action="/radar"
      label="Filter the Radar"
      status={status}
      clearHref="/radar"
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
        <Checkbox name="watched" value="1" defaultChecked={raw.watched} label="Watch terms only" />
        <Checkbox name="saved" value="1" defaultChecked={raw.saved} label="Saved" />
      </fieldset>
    </AutoApplyForm>
  )
}
