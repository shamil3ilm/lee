import { createHash } from 'node:crypto'
import { canonicalJson } from './canonical'
import { fluencyLabel } from '@/lib/resume/labels'
import { isPublic, isPublicItem } from '@/lib/resume/visibility'
import type {
  Highlight,
  ProjectItem,
  ResumeProfile,
  SkillGroup,
  WorkItem,
} from '@/lib/resume/types'

/**
 * Master profile → the portfolio's profile.json: JSON Resume v1.2.1 plus
 * the `meta.x-portfolio` extension (see the portfolio README "lee sync").
 *
 * Only PUBLIC fields are written — whatever the user marks public,
 * regardless of depth / interview readiness. Those flags are private: they
 * steer variants, tailoring and the study list, and are never written or
 * rendered here.
 *
 * Empty optional fields are omitted (an empty string would fail the
 * portfolio's patterns); required ones are always written so the validator
 * names what is missing.
 */

export const JSON_RESUME_SCHEMA_URL = 'https://raw.githubusercontent.com/jsonresume/resume-schema/v1.2.1/schema.json'

export interface PublishMeta {
  version: string
  lastModified: string
}

export type JsonDoc = Record<string, unknown>

/** Copy of `obj` without keys whose value is '' or undefined. */
function compact(obj: Record<string, unknown>): JsonDoc {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v !== undefined))
}

function pub(scope: 'basics' | 'work' | 'projects' | 'education', owner: { visibility: Record<string, 'public' | 'private'> }, field: string, value: string): string | undefined {
  return value && isPublic(scope, owner, field) ? value : undefined
}

function basicsDoc(profile: ResumeProfile): JsonDoc {
  const b = profile.basics
  const loc = b.location
  const location = compact({
    address: pub('basics', b, 'location', loc.address),
    postalCode: pub('basics', b, 'location', loc.postalCode),
    city: pub('basics', b, 'location', loc.city),
    countryCode: pub('basics', b, 'countryCode', loc.countryCode),
    region: pub('basics', b, 'location', loc.region),
  })
  return compact({
    name: isPublic('basics', b, 'name') ? b.name : undefined,
    label: isPublic('basics', b, 'label') ? b.label : undefined,
    image: pub('basics', b, 'image', b.image),
    email: isPublic('basics', b, 'email') ? b.email : undefined,
    phone: pub('basics', b, 'phone', b.phone),
    url: isPublic('basics', b, 'url') ? b.url : undefined,
    summary: isPublic('basics', b, 'summary') ? b.summary : undefined,
    location: Object.keys(location).length > 0 ? location : undefined,
    profiles: b.profiles
      .filter((p) => isPublicItem('profiles', p))
      .map((p) => compact({ network: p.network, username: p.username, url: p.url })),
  })
}

/** Highlights that leave lee (public). */
export function exportedHighlights(list: readonly Highlight[]): Highlight[] {
  return list.filter((h) => isPublicItem('highlight', h))
}

function workDoc(w: WorkItem): JsonDoc {
  return compact({
    name: w.name,
    location: pub('work', w, 'location', w.location),
    description: pub('work', w, 'description', w.description),
    position: w.position,
    url: pub('work', w, 'url', w.url),
    startDate: w.startDate,
    endDate: w.endDate,
    summary: pub('work', w, 'summary', w.summary),
    highlights: exportedHighlights(w.highlights).map((h) => h.text),
  })
}

function projectDoc(p: ProjectItem): JsonDoc {
  return compact({
    name: p.name,
    description: p.description,
    highlights: exportedHighlights(p.highlights).map((h) => h.text),
    keywords: p.keywords,
    startDate: p.startDate,
    endDate: p.endDate,
    url: pub('projects', p, 'url', p.url),
  })
}

function skillDocs(profile: ResumeProfile): Array<{ group: SkillGroup; doc: JsonDoc }> {
  return profile.skills
    .filter((g) => isPublicItem('skills', g))
    .map((group) => ({
      group,
      doc: compact({ name: group.name, level: group.level, keywords: group.skills.map((s) => s.name) }),
    }))
}

function caseStudyDocs(profile: ResumeProfile, work: readonly WorkItem[]): JsonDoc[] {
  return profile.portfolio.caseStudies.flatMap((cs) => {
    const job = work.find((w) => w.id === cs.workId)
    if (!job) return []
    const index = exportedHighlights(job.highlights).findIndex((h) => h.id === cs.highlightId)
    if (index < 0) return []
    return [{ id: cs.id, title: cs.title, url: cs.url, work: job.name, highlight: index }]
  })
}

function quickViewDoc(profile: ResumeProfile): JsonDoc {
  const q = profile.portfolio.quickView
  return {
    role: q.role,
    line: q.line,
    results: q.results.map((r) =>
      compact({
        lead: r.lead,
        text: r.text,
        link: r.link
          ? compact({ label: r.link.label, href: r.link.href, closesDialog: r.link.closesDialog })
          : undefined,
      }),
    ),
    skills: q.skills,
  }
}

/** The file lee would write, for the given publish metadata. */
export function toJsonResume(profile: ResumeProfile, meta: PublishMeta): JsonDoc {
  const work = profile.work.filter((w) => isPublicItem('work', w))
  const projects = profile.projects.filter((p) => isPublicItem('projects', p))
  const skills = skillDocs(profile)
  const education = profile.education.filter((e) => isPublicItem('education', e))
  const languages = profile.languages.filter((l) => isPublicItem('languages', l))
  const certificates = profile.certificates.filter((c) => isPublicItem('certificates', c))

  const doc: JsonDoc = {
    $schema: JSON_RESUME_SCHEMA_URL,
    basics: basicsDoc(profile),
    work: work.map(workDoc),
    projects: projects.map(projectDoc),
    skills: skills.map((s) => s.doc),
    education: education.map((e) =>
      compact({
        institution: e.institution,
        url: pub('education', e, 'url', e.url),
        area: e.area,
        studyType: e.studyType,
        startDate: e.startDate,
        endDate: e.endDate,
        score: pub('education', e, 'score', e.score),
      }),
    ),
    ...(languages.length > 0
      ? { languages: languages.map((l) => ({ language: l.language, fluency: fluencyLabel(l.fluency) })) }
      : {}),
    ...(certificates.length > 0
      ? { certificates: certificates.map((c) => compact({ name: c.name, date: c.date, issuer: c.issuer, url: c.url })) }
      : {}),
    ...profile.portfolio.extra,
    meta: {
      canonical: profile.portfolio.canonical,
      version: meta.version,
      lastModified: meta.lastModified,
      'x-portfolio': {
        schemaVersion: 1,
        displayName: profile.portfolio.displayName || profile.basics.name,
        order: {
          work: work.map((w) => w.name),
          projects: projects.map((p) => p.name),
          skills: skills.map((s) => s.group.name),
          education: education.map((e) => e.institution),
        },
        caseStudies: caseStudyDocs(profile, work),
        quickView: quickViewDoc(profile),
      },
    },
  }
  return doc
}

// ---------------------------------------------------------------------------
// Publish metadata
// ---------------------------------------------------------------------------

/** "v1.0.0" → "v1.0.1"; anything unparseable (or nothing) → "1.0.0". */
export function nextVersion(previous: string | null | undefined): string {
  const m = /^(v?)(\d+)\.(\d+)\.(\d+)$/.exec(previous ?? '')
  if (!m) return '1.0.0'
  return `${m[1]}${m[2]}.${m[3]}.${Number(m[4]) + 1}`
}

/** ISO 8601 without milliseconds, e.g. 2026-09-27T08:05:03Z (portfolio pattern). */
export function formatLastModified(now: Date): string {
  return now.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** Content hash ignoring meta.version and meta.lastModified (they change every publish). */
export function contentHash(doc: JsonDoc): string {
  const meta = (doc.meta ?? {}) as JsonDoc
  const { version: _v, lastModified: _l, ...restMeta } = meta
  void _v
  void _l
  return createHash('sha256').update(canonicalJson({ ...doc, meta: restMeta })).digest('hex')
}

/** The file body lee commits: 2-space JSON and a trailing newline. */
export function serializeProfileJson(doc: JsonDoc): string {
  return `${JSON.stringify(doc, null, 2)}\n`
}
