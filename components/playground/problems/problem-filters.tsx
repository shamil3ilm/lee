import { Search } from 'lucide-react'
import { Toolbar } from '@/components/page-header'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { AutoApplyForm } from '@/components/filters/auto-apply-form'
import { plural } from '@/lib/ui/labels'
import { PROBLEM_STATUSES, type ProblemFilters } from '@/lib/academy/coding/list'
import { DIFFICULTIES, DIFFICULTY_LABELS, LANGUAGE_LABELS, ROLES, TOPICS, CODE_LANGUAGES } from '@/lib/academy/problems/constants'
import { ROLE_LABELS, STATUS_LABELS, TOPIC_LABELS } from './labels'

/** URL-driven filters that apply on change (a GET form without JavaScript). */
export function ProblemFiltersBar({ filters, total }: { filters: ProblemFilters; total: number }) {
  const select = 'h-8 w-full sm:w-36'
  return (
    <Toolbar label="Filter problems">
      <AutoApplyForm
        action="/playground/problems"
        label="Problem filters"
        status={plural(total, 'problem')}
        clearHref="/playground/problems"
        defaults={{ sort: 'default' }}
        className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center"
      >
        <div className="relative col-span-2 sm:w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={filters.q ?? ''} placeholder="Search problems" aria-label="Search problems" className="h-8 pl-8" />
        </div>
        <NativeSelect name="difficulty" defaultValue={filters.difficulty ?? ''} aria-label="Difficulty" className={select}>
          <option value="">Any difficulty</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {DIFFICULTY_LABELS[d]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="topic" defaultValue={filters.topic ?? ''} aria-label="Topic" className={select}>
          <option value="">Any topic</option>
          {TOPICS.map((t) => (
            <option key={t} value={t}>
              {TOPIC_LABELS[t]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="role" defaultValue={filters.role ?? ''} aria-label="Relevant to role" className={select}>
          <option value="">Any role</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="status" defaultValue={filters.status ?? ''} aria-label="Status" className={select}>
          <option value="">Any status</option>
          {PROBLEM_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="language" defaultValue={filters.language ?? ''} aria-label="Language" className={select}>
          <option value="">Any language</option>
          {CODE_LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {LANGUAGE_LABELS[l]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="sort" defaultValue={filters.sort} aria-label="Sort" className={select}>
          <option value="default">Sort: by topic</option>
          <option value="difficulty">Sort: difficulty</option>
          <option value="acceptance">Sort: your acceptance</option>
          <option value="recent">Sort: recently tried</option>
          <option value="title">Sort: title</option>
        </NativeSelect>
      </AutoApplyForm>
    </Toolbar>
  )
}
