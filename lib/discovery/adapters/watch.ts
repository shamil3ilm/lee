import type { DiscoveryAdapter, DiscoveryItem } from './types'

/**
 * `watch` — a careers page or job portal lee must NOT fetch (its terms or
 * robots.txt forbid automated access, or it has no public feed). The
 * source only stores the link (config.url) and why it's manual
 * (config.reason); Settings › Sources lists it under "Check these
 * yourself". Watch sources are created switched off so the scheduler never
 * polls them, and this adapter makes no request even if one is switched on.
 */
export class WatchAdapter implements DiscoveryAdapter {
  constructor(readonly kind: string = 'watch') {}

  async fetch(): Promise<DiscoveryItem[]> {
    return []
  }
}
