import { companyQueryName } from './match'

/**
 * One-click searches for sources lee must not fetch (their terms forbid
 * automated access, or there is no allowed API — docs/company-reviews.md).
 * Where a site's own search URL is known it is used; otherwise a web
 * search restricted to the site. Pure and client-safe.
 */

export interface DeepLink {
  id: string
  label: string
  url: string
}

export interface DeepLinkGroup {
  id: 'reviews' | 'community' | 'gcc'
  label: string
  links: DeepLink[]
}

function siteSearch(site: string, name: string, extra = ''): string {
  const q = `site:${site} "${name}"${extra ? ` ${extra}` : ''}`
  return `https://duckduckgo.com/?q=${encodeURIComponent(q)}`
}

export function reputationDeepLinks(companyName: string): DeepLinkGroup[] {
  const name = companyName.trim()
  const enc = encodeURIComponent(name)
  const short = companyQueryName(name)
  return [
    {
      id: 'reviews',
      label: 'Review sites',
      links: [
        { id: 'glassdoor', label: 'Glassdoor', url: `https://www.glassdoor.com/Search/results.htm?keyword=${enc}` },
        { id: 'indeed', label: 'Indeed', url: `https://www.indeed.com/companies/search?q=${enc}` },
        { id: 'ambitionbox', label: 'AmbitionBox', url: siteSearch('ambitionbox.com', name, 'reviews') },
        { id: 'comparably', label: 'Comparably', url: siteSearch('comparably.com', name) },
        { id: 'kununu', label: 'Kununu', url: siteSearch('kununu.com', name) },
        { id: 'blind', label: 'Blind', url: siteSearch('teamblind.com', name) },
      ],
    },
    {
      id: 'community',
      label: 'Community & layoffs',
      links: [
        { id: 'reddit', label: 'Reddit', url: `https://www.reddit.com/search/?q=${encodeURIComponent(`"${short}"`)}` },
        { id: 'layoffs', label: 'layoffs.fyi', url: siteSearch('layoffs.fyi', name) },
        { id: 'warn', label: 'WARN notices (US)', url: siteSearch('warntracker.com', name) },
      ],
    },
    {
      id: 'gcc',
      label: 'GCC registries',
      links: [
        { id: 'dubai', label: 'Dubai licence search', url: 'https://app.invest.dubai.ae/search-license' },
        {
          id: 'uae',
          label: 'UAE licence check',
          url: 'https://u.ae/en/information-and-services/business/important-digital-services/inquire-about-licences-names-and-activities',
        },
        { id: 'ksa', label: 'Saudi CR inquiry', url: 'https://my.gov.sa/en/services/18443' },
        { id: 'qatar', label: 'Qatar Business Map', url: 'https://businessmap.moci.gov.qa' },
      ],
    },
  ]
}
