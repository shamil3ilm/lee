import type { MasterCV } from '@/lib/documents/types'
import { deriveMasterCv, type BulletSource } from './derive'
import { checkFactLock } from './fact-lock'
import { newId, type IdFactory } from './ids'
import { parseFluency } from './labels'
import { toResumeDate } from './legacy'
import { presentation } from './readiness'
import { highlightSchema, projectSchema, skillSchema, workSchema, type Highlight, type ResumeProfile, type SkillGroup } from './types'

/**
 * A whole edited MasterCV (CV Score autofix, or any caller of
 * saveMasterCV) written back onto the profile it was derived from.
 *
 * The MasterCV only shows PRESENTED items (lib/resume/derive.ts), so the
 * merge reconciles exactly those and never touches the rest: not-ready
 * projects, highlights and skills survive any MasterCV save. Matched items
 * keep their ids, visibility, readiness and alternates; new ones are `own`.
 */

const lower = (s: string | undefined): string => (s ?? '').trim().toLowerCase()

function httpsUrl(raw: string | undefined): string {
  const v = (raw ?? '').trim()
  if (!v) return ''
  return /^https?:\/\//i.test(v) ? v : `https://${v.replace(/^\/+/, '')}`
}

function rewrite(h: Highlight, wordingId: string | null, text: string): Highlight {
  if (wordingId === null) return { ...h, text }
  if (!checkFactLock(text, h.text).ok) return h
  return { ...h, alternates: h.alternates.map((a) => (a.id === wordingId ? { ...a, text } : a)) }
}

/**
 * Reconcile one item's highlights: `shown[j]` produced bullet j; the edit
 * has `bullets`. Same index → rewrite the source if the text changed;
 * extra bullets → new highlights; missing bullets → their source removed.
 * Highlights that were never shown are kept as they are.
 */
function mergeHighlights(all: readonly Highlight[], shown: readonly BulletSource[], bullets: readonly string[], makeId: IdFactory): Highlight[] {
  const removed = new Set(shown.slice(bullets.length).map((s) => s.highlightId))
  const updates = new Map<string, { wordingId: string | null; text: string }>()
  shown.slice(0, bullets.length).forEach((s, j) => updates.set(s.highlightId, { wordingId: s.wordingId, text: bullets[j]!.trim() }))
  const kept = all
    .filter((h) => !removed.has(h.id))
    .map((h) => {
      const u = updates.get(h.id)
      return u && u.text ? rewrite(h, u.wordingId, u.text) : h
    })
  const added = bullets.slice(shown.length).filter((t) => t.trim()).map((t) => highlightSchema.parse({ id: makeId(), text: t.trim(), depth: 'own' }))
  return [...kept, ...added]
}

function mergeSkills(profile: ResumeProfile, presented: readonly string[], edited: readonly string[], makeId: IdFactory): SkillGroup[] {
  const editedSet = new Set(edited.map(lower))
  const presentedSet = new Set(presented.map(lower))
  const groups = profile.skills.map((g) => ({
    ...g,
    skills: g.skills.filter((s) => !(presentedSet.has(lower(s.name)) && !editedSet.has(lower(s.name)))),
  }))
  const known = new Set(groups.flatMap((g) => g.skills.map((s) => lower(s.name))))
  const added = [...new Set(edited.filter((s) => !known.has(lower(s))))].map((name) => skillSchema.parse({ id: makeId(), name, depth: 'own' }))
  if (added.length === 0) return groups
  const other = groups.find((g) => g.name === 'Other')
  if (other) return groups.map((g) => (g === other ? { ...g, skills: [...g.skills, ...added] } : g))
  return [...groups, { id: makeId(), name: 'Other', level: '', skills: added, visibility: {} }]
}

export function applyMasterCvEdit(profile: ResumeProfile, edited: MasterCV, makeId: IdFactory = () => newId()): ResumeProfile {
  const derived = deriveMasterCv(profile)
  if (!derived) return profile
  const cv = derived.cv

  // Work: every work item is in the derived CV (index i ↔ profile.work[i]).
  const work = edited.experience.map((e) => {
    const i = profile.work.findIndex((w) => lower(w.name) === lower(e.company) && lower(w.position) === lower(e.role))
    const current = i >= 0 ? profile.work[i]! : null
    const base = current ?? workSchema.parse({ id: makeId(), name: e.company, position: e.role })
    return {
      ...base,
      name: e.company,
      position: e.role,
      location: e.location ?? base.location,
      startDate: toResumeDate(e.start) || base.startDate,
      endDate: e.end === 'present' ? '' : toResumeDate(e.end),
      keywords: e.tech ?? base.keywords,
      highlights: mergeHighlights(base.highlights, current ? (derived.sources.experience[i] ?? []) : [], e.bullets, makeId),
    }
  })

  // Projects: only presented ones were in the CV; the rest are kept untouched.
  const presentedNames = new Set((cv.projects ?? []).map((p) => lower(p.name)))
  const hidden = profile.projects.filter((p) => !presentedNames.has(lower(p.name)) || presentation(p) === 'excluded')
  const projects = (edited.projects ?? []).map((ep) => {
    const current = profile.projects.find((p) => lower(p.name) === lower(ep.name) && presentation(p) !== 'excluded')
    const base = current ?? projectSchema.parse({ id: makeId(), name: ep.name, depth: 'own' })
    const shown = (cv.projects ?? []).find((p) => lower(p.name) === lower(ep.name))?.highlights ?? []
    const sources = base.highlights.filter((h) => shown.includes(h.text) || h.alternates.some((a) => shown.includes(a.text)))
    return {
      ...base,
      name: ep.name,
      description: ep.description ? ep.description.slice(0, 200) : base.description,
      url: ep.url ? httpsUrl(ep.url) : base.url,
      keywords: ep.tech ?? base.keywords,
      highlights: mergeHighlights(base.highlights, sources.map((h) => ({ highlightId: h.id, wordingId: null })), ep.highlights ?? [], makeId),
    }
  })

  const b = cv.basics
  const a = edited.basics
  const changed = (x: string | undefined, y: string | undefined): y is string => (x ?? '') !== (y ?? '') && Boolean(y)
  const basics = {
    ...profile.basics,
    ...(changed(b.name, a.name) ? { name: a.name } : {}),
    ...(changed(b.headline, a.headline) ? { label: a.headline } : {}),
    ...(changed(b.email, a.email) ? { email: a.email } : {}),
    ...(changed(b.phone, a.phone) ? { phone: a.phone } : {}),
    ...(changed(b.website, a.website) ? { url: httpsUrl(a.website) } : {}),
    ...(cv.summary !== edited.summary ? { summary: edited.summary.slice(0, 2000) } : {}),
  }

  const byKey = <T extends { id: string }>(list: readonly T[], key: (x: T) => string, k: string): T | undefined => list.find((x) => lower(key(x)) === lower(k))
  return {
    ...profile,
    basics,
    work,
    projects: [...projects, ...hidden],
    skills: mergeSkills(profile, [...cv.skills.primary, ...(cv.skills.secondary ?? [])], [...edited.skills.primary, ...(edited.skills.secondary ?? [])], makeId),
    education: (edited.education ?? []).map((e) => {
      const cur = byKey(profile.education, (x) => x.institution, e.school)
      const sameDegree = cur !== undefined && ([cur.studyType, cur.area].filter(Boolean).join(' in ') || cur.institution) === e.degree
      return {
        id: cur?.id ?? makeId(),
        institution: e.school,
        studyType: sameDegree ? cur.studyType : e.degree,
        area: sameDegree ? cur.area : '',
        url: cur?.url ?? '',
        startDate: toResumeDate(e.start),
        endDate: toResumeDate(e.end),
        score: e.honors ?? '',
        visibility: cur?.visibility ?? {},
      }
    }),
    languages: (edited.languages ?? []).map((l) => {
      const cur = byKey(profile.languages, (x) => x.language, l.name)
      return { id: cur?.id ?? makeId(), language: l.name, fluency: parseFluency(l.proficiency), visibility: cur?.visibility ?? {} }
    }),
    certificates: (edited.certifications ?? []).map((c) => {
      const cur = byKey(profile.certificates, (x) => x.name, c.name)
      return { id: cur?.id ?? makeId(), name: c.name, issuer: c.issuer, date: toResumeDate(c.date), url: httpsUrl(c.url), visibility: cur?.visibility ?? {} }
    }),
  }
}
