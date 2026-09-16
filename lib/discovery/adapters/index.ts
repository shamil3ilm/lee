import type { DiscoveryAdapter } from './types'
import { GreenhouseAdapter } from './greenhouse'
import { LeverAdapter } from './lever'
import { AshbyAdapter } from './ashby'
import { WorkableAdapter } from './workable'
import { RemoteOkAdapter } from './remoteok'
import { HnWhoIsHiringAdapter } from './hn-whoishiring'
import { RssAdapter } from './rss'
import { JsonLdAdapter } from './jsonld'
import { YcDirectoryAdapter } from './yc-directory'

// Registry is a plain object so tests can iterate keys and mock a single
// adapter without touching the others. New adapter kinds must be added here
// and to the corresponding `sources.kind` string set in the UI.
const registry: Record<string, DiscoveryAdapter> = {
  greenhouse: new GreenhouseAdapter(),
  lever: new LeverAdapter(),
  ashby: new AshbyAdapter(),
  workable: new WorkableAdapter(),
  remoteok: new RemoteOkAdapter(),
  hn_whoishiring: new HnWhoIsHiringAdapter(),
  rss: new RssAdapter(),
  jsonld: new JsonLdAdapter(),
  yc_directory: new YcDirectoryAdapter(),
}

export function getAdapter(kind: string): DiscoveryAdapter | null {
  return registry[kind] ?? null
}

export function listAdapterKinds(): string[] {
  return Object.keys(registry)
}

export type { DiscoveryAdapter, DiscoveryItem, NormalizedJob, NormalizedCompany } from './types'
