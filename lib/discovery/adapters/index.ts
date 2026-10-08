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
import { RecruiteeAdapter } from './recruitee'
import { PinpointAdapter } from './pinpoint'
import { HimalayasAdapter } from './himalayas'
import { JobicyAdapter } from './jobicy'
import { WeWorkRemotelyAdapter } from './weworkremotely'
import { RemotiveAdapter } from './remotive'
import { AdzunaAdapter } from './adzuna'
import { EmailAlertAdapter } from './email-alert'
import { GoogleAlertsAdapter } from './google-alerts'
import { WorkdayAdapter } from './workday'
import { WatchAdapter } from './watch'
import { WorkingNomadsAdapter } from './workingnomads'
import { OracleOrcAdapter, PhenomAdapter, SuccessFactorsAdapter } from './enterprise'
import { CyberparkAdapter, InfoparkAdapter, KsumAdapter, TechnoparkAdapter, UlCyberparkAdapter } from './kerala-parks'

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
  recruitee: new RecruiteeAdapter(),
  pinpoint: new PinpointAdapter(),
  himalayas: new HimalayasAdapter(),
  jobicy: new JobicyAdapter(),
  weworkremotely: new WeWorkRemotelyAdapter(),
  remotive: new RemotiveAdapter(),
  adzuna: new AdzunaAdapter(),
  email_alert: new EmailAlertAdapter(),
  google_alerts: new GoogleAlertsAdapter(),
  workday: new WorkdayAdapter(),
  watch: new WatchAdapter(),
  workingnomads: new WorkingNomadsAdapter(),
  technopark: new TechnoparkAdapter(),
  infopark: new InfoparkAdapter(),
  cyberpark: new CyberparkAdapter(),
  ul_cyberpark: new UlCyberparkAdapter(),
  ksum: new KsumAdapter(),
  oracle_orc: new OracleOrcAdapter(),
  successfactors: new SuccessFactorsAdapter(),
  phenom: new PhenomAdapter(),
}

export function getAdapter(kind: string): DiscoveryAdapter | null {
  return registry[kind] ?? null
}

export function listAdapterKinds(): string[] {
  return Object.keys(registry)
}

export type { AdapterContext, DiscoveryAdapter, DiscoveryItem, NormalizedJob, NormalizedCompany } from './types'
