import { newId, type IdFactory } from '@/lib/resume/ids'
import { parseFluency } from '@/lib/resume/labels'
import { isPublic, isPublicItem } from '@/lib/resume/visibility'
import {
  highlightSchema,
  skillSchema,
  type Basics,
  type Highlight,
  type ResumeProfile,
  type Visibility,
} from '@/lib/resume/types'
import type { DiffSection } from './diff'

/**
 * "Take the repo's version" of a section: write the repo's public content
 * into the master profile, so lee stays the one source and the next
 * publish reproduces the repo. Matching items keep their ids, flags,
 * alternates and readiness (work/projects/skills by name, education by
 * institution, highlights by text); lee's PRIVATE items are kept — the
 * repo never had them. New items are `own` (the user wrote them by hand).
 */

type Doc = Record<string, unknown>
type Item = Record<string, unknown>

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const items = (v: unknown): Item[] =>
  Array.isArray(v) ? v.filter((x): x is Item => typeof x === 'object' && x !== null && !Array.isArray(x)) : []

/**
 * Repo highlight texts → highlights. Same text → that highlight; otherwise
 * the public highlight at the same position (an edited bullet keeps its id,
 * so case studies and variants still point at it); otherwise a new one.
 */
function mergeHighlights(existing: readonly Highlight[], texts: readonly string[], makeId: IdFactory): Highlight[] {
  const publicOnes = existing.filter((h) => isPublicItem('highlight', h))
  const used = new Set<string>()
  const exact = texts.map((text) => publicOnes.find((h) => h.text === text && !used.has(h.id) && used.add(h.id)))
  const kept = texts.map((text, i) => {
    const same = exact[i]
    if (same) return same
    const atIndex = publicOnes[i]
    if (atIndex && !used.has(atIndex.id)) {
      used.add(atIndex.id)
      return { ...atIndex, text }
    }
    return highlightSchema.parse({ id: makeId(), text, depth: 'own' })
  })
  return [...kept, ...existing.filter((h) => !isPublicItem('highlight', h))]
}

/** Case studies whose work item or highlight disappeared are dropped. */
function pruneCaseStudies(p: ResumeProfile): ResumeProfile {
  const caseStudies = p.portfolio.caseStudies.filter((cs) =>
    p.work.some((w) => w.id === cs.workId && w.highlights.some((h) => h.id === cs.highlightId)),
  )
  return caseStudies.length === p.portfolio.caseStudies.length ? p : { ...p, portfolio: { ...p.portfolio, caseStudies } }
}

function basicsFrom(current: Basics, repo: Item, makeId: IdFactory): Basics {
  const vis: Record<string, Visibility> = { ...current.visibility }
  const take = (field: keyof Basics & string, value: unknown): string => {
    if (typeof value === 'string' && value) {
      vis[field] = 'public'
      return value
    }
    // Not in the repo: keep lee's value but stop publishing it.
    if (isPublic('basics', current, field)) vis[field] = 'private'
    return current[field] as string
  }
  const loc = typeof repo.location === 'object' && repo.location !== null ? (repo.location as Item) : {}
  const repoProfiles = items(repo.profiles)
  const profiles = [
    ...repoProfiles.map((p) => {
      const match = current.profiles.find((c) => c.network.toLowerCase() === str(p.network).toLowerCase())
      return { id: match?.id ?? makeId(), network: str(p.network), username: str(p.username), url: str(p.url), visibility: {} }
    }),
    ...current.profiles.filter((c) => !isPublicItem('profiles', c)),
  ]
  const hasDetail = ['address', 'postalCode', 'city', 'region'].some((k) => str(loc[k]))
  const next: Basics = {
    ...current,
    name: take('name', repo.name),
    label: take('label', repo.label),
    email: take('email', repo.email),
    url: take('url', repo.url),
    summary: take('summary', repo.summary),
    image: take('image', repo.image),
    phone: take('phone', repo.phone),
    location: hasDetail || str(loc.countryCode)
      ? {
          address: str(loc.address) || current.location.address,
          postalCode: str(loc.postalCode) || current.location.postalCode,
          city: str(loc.city) || current.location.city,
          region: str(loc.region) || current.location.region,
          countryCode: str(loc.countryCode) || current.location.countryCode,
        }
      : current.location,
    profiles,
  }
  vis.location = hasDetail ? 'public' : 'private'
  vis.countryCode = str(loc.countryCode) ? 'public' : 'private'
  return { ...next, visibility: vis }
}

function byKey<T extends { visibility: Record<string, Visibility> }>(
  list: readonly T[],
  key: (x: T) => string,
  scope: Parameters<typeof isPublicItem>[0],
): { find: (k: string) => T | undefined; privateOnes: T[] } {
  return {
    find: (k) => list.find((x) => key(x).toLowerCase() === k.toLowerCase()),
    privateOnes: list.filter((x) => !isPublicItem(scope, x)),
  }
}

function applySection(p: ResumeProfile, repo: Doc, section: DiffSection, makeId: IdFactory): ResumeProfile {
  switch (section) {
    case 'basics':
      return { ...p, basics: basicsFrom(p.basics, (repo.basics ?? {}) as Item, makeId) }
    case 'work': {
      const m = byKey(p.work, (w) => w.name, 'work')
      const work = items(repo.work).map((r) => {
        const cur = m.find(str(r.name))
        return {
          id: cur?.id ?? makeId(),
          name: str(r.name),
          position: str(r.position),
          location: str(r.location),
          url: str(r.url),
          description: str(r.description),
          startDate: str(r.startDate),
          endDate: str(r.endDate),
          summary: str(r.summary),
          keywords: cur?.keywords ?? [],
          highlights: mergeHighlights(cur?.highlights ?? [], strs(r.highlights), makeId),
          visibility: { ...(cur?.visibility ?? {}), _item: 'public' as const },
        }
      })
      return { ...p, work: [...work, ...m.privateOnes] }
    }
    case 'projects': {
      const m = byKey(p.projects, (x) => x.name, 'projects')
      const projects = items(repo.projects).map((r) => {
        const cur = m.find(str(r.name))
        return {
          ...(cur ?? { depth: 'own' as const, interviewReady: true, domainReady: true, ownedAspects: '', studyNotes: '', studyTarget: '' }),
          id: cur?.id ?? makeId(),
          name: str(r.name),
          description: str(r.description),
          url: str(r.url),
          startDate: str(r.startDate),
          endDate: str(r.endDate),
          keywords: strs(r.keywords),
          highlights: mergeHighlights(cur?.highlights ?? [], strs(r.highlights), makeId),
          visibility: { ...(cur?.visibility ?? {}), _item: 'public' as const },
        }
      })
      return { ...p, projects: [...projects, ...m.privateOnes] }
    }
    case 'skills': {
      const m = byKey(p.skills, (g) => g.name, 'skills')
      const skills = items(repo.skills).map((r) => {
        const cur = m.find(str(r.name))
        return {
          id: cur?.id ?? makeId(),
          name: str(r.name),
          level: str(r.level),
          skills: strs(r.keywords).map(
            (name) => cur?.skills.find((s) => s.name.toLowerCase() === name.toLowerCase()) ?? skillSchema.parse({ id: makeId(), name, depth: 'own' }),
          ),
          visibility: { ...(cur?.visibility ?? {}), _item: 'public' as const },
        }
      })
      return { ...p, skills: [...skills, ...m.privateOnes] }
    }
    case 'education': {
      const m = byKey(p.education, (e) => e.institution, 'education')
      const education = items(repo.education).map((r) => {
        const cur = m.find(str(r.institution))
        return {
          id: cur?.id ?? makeId(),
          institution: str(r.institution),
          area: str(r.area),
          studyType: str(r.studyType),
          url: str(r.url),
          startDate: str(r.startDate),
          endDate: str(r.endDate),
          score: str(r.score),
          visibility: { ...(cur?.visibility ?? {}), _item: 'public' as const },
        }
      })
      return { ...p, education: [...education, ...m.privateOnes] }
    }
    case 'languages': {
      const m = byKey(p.languages, (l) => l.language, 'languages')
      const languages = items(repo.languages).map((r) => ({
        id: m.find(str(r.language))?.id ?? makeId(),
        language: str(r.language),
        fluency: parseFluency(str(r.fluency)),
        visibility: { _item: 'public' as const },
      }))
      return { ...p, languages: [...languages, ...m.privateOnes] }
    }
    case 'certificates': {
      const m = byKey(p.certificates, (c) => c.name, 'certificates')
      const certificates = items(repo.certificates).map((r) => ({
        id: m.find(str(r.name))?.id ?? makeId(),
        name: str(r.name),
        issuer: str(r.issuer),
        date: str(r.date),
        url: str(r.url),
        visibility: { _item: 'public' as const },
      }))
      return { ...p, certificates: [...certificates, ...m.privateOnes] }
    }
    case 'portfolio':
      return { ...p, portfolio: portfolioFrom(p, repo, makeId) }
    case 'other': {
      const known = new Set(['$schema', 'basics', 'work', 'projects', 'skills', 'education', 'languages', 'certificates', 'meta'])
      const extra = Object.fromEntries(Object.entries(repo).filter(([k]) => !known.has(k)))
      return { ...p, portfolio: { ...p.portfolio, extra } }
    }
  }
}

function portfolioFrom(p: ResumeProfile, repo: Doc, makeId: IdFactory): ResumeProfile['portfolio'] {
  const meta = (repo.meta ?? {}) as Item
  const x = (meta['x-portfolio'] ?? {}) as Item
  const q = (x.quickView ?? {}) as Item
  const caseStudies = items(x.caseStudies).flatMap((cs) => {
    const job = p.work.find((w) => w.name === str(cs.work))
    const index = typeof cs.highlight === 'number' ? cs.highlight : -1
    const h = job?.highlights.filter((x) => isPublicItem('highlight', x))[index]
    return job && h ? [{ id: str(cs.id), title: str(cs.title), url: str(cs.url), workId: job.id, highlightId: h.id }] : []
  })
  return {
    ...p.portfolio,
    canonical: str(meta.canonical),
    displayName: str(x.displayName),
    caseStudies,
    quickView: {
      role: str(q.role),
      line: str(q.line),
      results: items(q.results).map((r) => {
        const link = typeof r.link === 'object' && r.link !== null ? (r.link as Item) : null
        return {
          id: makeId(),
          lead: str(r.lead),
          text: str(r.text),
          link: link
            ? { label: str(link.label), href: str(link.href), ...(typeof link.closesDialog === 'boolean' ? { closesDialog: link.closesDialog } : {}) }
            : null,
        }
      }),
      skills: strs(q.skills),
    },
  }
}

/** Order matters: work before portfolio, so case studies resolve against the repo's work. */
const APPLY_ORDER: readonly DiffSection[] = ['basics', 'work', 'projects', 'skills', 'education', 'languages', 'certificates', 'other', 'portfolio']

export function applyRepoSections(
  profile: ResumeProfile,
  repo: Doc,
  sections: readonly DiffSection[],
  makeId: IdFactory = () => newId(),
): ResumeProfile {
  return pruneCaseStudies(
    APPLY_ORDER.filter((s) => sections.includes(s)).reduce((p, s) => applySection(p, repo, s, makeId), profile),
  )
}
