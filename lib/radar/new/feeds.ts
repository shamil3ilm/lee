import { feedById } from '../feeds-catalog'
import { fetchOfficialFeeds } from '../sources/feeds'
import type { RadarFetchDeps } from '../sources/types'
import type { RadarItemInput } from '../types'
import { detectLaunch } from './launch'
import type { NewFetchResult, NewItemInput } from './types'

/**
 * Model and product launches from the official lab feeds already in the
 * Radar (lib/radar/feeds-catalog.ts). Only posts that read as a launch
 * (lib/radar/new/launch.ts) are kept; a model launch is `proprietary`
 * unless the post links to or names open weights.
 */

export function toLaunchItems(items: readonly RadarItemInput[]): NewItemInput[] {
  return items.flatMap((i): NewItemInput[] => {
    const info = detectLaunch({ title: i.title, excerpt: i.excerpt, links: i.metrics.links })
    if (!info.launch) return []
    const org = feedById(i.metrics.feedId)?.org
    return [
      {
        ...i,
        source: 'feeds',
        ...(info.name ? { name: info.name } : {}),
        category: info.model ? 'model' : 'tool',
        openness: info.openness,
        group: info.model ? null : 'product',
        entityKey: `feed:${i.externalId}`,
        createdAt: i.publishedAt,
        tags: org ? [org.toLowerCase()] : [],
        traction: 0.5,
      },
    ]
  })
}

export async function fetchLaunchesNew(deps: RadarFetchDeps = {}): Promise<NewFetchResult> {
  const r = await fetchOfficialFeeds(deps)
  return { items: toLaunchItems(r.items), partialErrors: r.partialErrors }
}
