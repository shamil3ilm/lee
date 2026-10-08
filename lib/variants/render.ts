import { checkDomainWording, checkFactLock } from '@/lib/resume/fact-lock'
import { fluencyLabel } from '@/lib/resume/labels'
import {
  backedSkillIds,
  canOverride,
  NEEDS_DOMAIN_WORDING,
  OVERRIDE_WARNING,
  presentation,
  resolveHighlight,
  type Presentation,
} from '@/lib/resume/readiness'
import type { Highlight, ResumeProfile } from '@/lib/resume/types'
import { fieldOn } from './presets'
import { SECTION_LABELS, type ItemPick, type Recipe, type RegionField, type SectionKey } from './types'

/**
 * Recipe + current master profile → the résumé to print. Facts always come
 * from the master; the recipe only selects, orders and picks wordings.
 * Every rule is enforced here, at render time, against the CURRENT master:
 *   - missing ids (deleted from the master) are skipped and reported;
 *   - not-ready items are left out unless overridden (ai_assisted only),
 *     domain-ready items appear only in design/domain wording;
 *   - a chosen wording is used only while it passes the fact lock;
 *   - numbers in the headline/summary must appear in the master (flagged);
 *   - region fields respect the region's locks (no photo for Remote, …).
 */

export interface Bullet {
  text: string
  mode: Exclude<Presentation, 'excluded'>
}

export interface RenderedEntry {
  id: string
  title: string
  subtitle: string
  location: string
  dates: string
  /** Project stack (fully presented projects only). */
  keywords: string[]
  bullets: Bullet[]
}

export interface RenderedSection {
  key: SectionKey
  label: string
  entries: RenderedEntry[]
  /** For skills / languages / certificates / summary: plain lines. */
  lines: string[]
}

export interface ContactLine {
  field: RegionField | 'email' | 'url' | 'profile'
  label: string
  value: string
}

export type WarningKind = 'missing' | 'excluded' | 'override' | 'domain' | 'stale' | 'numbers' | 'region' | 'length'

export interface RenderWarning {
  kind: WarningKind
  message: string
}

export interface RenderedResume {
  name: string
  headline: string
  contact: ContactLine[]
  sections: RenderedSection[]
  warnings: RenderWarning[]
  /** Rough page estimate for the length target. */
  estimatedPages: number
  template: Recipe['template']
  /** Place the profile photo: the Photo field is on, the region allows it and a photo exists. */
  photo: boolean
}

export interface RenderOptions {
  /** Whether a profile photo is uploaded; undefined = unknown (no photo warning). */
  hasPhoto?: boolean
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2021-04" → "Apr 2021" (US style); "" → "". */
export function formatMonth(date: string): string {
  const m = /^(\d{4})(?:-(\d{2}))?/.exec(date)
  if (!m) return ''
  const month = m[2] ? MONTHS[Number(m[2]) - 1] : undefined
  return month ? `${month} ${m[1]}` : m[1]!
}

export function dateRange(start: string, end: string, openEnded = true): string {
  const s = formatMonth(start)
  const e = end ? formatMonth(end) : openEnded ? 'Present' : ''
  return [s, e].filter(Boolean).join(' – ')
}

interface Ctx {
  profile: ResumeProfile
  recipe: Recipe
  warnings: RenderWarning[]
  overrides: Set<string>
}

function bulletsFor(ctx: Ctx, owner: string, list: readonly Highlight[], picks: ItemPick['highlights'], parentOverridden: boolean): Bullet[] {
  return picks.flatMap((pick) => {
    const h = list.find((x) => x.id === pick.id)
    if (!h) {
      ctx.warnings.push({ kind: 'missing', message: `A highlight of ${owner} was removed from your profile.` })
      return []
    }
    const overridden = parentOverridden || ctx.overrides.has(h.id)
    const r = resolveHighlight(h, pick.wordingId, overridden)
    if (!r) {
      const domainOnly = presentation(h, overridden) === 'domain'
      ctx.warnings.push(
        domainOnly
          ? { kind: 'domain', message: `${owner}: "${short(h.text)}" — ${NEEDS_DOMAIN_WORDING}` }
          : { kind: 'excluded', message: `${owner}: "${short(h.text)}" is not interview-ready and was left out.` },
      )
      return []
    }
    if (r.stale) ctx.warnings.push({ kind: 'stale', message: `${owner}: a chosen wording no longer matches the facts; using "${short(r.text)}".` })
    if (r.mode === 'override') ctx.warnings.push({ kind: 'override', message: `${owner}: "${short(r.text)}" — ${OVERRIDE_WARNING}` })
    return [{ text: r.text, mode: r.mode }]
  })
}

function short(text: string): string {
  return text.length > 60 ? `${text.slice(0, 57)}…` : text
}

function workSection(ctx: Ctx): RenderedEntry[] {
  return ctx.recipe.work.flatMap((pick) => {
    const w = ctx.profile.work.find((x) => x.id === pick.id)
    if (!w) {
      ctx.warnings.push({ kind: 'missing', message: 'A job in this variant was removed from your profile.' })
      return []
    }
    return [
      {
        id: w.id,
        title: w.position,
        subtitle: w.name,
        location: w.location,
        dates: dateRange(w.startDate, w.endDate),
        keywords: [],
        bullets: bulletsFor(ctx, w.name, w.highlights, pick.highlights, false),
      },
    ]
  })
}

function projectsSection(ctx: Ctx): RenderedEntry[] {
  return ctx.recipe.projects.flatMap((pick) => {
    const p = ctx.profile.projects.find((x) => x.id === pick.id)
    if (!p) {
      ctx.warnings.push({ kind: 'missing', message: 'A project in this variant was removed from your profile.' })
      return []
    }
    const overridden = ctx.overrides.has(p.id)
    const mode = presentation(p, overridden)
    if (mode === 'excluded') {
      ctx.warnings.push({ kind: 'excluded', message: `Project "${p.name}" is not interview-ready and was left out.` })
      return []
    }
    if (mode === 'override') ctx.warnings.push({ kind: 'override', message: `Project "${p.name}" — ${OVERRIDE_WARNING}` })
    const full = mode !== 'domain'
    return [
      {
        id: p.id,
        title: p.name,
        subtitle: full || checkDomainWording(p.description).ok ? p.description : '',
        location: '',
        dates: p.startDate ? dateRange(p.startDate, p.endDate, false) : '',
        // A domain-only project never lists the stack: that claims the code.
        keywords: full ? p.keywords : [],
        bullets: bulletsFor(ctx, p.name, p.highlights, pick.highlights, mode === 'override'),
      },
    ]
  })
}

function skillLines(ctx: Ctx): string[] {
  const backed = backedSkillIds(ctx.profile)
  const all = ctx.profile.skills.flatMap((g) => g.skills)
  const names = ctx.recipe.skills.flatMap((id) => {
    const s = all.find((x) => x.id === id)
    if (!s) return []
    if (backed.has(s.id)) return [s.name]
    if (ctx.overrides.has(s.id) && canOverride(s)) {
      ctx.warnings.push({ kind: 'override', message: `Skill "${s.name}" — ${OVERRIDE_WARNING}` })
      return [s.name]
    }
    ctx.warnings.push({ kind: 'excluded', message: `Skill "${s.name}" is not backed by an interview-ready item and was left out.` })
    return []
  })
  return names.length > 0 ? [names.join(', ')] : []
}

function listLines<T extends { id: string }>(ids: readonly string[], list: readonly T[], line: (x: T) => string): string[] {
  return ids.flatMap((id) => {
    const x = list.find((i) => i.id === id)
    return x ? [line(x)] : []
  })
}

function contactLines(ctx: Ctx): ContactLine[] {
  const b = ctx.profile.basics
  const r = ctx.recipe
  const out: ContactLine[] = []
  const add = (field: ContactLine['field'], label: string, value: string, on = true): void => {
    if (on && value.trim()) out.push({ field, label, value: value.trim() })
  }
  add('email', 'Email', b.email)
  add('phone', 'Phone', b.phone, fieldOn(r, 'phone'))
  const loc = [b.location.city, b.location.region, b.location.countryCode].filter(Boolean).join(', ')
  add('location', 'Location', loc, fieldOn(r, 'location'))
  add('url', 'Website', b.url)
  for (const p of b.profiles) add('profile', p.network, p.url)
  add('nationality', 'Nationality', b.nationality, fieldOn(r, 'nationality'))
  add('visaStatus', 'Visa', b.visaStatus, fieldOn(r, 'visaStatus'))
  add('noticePeriod', 'Notice period', b.noticePeriod, fieldOn(r, 'noticePeriod'))
  add('expectedSalary', 'Expected salary', b.expectedSalary, fieldOn(r, 'expectedSalary'))
  add('dateOfBirth', 'Date of birth', b.dateOfBirth, fieldOn(r, 'dateOfBirth'))
  add('maritalStatus', 'Marital status', b.maritalStatus, fieldOn(r, 'maritalStatus'))
  return out
}

function regionWarnings(ctx: Ctx, hasPhoto: boolean | undefined): void {
  const { profile, recipe } = ctx
  if (recipe.region === 'gcc') {
    if (fieldOn(recipe, 'phone') && profile.basics.phone && !profile.basics.phone.trim().startsWith('+')) {
      ctx.warnings.push({ kind: 'region', message: 'GCC recruiters expect the phone with its country code (+971 …).' })
    }
    if (recipe.sections.includes('languages') && !profile.languages.some((l) => /arab/i.test(l.language))) {
      ctx.warnings.push({ kind: 'region', message: 'Add your Arabic level under Languages (even "basic" helps in the GCC).' })
    }
  }
  if (fieldOn(recipe, 'photo') && hasPhoto === false) {
    ctx.warnings.push({ kind: 'region', message: 'Photo is on, but no profile photo is uploaded (Settings › Résumé).' })
  }
}

/** All master text: the source a headline/summary number must come from. */
function masterText(profile: ResumeProfile): string {
  const out: string[] = []
  const walk = (v: unknown, key: string): void => {
    // Ids are random and would "contain" numbers the facts don't.
    if (key === 'id' || key.endsWith('Id') || key === 'visibility') return
    if (typeof v === 'string') out.push(v)
    else if (Array.isArray(v)) v.forEach((x) => walk(x, ''))
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k)
  }
  walk(profile, '')
  return out.join(' | ')
}

function numberWarnings(ctx: Ctx): void {
  const source = masterText(ctx.profile)
  for (const [label, text] of [['Headline', ctx.recipe.headline], ['Summary', ctx.recipe.summary]] as const) {
    const lock = checkFactLock(text, source)
    if (!lock.ok) ctx.warnings.push({ kind: 'numbers', message: `${label} has numbers your profile doesn't: ${lock.missing.join(', ')}.` })
  }
}

/** Lines of text → a rough page count (A4, 11pt, ~46 lines a page). */
function estimatePages(sections: readonly RenderedSection[], contact: number): number {
  let lines = 4 + Math.ceil(contact / 3)
  for (const s of sections) {
    lines += 2 + s.lines.reduce((n, l) => n + Math.ceil(l.length / 95), 0)
    for (const e of s.entries) lines += 2 + e.bullets.reduce((n, b) => n + Math.ceil(b.text.length / 90), 0) + (e.keywords.length ? 1 : 0)
  }
  return Math.round((lines / 46) * 10) / 10
}

export function renderVariant(profile: ResumeProfile, recipe: Recipe, opts: RenderOptions = {}): RenderedResume {
  const ctx: Ctx = { profile, recipe, warnings: [], overrides: new Set(recipe.overrides) }
  const sections = recipe.sections.flatMap((key): RenderedSection[] => {
    const section = (entries: RenderedEntry[], lines: string[] = []): RenderedSection[] =>
      entries.length > 0 || lines.length > 0 ? [{ key, label: SECTION_LABELS[key], entries, lines }] : []
    switch (key) {
      case 'summary':
        return section([], recipe.summary ? [recipe.summary] : [])
      case 'work':
        return section(workSection(ctx))
      case 'projects':
        return section(projectsSection(ctx))
      case 'skills':
        return section([], skillLines(ctx))
      case 'education':
        return section(
          [],
          listLines(recipe.education, profile.education, (e) =>
            [[e.studyType, e.area].filter(Boolean).join(' in '), e.institution, dateRange(e.startDate, e.endDate, false)]
              .filter(Boolean)
              .join(' · '),
          ),
        )
      case 'languages':
        return section([], listLines(recipe.languages, profile.languages, (l) => `${l.language} — ${fluencyLabel(l.fluency)}`))
      case 'certificates':
        return section(
          [],
          listLines(recipe.certificates, profile.certificates, (c) => [c.name, c.issuer, formatMonth(c.date)].filter(Boolean).join(' · ')),
        )
    }
  })
  const contact = contactLines(ctx)
  regionWarnings(ctx, opts.hasPhoto)
  numberWarnings(ctx)
  const estimatedPages = estimatePages(sections, contact.length)
  if (estimatedPages > recipe.lengthTarget + 0.15) {
    ctx.warnings.push({ kind: 'length', message: `About ${estimatedPages} pages — over the ${recipe.lengthTarget}-page target.` })
  }
  return {
    name: profile.basics.name,
    headline: recipe.headline || profile.basics.label,
    contact,
    sections,
    warnings: ctx.warnings,
    estimatedPages,
    template: recipe.template,
    photo: fieldOn(recipe, 'photo') && opts.hasPhoto === true,
  }
}
