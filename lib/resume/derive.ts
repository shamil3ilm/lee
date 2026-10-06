import { masterCvSchema, type MasterCV } from '@/lib/documents/types'
import { fluencyLabel } from './labels'
import { backedSkillIds, presentation, resolveHighlight } from './readiness'
import { checkDomainWording } from './fact-lock'
import type { Highlight, ResumeProfile } from './types'

/**
 * Master profile → MasterCV, the shape every existing consumer reads
 * (tailoring, cover letters, outreach, prep, CV Score, LaTeX, PDF). The
 * direction is ONE-WAY: the profile is the source of facts and the
 * `master_cv` document is a derived snapshot written on every profile save.
 *
 * Only what may be presented goes in (lib/resume/readiness.ts): fully
 * ready items, and domain-ready items in their design/domain wording
 * without stack keywords. So no AI prompt built from a MasterCV can pick a
 * not-ready item, and role suggestions ignore evidence from them.
 * Visibility is NOT applied: it governs the public portfolio, while a CV
 * sent to an employer carries the phone number etc.
 */

/** Where each derived bullet came from, so CV edits can flow back (lib/resume/legacy.ts). */
export interface BulletSource {
  highlightId: string
  /** The alternate wording shown; null = the master text. */
  wordingId: string | null
}

export interface DerivedCv {
  cv: MasterCV
  /** experience[i].bullets[j] ← sources.experience[i][j] */
  sources: { experience: BulletSource[][] }
}

const MAX_PRIMARY_SKILLS = 12

function networkUrl(profile: ResumeProfile, network: string): string | undefined {
  const hit = profile.basics.profiles.find((p) => p.network.toLowerCase() === network)
  return hit?.url || undefined
}

function locationLine(profile: ResumeProfile): string | undefined {
  const l = profile.basics.location
  const parts = [l.city, l.region, l.countryCode].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : undefined
}

function presentable(highlights: readonly Highlight[]): Array<{ text: string; source: BulletSource }> {
  return highlights.flatMap((h) => {
    const r = resolveHighlight(h, null)
    return r ? [{ text: r.text, source: { highlightId: h.id, wordingId: r.wordingId } }] : []
  })
}

/**
 * The first skill group is "primary", every other group "secondary" (a
 * migrated CV keeps its exact split; autofix additions land in "Other").
 * Only backed skills (lib/resume/readiness.ts).
 */
function skillsOf(profile: ResumeProfile): MasterCV['skills'] {
  const backed = backedSkillIds(profile)
  const names = (groups: ResumeProfile['skills']) => groups.flatMap((g) => g.skills.filter((s) => backed.has(s.id)).map((s) => s.name))
  const dedupe = (list: string[], seen: Set<string>) =>
    list.filter((n) => {
      const k = n.toLowerCase()
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  const seen = new Set<string>()
  const primary = dedupe(names(profile.skills.slice(0, 1)), seen)
  const secondary = dedupe(names(profile.skills.slice(1)), seen)
  // Nothing backed in the first group: promote, so `primary` is never empty when skills exist.
  if (primary.length === 0) return { primary: secondary.slice(0, MAX_PRIMARY_SKILLS), ...(secondary.length > MAX_PRIMARY_SKILLS ? { secondary: secondary.slice(MAX_PRIMARY_SKILLS) } : {}) }
  return { primary, ...(secondary.length > 0 ? { secondary } : {}) }
}

/** Derive the MasterCV (null until the profile has a name and a headline). */
export function deriveMasterCv(profile: ResumeProfile): DerivedCv | null {
  const b = profile.basics
  if (!b.name.trim() || !b.label.trim()) return null
  const experience = profile.work.map((w) => {
    const bullets = presentable(w.highlights)
    const fullyReady = w.highlights.some((h) => h.interviewReady)
    return {
      entry: {
        company: w.name,
        role: w.position,
        location: w.location || undefined,
        start: w.startDate || 'unknown',
        end: w.endDate || ('present' as const),
        bullets: bullets.map((x) => x.text),
        // Stack keywords claim hands-on work: only with a fully ready highlight.
        tech: fullyReady && w.keywords.length > 0 ? w.keywords : undefined,
      },
      sources: bullets.map((x) => x.source),
    }
  })
  const projects = profile.projects.flatMap((p) => {
    const mode = presentation(p)
    if (mode === 'excluded' || mode === 'override') return []
    const full = mode === 'full'
    return [
      {
        name: p.name,
        url: p.url || undefined,
        description: full || checkDomainWording(p.description).ok ? p.description : '',
        tech: full && p.keywords.length > 0 ? p.keywords : undefined,
        highlights: presentable(p.highlights).map((x) => x.text),
      },
    ]
  })
  const cv: MasterCV = masterCvSchema.parse({
    basics: {
      name: b.name,
      headline: b.label,
      email: b.email || undefined,
      phone: b.phone || undefined,
      location: locationLine(profile),
      linkedin: networkUrl(profile, 'linkedin'),
      github: networkUrl(profile, 'github'),
      website: b.url || undefined,
    },
    summary: b.summary,
    experience: experience.map((e) => e.entry),
    projects,
    education: profile.education.map((e) => ({
      school: e.institution,
      degree: [e.studyType, e.area].filter(Boolean).join(' in ') || e.institution,
      start: e.startDate || undefined,
      end: e.endDate || undefined,
      honors: e.score || undefined,
    })),
    skills: skillsOf(profile),
    certifications: profile.certificates.map((c) => ({
      name: c.name,
      issuer: c.issuer || c.name,
      date: c.date || undefined,
      url: c.url || undefined,
    })),
    languages: profile.languages.map((l) => ({ name: l.language, proficiency: fluencyLabel(l.fluency) })),
  })
  return { cv, sources: { experience: experience.map((e) => e.sources) } }
}

export function toMasterCv(profile: ResumeProfile): MasterCV | null {
  return deriveMasterCv(profile)?.cv ?? null
}
