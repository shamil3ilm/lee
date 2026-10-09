import Link from 'next/link'
import type { RegionGroup } from '@/lib/regions/display'
import { mergeQuery, withQuery } from '@/lib/ui/filter-query'
import { cn } from '@/lib/utils'

interface RegionGroupsProps {
  groups: readonly RegionGroup[]
  /** Current query, kept on each link (the region is replaced). */
  searchParams: Readonly<Record<string, string | undefined>>
  /** The current region selection, highlighted. */
  selected: readonly string[]
  path?: string
}

/**
 * "Group by region": postings per GCC → country → city and India → state →
 * city under the other filters. Each count links to that region's filter.
 * Server-rendered; no script needed.
 */
export function RegionGroups({ groups, searchParams, selected, path = '/discoveries' }: RegionGroupsProps) {
  const current = new URLSearchParams(
    Object.entries(searchParams).filter((e): e is [string, string] => typeof e[1] === 'string'),
  )
  const href = (id: string): string => withQuery(path, mergeQuery(current, { region: id, tab: 'jobs' }))
  return (
    <section aria-labelledby="region-groups-title" className="rounded-lg border bg-card p-3" data-testid="region-groups">
      <h2 id="region-groups-title" className="mb-2 text-sm font-semibold">
        Postings by region
      </h2>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No region is known for these postings yet.</p>
      ) : (
        <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <li key={g.id}>
              <GroupLink group={g} href={href} selected={selected} strong />
              {g.children.length > 0 ? <GroupList groups={g.children} href={href} selected={selected} /> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function GroupList({ groups, href, selected }: { groups: readonly RegionGroup[]; href: (id: string) => string; selected: readonly string[] }) {
  return (
    <ul className="ml-3 border-l pl-3">
      {groups.map((g) => (
        <li key={g.id}>
          <GroupLink group={g} href={href} selected={selected} />
          {g.children.length > 0 ? <GroupList groups={g.children} href={href} selected={selected} /> : null}
        </li>
      ))}
    </ul>
  )
}

function GroupLink({
  group,
  href,
  selected,
  strong = false,
}: {
  group: RegionGroup
  href: (id: string) => string
  selected: readonly string[]
  strong?: boolean
}) {
  const active = selected.includes(group.id)
  return (
    <Link
      href={href(group.id)}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex min-h-6 items-center justify-between gap-2 rounded-sm px-1 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        strong && 'font-medium',
        active && 'bg-accent',
      )}
    >
      <span className="underline-offset-2 hover:underline">{group.name}</span>
      <span className="text-xs tabular-nums text-muted-foreground">{group.count}</span>
    </Link>
  )
}
