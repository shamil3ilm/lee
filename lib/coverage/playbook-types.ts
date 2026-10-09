/**
 * Region onboarding recipe (lib/coverage): everything lee needs to cover a
 * region, as DATA. Adding a region later means adding one playbook entry
 * (and its taxonomy node), not new code. Client-safe.
 */

/** A job site whose own alert e-mails lee reads (lib/email-alerts) or that the user only browses. */
export type PresetSite =
  | 'linkedin'
  | 'indeed'
  | 'bayt'
  | 'naukrigulf'
  | 'gulftalent'
  | 'naukri'
  | 'glassdoor'
  | 'instahyre'
  | 'wellfound'

export interface AlertPreset {
  site: PresetSite
  /** "LinkedIn · Kuwait". */
  label: string
  /** The site's own search page for this region; the user opens it and switches on the alert. */
  url: string
  /** True when lee parses this site's alert e-mails; otherwise the preset is a browse link. */
  parsed: boolean
}

export interface BrowseLink {
  label: string
  url: string
  /** Why lee does not read it automatically (robots.txt / terms / bot wall). */
  why: string
}

export interface RegionPlaybook {
  /** Region-taxonomy id ("kw", "kochi", "remote", "eu"…). */
  id: string
  label: string
  /** Region-taxonomy ids this playbook covers (itself plus siblings it stands for). */
  covers: readonly string[]
  /** Place words for job-board searches and alert queries ("Kuwait"). */
  searchPlace: string
  /** Places named in Google AI Mode prompts ("Kuwait City, Salmiya, Shuwaikh or Hawalli"). */
  aiModePlaces: string
  /** Job sites to set an alert on for this region, best first. */
  alertSites: readonly PresetSite[]
  /** Extra Google Alerts queries (local language, districts); role queries are built from preferences. */
  localQueries: readonly string[]
  /** Browse-only job boards for this region (never fetched). */
  boards: readonly BrowseLink[]
  /** Group whose browse directories (lib/company-discovery/sources/browse.ts) apply. */
  directoryGroup: string | null
  /** Priority for ordering and for suggestions (1 = highest). */
  priority: number
}
