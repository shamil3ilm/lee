import { z } from 'zod'
import { readTable } from './csv'

/**
 * Client-safe, pure. LinkedIn "Get a copy of your data" (Basic or
 * Complete) → the parts lee uses. Runs in the browser on the unzipped CSV
 * texts; the raw archive never leaves the device. Every file is optional:
 * the Basic archive arrives first and Connections.csv later
 * (https://www.linkedin.com/help/linkedin/answer/a1339364).
 *
 * Headers are matched case-insensitively and the header row is searched
 * (Connections.csv starts with "Notes:" lines). Dates come as "Jan 2020",
 * "2020", "15 Jan 2020" or "1/15/20"; an empty end date means "present".
 */

export const MAX_CONNECTIONS = 30_000
const MAX_ITEMS = 40
const MAX_SKILLS = 150

const cap = (s: string | undefined, n: number): string => (s ?? '').trim().slice(0, n)

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** "Jan 2020" → "2020-01", "2020" → "2020", "15 Jan 2020" → "2020-01-15", "1/15/20" → "2020-01-15"; else "". */
export function linkedinDate(raw: string | undefined): string {
  const v = (raw ?? '').trim()
  if (!v) return ''
  let m = /^(\d{4})$/.exec(v)
  if (m) return m[1]!
  m = /^([A-Za-z]{3})[a-z]*\.? (\d{4})$/.exec(v)
  if (m) {
    const mo = MONTHS.indexOf(m[1]!.toLowerCase())
    return mo >= 0 ? `${m[2]}-${String(mo + 1).padStart(2, '0')}` : ''
  }
  m = /^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4})$/.exec(v)
  if (m) {
    const mo = MONTHS.indexOf(m[2]!.toLowerCase())
    return mo >= 0 ? `${m[3]}-${String(mo + 1).padStart(2, '0')}-${m[1]!.padStart(2, '0')}` : ''
  }
  m = /^([A-Za-z]{3})[a-z]* (\d{1,2}),? (\d{4})$/.exec(v)
  if (m) {
    const mo = MONTHS.indexOf(m[1]!.toLowerCase())
    return mo >= 0 ? `${m[3]}-${String(mo + 1).padStart(2, '0')}-${m[2]!.padStart(2, '0')}` : ''
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(v)
  if (m) {
    const year = m[3]!.length === 2 ? `20${m[3]}` : m[3]!
    return `${year}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`
  }
  m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(v)
  if (m) return v
  return ''
}

const positionSchema = z.object({
  company: z.string().max(200),
  title: z.string().max(200),
  description: z.string().max(2000),
  location: z.string().max(200),
  startDate: z.string().max(10),
  endDate: z.string().max(10),
})
const educationSchema = z.object({
  school: z.string().max(200),
  degree: z.string().max(200),
  notes: z.string().max(500),
  startDate: z.string().max(10),
  endDate: z.string().max(10),
})
const certificationSchema = z.object({ name: z.string().max(200), authority: z.string().max(200), url: z.string().max(500), date: z.string().max(10) })
const projectSchema = z.object({ title: z.string().max(200), description: z.string().max(2000), url: z.string().max(500), startDate: z.string().max(10), endDate: z.string().max(10) })
const languageSchema = z.object({ name: z.string().max(60), proficiency: z.string().max(100) })
const connectionSchema = z.object({
  firstName: z.string().max(100),
  lastName: z.string().max(100),
  company: z.string().max(200),
  position: z.string().max(200),
  connectedOn: z.string().max(10),
  email: z.string().max(254),
})

export const linkedinExportSchema = z.object({
  profile: z
    .object({ firstName: z.string().max(100), lastName: z.string().max(100), headline: z.string().max(300), summary: z.string().max(3000), location: z.string().max(200) })
    .nullable(),
  positions: z.array(positionSchema).max(MAX_ITEMS),
  education: z.array(educationSchema).max(MAX_ITEMS),
  skills: z.array(z.string().max(200)).max(MAX_SKILLS),
  certifications: z.array(certificationSchema).max(MAX_ITEMS),
  projects: z.array(projectSchema).max(MAX_ITEMS),
  languages: z.array(languageSchema).max(20),
  connections: z.array(connectionSchema).max(MAX_CONNECTIONS),
  found: z.array(z.string().max(60)).max(20),
})
export type LinkedInExport = z.infer<typeof linkedinExportSchema>
export type LinkedInPosition = z.infer<typeof positionSchema>
export type LinkedInConnectionRow = z.infer<typeof connectionSchema>

/** The CSVs lee reads, by lower-case file name (anywhere in the archive). */
export const EXPORT_FILES = ['profile.csv', 'positions.csv', 'education.csv', 'skills.csv', 'certifications.csv', 'projects.csv', 'languages.csv', 'connections.csv'] as const

export function exportFileKey(path: string): string | null {
  const base = path.split('/').pop()?.toLowerCase() ?? ''
  return (EXPORT_FILES as readonly string[]).includes(base) ? base : null
}

/** Parse the CSV texts (keyed by lower-case file name). Missing files → empty sections. */
export function parseLinkedInExport(files: Readonly<Record<string, string>>): LinkedInExport {
  const t = (name: string, required: readonly string[]) => (files[name] ? (readTable(files[name]!, required) ?? []) : [])
  const profileRow = t('profile.csv', ['first name', 'last name'])[0]
  const out: LinkedInExport = {
    profile: profileRow
      ? {
          firstName: cap(profileRow['first name'], 100),
          lastName: cap(profileRow['last name'], 100),
          headline: cap(profileRow.headline, 300),
          summary: cap(profileRow.summary, 3000),
          location: cap(profileRow['geo location'] ?? profileRow.location, 200),
        }
      : null,
    positions: t('positions.csv', ['company name', 'title'])
      .filter((r) => r['company name'] && r.title)
      .slice(0, MAX_ITEMS)
      .map((r) => ({
        company: cap(r['company name'], 200),
        title: cap(r.title, 200),
        description: cap(r.description, 2000),
        location: cap(r.location, 200),
        startDate: linkedinDate(r['started on']),
        endDate: linkedinDate(r['finished on']),
      })),
    education: t('education.csv', ['school name'])
      .filter((r) => r['school name'])
      .slice(0, MAX_ITEMS)
      .map((r) => ({
        school: cap(r['school name'], 200),
        degree: cap(r['degree name'], 200),
        notes: cap(r.notes, 500),
        startDate: linkedinDate(r['start date']),
        endDate: linkedinDate(r['end date']),
      })),
    skills: [...new Set(t('skills.csv', ['name']).map((r) => cap(r.name, 200)).filter(Boolean))].slice(0, MAX_SKILLS),
    certifications: t('certifications.csv', ['name'])
      .filter((r) => r.name)
      .slice(0, MAX_ITEMS)
      .map((r) => ({ name: cap(r.name, 200), authority: cap(r.authority, 200), url: cap(r.url, 500), date: linkedinDate(r['started on']) })),
    projects: t('projects.csv', ['title'])
      .filter((r) => r.title)
      .slice(0, MAX_ITEMS)
      .map((r) => ({
        title: cap(r.title, 200),
        description: cap(r.description, 2000),
        url: cap(r.url, 500),
        startDate: linkedinDate(r['started on']),
        endDate: linkedinDate(r['finished on']),
      })),
    languages: t('languages.csv', ['name'])
      .filter((r) => r.name)
      .slice(0, 20)
      .map((r) => ({ name: cap(r.name, 60), proficiency: cap(r.proficiency, 100) })),
    connections: t('connections.csv', ['first name', 'last name'])
      .filter((r) => r['first name'] || r['last name'])
      .slice(0, MAX_CONNECTIONS)
      .map((r) => ({
        firstName: cap(r['first name'], 100),
        lastName: cap(r['last name'], 100),
        company: cap(r.company, 200),
        position: cap(r.position, 200),
        connectedOn: linkedinDate(r['connected on']),
        email: cap(r['email address'], 254),
      })),
    found: Object.keys(files).filter((k) => (EXPORT_FILES as readonly string[]).includes(k)),
  }
  return out
}
