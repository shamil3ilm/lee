import { isWithin } from '@/lib/regions/tree'
import type { AlertPreset, PresetSite, RegionPlaybook } from './playbook-types'

/**
 * Search-page links for setting up a job alert on each site, per region.
 * The user opens them in their own browser and switches the site's alert
 * on; lee never fetches these pages (robots.txt and terms forbid it, see
 * docs/job-sources.md). Sites whose alert e-mails lee parses are marked
 * `parsed`. Client-safe.
 */

/** Sites whose alert e-mails lib/email-alerts reads. */
const PARSED: ReadonlySet<PresetSite> = new Set(['linkedin', 'indeed', 'bayt', 'naukrigulf', 'gulftalent', 'naukri', 'glassdoor'])

const SITE_LABEL: Readonly<Record<PresetSite, string>> = {
  linkedin: 'LinkedIn',
  indeed: 'Indeed',
  bayt: 'Bayt',
  naukrigulf: 'NaukriGulf',
  gulftalent: 'GulfTalent',
  naukri: 'Naukri',
  glassdoor: 'Glassdoor',
  instahyre: 'Instahyre',
  wellfound: 'Wellfound',
}

/** Indeed's country sites. */
const INDEED_HOST: Readonly<Record<string, string>> = {
  kw: 'kw.indeed.com',
  ae: 'ae.indeed.com',
  sa: 'sa.indeed.com',
  qa: 'qa.indeed.com',
  bh: 'bh.indeed.com',
  om: 'om.indeed.com',
}

/** Country slugs Bayt, NaukriGulf and GulfTalent use in their URLs. */
const GULF_SLUG: Readonly<Record<string, string>> = {
  kw: 'kuwait',
  ae: 'uae',
  sa: 'saudi-arabia',
  qa: 'qatar',
  bh: 'bahrain',
  om: 'oman',
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function q(s: string): string {
  return encodeURIComponent(s)
}

/** The country a playbook's searches use on Gulf boards (its first GCC cover). */
function gulfCountry(p: RegionPlaybook): string | null {
  return p.covers.find((c) => GULF_SLUG[c]) ?? null
}

function urlFor(site: PresetSite, p: RegionPlaybook, query: string): string | null {
  const place = p.searchPlace
  const country = gulfCountry(p)
  switch (site) {
    case 'linkedin':
      return `https://www.linkedin.com/jobs/search/?keywords=${q(query)}&location=${q(place)}`
    case 'indeed': {
      const host = (country && INDEED_HOST[country]) ?? (p.covers.some((c) => isWithin(c, 'in')) ? 'in.indeed.com' : 'www.indeed.com')
      return `https://${host}/jobs?q=${q(query)}&l=${q(place)}`
    }
    case 'bayt':
      return country ? `https://www.bayt.com/en/${GULF_SLUG[country]}/jobs/${slug(query)}-jobs/` : null
    case 'naukrigulf':
      return country ? `https://www.naukrigulf.com/${slug(query)}-jobs-in-${GULF_SLUG[country]}` : null
    case 'gulftalent':
      return country ? `https://www.gulftalent.com/${GULF_SLUG[country]}/jobs/title/${slug(query)}` : null
    case 'naukri':
      return `https://www.naukri.com/${slug(query)}-jobs-in-${slug(place)}`
    case 'glassdoor':
      return `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${q(query)}&locKeyword=${q(place)}`
    case 'instahyre':
      return `https://www.instahyre.com/${slug(query)}-jobs/`
    case 'wellfound':
      return `https://wellfound.com/role/l/software-engineer/${slug(place)}`
  }
}

/** Alert-setup links for a region and a role query ("Laravel developer"). */
export function alertPresets(p: RegionPlaybook, query: string): AlertPreset[] {
  const out: AlertPreset[] = []
  for (const site of p.alertSites) {
    const url = urlFor(site, p, query)
    if (url) out.push({ site, label: `${SITE_LABEL[site]} · ${p.label}`, url, parsed: PARSED.has(site) })
  }
  return out
}

export function presetSiteLabel(site: PresetSite): string {
  return SITE_LABEL[site]
}
