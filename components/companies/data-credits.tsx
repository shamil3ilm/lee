import { OSM_ATTRIBUTION, OSM_COPYRIGHT_URL } from '@/lib/company-discovery/sources/osm-attribution'

/**
 * Source credits at the foot of the Companies tab. OpenStreetMap's ODbL
 * requires the attribution wherever its data is shown; GLEIF (CC0) and the
 * Indian Government Open Data License are credited too.
 */
export function DataCredits() {
  return (
    <p className="text-xs text-muted-foreground" data-testid="companies-attribution">
      Map data{' '}
      <a href={OSM_COPYRIGHT_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
        {OSM_ATTRIBUTION}
      </a>
      . Legal entity data: GLEIF (CC0). Indian company data: Ministry of Corporate Affairs via data.gov.in (Government Open Data License – India).
    </p>
  )
}
