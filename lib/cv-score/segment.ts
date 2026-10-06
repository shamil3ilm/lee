/**
 * v1.1 — segment the lines of a text CV section into roles and bullets.
 *
 * Two problems the v1.0 segmenter got wrong on real PDFs:
 *
 *   1. Role/company pairing. "Title <dates>" headers carry the company on the
 *      line ABOVE in some CVs and on the line BELOW in others ("Software
 *      Engineer  Dec 2025 – Present" / "Acme Pay, Kochi, India"). Both
 *      neighbours are scored as a company line (location suffix, Title Case,
 *      short, not ending in a period); ties follow the orientation the rest
 *      of the section uses.
 *   2. Wrapped lines. Without bullet glyphs every wrapped line looked like a
 *      new bullet. Lines are joined when the next line starts lowercase, when
 *      the previous one doesn't end a sentence (in CVs whose bullets end with
 *      periods), when the previous line runs to the right margin (positioned
 *      PDF items), or when a glyph bullet is followed by an unmarked line.
 */
import { parseDateRange } from './dates'
import { wordCount } from './text'
import type { LineLayout, ScorableRole } from './types'

/** Bullet glyphs: •, ▪, ■, ➤ … (space optional), and -, –, —, *, "1." / "1)" (space required). */
export const BULLET_RE = /^\s*(?:[•●▪◦‣∙·⁃➢➤►▸✓✔■□○]\s*|[*\-–—]\s+|\d{1,2}[.)]\s+)/

export const TITLE_WORDS = /\b(engineer|developer|manager|lead|director|analyst|designer|architect|consultant|scientist|intern|internship|trainee|apprentice|head|officer|specialist|administrator|founder|co-founder|cto|ceo|vp|programmer|associate|researcher|sre|devops|tech lead|principal|staff|executive|coordinator|assistant|teacher|tutor|lecturer|accountant|technician|freelancer?)\b/i

export const LOCATION_RE = /^[A-Z][A-Za-z.' -]{1,30},\s*[A-Z][A-Za-z.' -]{1,30}$/
const REMOTE_RE = /\(\s*(remote|hybrid|on-?site|onsite)\s*\)|\b(remote|hybrid)\s*$/i
const TERMINAL_END = /[.!?;:]["'”’)\]]?$/
const SENTENCE_END = /[.!?]["'”’)\]]?$/
const TECH_LINE = /^(?:tech|stack|tech stack|technologies|tools|environment)\s*:\s*(.+)$/i
const LEGAL_SUFFIX = /^(?:inc|llc|ltd|gmbh|co|corp|plc|pvt|pvt ltd|private limited|fz-?llc|fze|wll|s\.?a\.?|bv|ag)\.?$/i

export interface SegLine {
  text: string
  /** Index in the source line array (evidence). */
  index: number
  layout?: LineLayout | null
}

export interface SegBullet {
  roleIndex?: number
  text: string
  lines: number[]
}

export interface ExperienceParse {
  roles: ScorableRole[]
  bullets: SegBullet[]
}

type Kind = 'glyph' | 'header' | 'tech' | 'text'

export function startsLowercase(t: string): boolean {
  return /^[a-z]/.test(t.trim()) || /^[(&,+/]/.test(t.trim())
}

function endsTerminal(t: string): boolean {
  return TERMINAL_END.test(t.trim())
}

function toSegLines(lines: readonly (string | SegLine)[]): SegLine[] {
  return lines
    .map((l, i) => (typeof l === 'string' ? { text: l, index: i } : l))
    .filter((l) => l.text.trim().length > 0)
}

/** "Title — Company", "Company | Title", "Title, Company" → parts (title has a title word). */
export function parseRoleHeader(parts: string[]): { title: string; company: string } {
  const segs = parts
    .flatMap((p) => p.split(/\s+(?:\||—|–|@|at)\s+|\s+-\s+|,\s+|\t+| {3,}/))
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^[|,•·–—-]+$/.test(s))
  if (segs.length === 0) return { title: '', company: '' }
  const titleIdx = segs.findIndex((s) => TITLE_WORDS.test(s))
  if (titleIdx === -1) return { title: segs[0] ?? '', company: segs[1] ?? '' }
  const title = segs[titleIdx]!
  const company = segs.find((s, i) => i !== titleIdx && !LOCATION_RE.test(s)) ?? ''
  return { title, company }
}

/** "Acme Pay, Kochi, India" → company + location; "Contoso (Remote)" keeps "Remote". */
export function splitCompanyLocation(raw: string): { company: string; location?: string } {
  let t = raw.trim()
  const remote = REMOTE_RE.exec(t)
  if (remote) t = t.replace(REMOTE_RE, '').trim().replace(/[,|–—-]+$/, '').trim()
  const parts = t.split(/\s*,\s*|\s+[|·•–—]\s+|\s{3,}|\t+/).filter(Boolean)
  let company = parts[0] ?? ''
  let rest = parts.slice(1)
  if (rest[0] && LEGAL_SUFFIX.test(rest[0])) {
    company = `${company}, ${rest[0]}`
    rest = rest.slice(1)
  }
  const locParts = [...rest, ...(remote ? [remote[1] ?? remote[2] ?? 'Remote'] : [])]
  const location = locParts.length ? locParts.map((p) => p[0]!.toUpperCase() + p.slice(1)).join(', ') : undefined
  return { company, ...(location ? { location } : {}) }
}

function hasLocationSuffix(t: string): boolean {
  if (REMOTE_RE.test(t)) return true
  if (LOCATION_RE.test(t.trim())) return true
  return /,\s*[A-Z][A-Za-z.'-]+(?:\s[A-Z][A-Za-z.'-]+)*\s*(?:\(.*\))?$/.test(t.trim())
}

function capRatio(t: string): number {
  const ws = t.split(/\s+/).filter((w) => /[A-Za-z]/.test(w))
  if (ws.length === 0) return 0
  return ws.filter((w) => /^[A-Z0-9&(]/.test(w) || /^(?:of|and|the|for|de|&)$/i.test(w)).length / ws.length
}

function kindOf(t: string): { kind: Kind; rest?: string; start?: string; end?: string } {
  if (BULLET_RE.test(t)) return { kind: 'glyph' }
  if (TECH_LINE.test(t)) return { kind: 'tech' }
  const range = parseDateRange(t)
  if (range) {
    const rest = t
      .replace(range.matched, ' ')
      .replace(/[()]/g, ' ')
      .replace(/\s{3,}/g, '   ')
      .trim()
      .replace(/^[\s|,•·–—-]+|[\s|,•·–—-]+$/g, '')
    const words = wordCount(rest)
    // A sentence that merely mentions a date range is not a role header.
    if (words <= 14 && !(words > 6 && SENTENCE_END.test(rest))) {
      return { kind: 'header', rest, start: range.start, end: range.end }
    }
  }
  return { kind: 'text' }
}

interface SectionStats {
  periodStyle: boolean
  fullChars: number
  medianGap: number | null
  maxRight: number | null
}

function sectionStats(items: SegLine[], kinds: Kind[]): SectionStats {
  const body = items.filter((_, i) => kinds[i] === 'text' || kinds[i] === 'glyph')
  const ended = body.filter((l) => SENTENCE_END.test(l.text.trim())).length
  const lens = body.map((l) => l.text.trim().length)
  const longest = lens.length ? Math.max(...lens) : 0
  const gaps = items
    .map((l) => l.layout?.gapBefore ?? 0)
    .filter((g) => g > 0)
    .sort((a, b) => a - b)
  const rights = body.map((l) => l.layout?.right).filter((r): r is number => typeof r === 'number')
  return {
    periodStyle: body.length > 0 && ended / body.length >= 0.2,
    // Without layout, a line within ~15% of the longest line ran to the margin.
    fullChars: lens.length >= 4 ? Math.max(40, Math.round(longest * 0.85)) : 70,
    medianGap: gaps.length ? gaps[Math.floor(gaps.length / 2)]! : null,
    maxRight: rights.length ? Math.max(...rights) : null,
  }
}

/** True when `prev` (layout) runs to the text block's right margin — i.e. it wrapped. */
function reachesMargin(prev: SegLine, stats: SectionStats): boolean | null {
  const l = prev.layout
  if (!l || stats.maxRight === null) return null
  return l.right >= stats.maxRight - Math.max(3, l.fontSize * 3)
}

/**
 * Should `cur` be appended to the bullet whose last line is `prev`?
 * `glyphBullet` — the open bullet started with a bullet glyph.
 */
export function continuesBullet(prev: SegLine, cur: SegLine, glyphBullet: boolean, stats: SectionStats): boolean {
  const pl = prev.layout
  const cl = cur.layout
  if (pl && cl && pl.page === cl.page && stats.medianGap !== null) {
    // Extra vertical space separates paragraphs.
    if (cl.gapBefore > stats.medianGap * 1.6) return false
    // A hanging indent under a glyph bullet is a wrapped line.
    if (glyphBullet && cl.x > pl.x + cl.fontSize * 0.5) return true
  }
  if (startsLowercase(cur.text)) return true
  if (SENTENCE_END.test(prev.text.trim())) return false
  if (glyphBullet) return true
  const margin = reachesMargin(prev, stats)
  if (margin !== null) return margin || stats.periodStyle
  if (stats.periodStyle) return true
  return prev.text.trim().length >= stats.fullChars
}

interface HeaderInfo {
  pos: number
  title: string
  company: string
  location?: string
  start?: string
  end?: string
  lines: number[]
}

function eligibleCompanion(items: SegLine[], kinds: Kind[], used: Set<number>, pos: number): boolean {
  const it = items[pos]
  if (!it || kinds[pos] !== 'text' || used.has(pos)) return false
  const t = it.text.trim()
  if (wordCount(t) > 12 || endsTerminal(t) || startsLowercase(t)) return false
  return true
}

function companyScore(items: SegLine[], kinds: Kind[], pos: number, stats: SectionStats): number {
  const t = items[pos]!.text.trim()
  let s = 0
  if (hasLocationSuffix(t)) s += 3
  if (capRatio(t) >= 0.6) s += 2
  if (wordCount(t) <= 6) s += 1
  if (TITLE_WORDS.test(t)) s -= 2
  // The tail of a wrapped bullet sitting above a header is not a company.
  const before = items[pos - 1]
  if (before && kinds[pos - 1] !== 'header' && kinds[pos - 1] !== 'tech') {
    const wrapped = reachesMargin(before, stats) ?? (!endsTerminal(before.text) && before.text.trim().length >= stats.fullChars)
    if (wrapped) s -= 3
  }
  return s
}

function resolveHeaders(items: SegLine[], kinds: Kind[], stats: SectionStats): { headers: HeaderInfo[]; used: Set<number> } {
  const used = new Set<number>()
  const headerPos = items.map((_, i) => i).filter((i) => kinds[i] === 'header')
  for (const p of headerPos) used.add(p)
  const parsed = headerPos.map((p) => ({ p, k: kindOf(items[p]!.text.trim()) }))

  // Pass 1: which side holds the company when the header names only a title?
  let above = 0
  let below = 0
  for (const { p, k } of parsed) {
    if (!k.rest || !TITLE_WORDS.test(k.rest) || k.rest.split(/\s+(?:\||—|–|@|at)\s+|,\s+| {3,}/).length > 1) continue
    const a = eligibleCompanion(items, kinds, used, p - 1) ? companyScore(items, kinds, p - 1, stats) : -Infinity
    const b = eligibleCompanion(items, kinds, used, p + 1) ? companyScore(items, kinds, p + 1, stats) : -Infinity
    if (a > b) above++
    else if (b > a) below++
  }
  const preferBelow = below > above

  const headers: HeaderInfo[] = []
  for (const { p, k } of parsed) {
    const rest = k.rest ?? ''
    const info: HeaderInfo = { pos: p, title: '', company: '', start: k.start, end: k.end, lines: [items[p]!.index] }
    const multi = rest.split(/\s+(?:\||—|–|@|at)\s+|\s+-\s+|,\s+|\t+| {3,}/).filter((s) => s.trim()).length > 1
    if (rest && multi) {
      const h = parseRoleHeader([rest])
      info.title = h.title
      const loc = splitCompanyLocation(rest.slice(rest.indexOf(h.company)))
      info.company = h.company
      if (loc.location && loc.company === h.company) info.location = loc.location
    } else if (rest) {
      const restIsTitle = TITLE_WORDS.test(rest)
      const want: 'company' | 'title' = restIsTitle ? 'company' : 'title'
      const cands = [p - 1, p + 1].filter((c) => eligibleCompanion(items, kinds, used, c))
      let pick: number | undefined
      if (want === 'company') {
        const scored = cands.map((c) => ({ c, s: companyScore(items, kinds, c, stats) })).filter((x) => x.s >= 1)
        scored.sort((x, y) => y.s - x.s || (preferBelow ? y.c - x.c : x.c - y.c))
        pick = scored[0]?.c
      } else {
        pick = cands.find((c) => TITLE_WORDS.test(items[c]!.text))
      }
      if (want === 'company') info.title = rest
      else info.company = rest
      if (pick !== undefined) {
        used.add(pick)
        info.lines.push(items[pick]!.index)
        if (want === 'company') {
          const loc = splitCompanyLocation(items[pick]!.text)
          info.company = loc.company
          if (loc.location) info.location = loc.location
        } else info.title = items[pick]!.text.trim()
      } else if (want === 'title') {
        // No title line nearby: keep the v1.0 reading (the text is the title).
        info.title = rest
        info.company = ''
      }
    } else {
      // Dates on their own line: title/company above (up to two lines), else below.
      const pickLines = (dir: -1 | 1): number[] => {
        const out: number[] = []
        for (let c = p + dir; out.length < 2 && eligibleCompanion(items, kinds, used, c); c += dir) out.push(c)
        return dir === -1 ? out.reverse() : out
      }
      const up = pickLines(-1)
      const down = up.length ? [] : pickLines(1)
      const chosen = up.length ? up : down
      const h = parseRoleHeader(chosen.map((c) => items[c]!.text.trim()))
      info.title = h.title
      info.company = h.company
      for (const c of chosen) {
        used.add(c)
        info.lines.push(items[c]!.index)
      }
    }
    // A location-only line right below the header block ("Dubai, UAE").
    const next = Math.max(p, ...chosenPositions(info, items)) + 1
    if (eligibleCompanion(items, kinds, used, next) && (LOCATION_RE.test(items[next]!.text.trim()) || /^\(?remote\)?$/i.test(items[next]!.text.trim()))) {
      used.add(next)
      info.lines.push(items[next]!.index)
      info.location = info.location ?? items[next]!.text.trim()
    }
    info.lines.sort((a, b) => a - b)
    headers.push(info)
  }
  return { headers, used }
}

function chosenPositions(info: HeaderInfo, items: SegLine[]): number[] {
  return info.lines.map((idx) => items.findIndex((it) => it.index === idx)).filter((i) => i >= 0)
}

function splitTech(raw: string): string[] {
  return raw
    .split(/[,;|•·]| \/ /)
    .map((t) => t.trim().replace(/\.$/, ''))
    .filter((t) => t && t.length <= 40)
}

/** Roles + bullets of an Experience section. Accepts raw strings (tests) or indexed lines. */
export function parseExperience(input: readonly (string | SegLine)[]): ExperienceParse {
  const items = toSegLines(input)
  const kinds = items.map((l) => kindOf(l.text.trim()).kind)
  const stats = sectionStats(items, kinds)
  const { headers, used } = resolveHeaders(items, kinds, stats)
  const byPos = new Map(headers.map((h) => [h.pos, h]))

  const roles: ScorableRole[] = []
  const bullets: SegBullet[] = []
  let current: ScorableRole | null = null
  let open: { bullet: SegBullet; last: SegLine; glyph: boolean; roleBulletIdx: number } | null = null

  const pushBullet = (text: string, line: SegLine, glyph: boolean): void => {
    const roleIndex = current ? roles.length - 1 : undefined
    const bullet: SegBullet = { ...(roleIndex !== undefined ? { roleIndex } : {}), text, lines: [line.index] }
    bullets.push(bullet)
    if (current) current.bullets.push(text)
    open = { bullet, last: line, glyph, roleBulletIdx: current ? current.bullets.length - 1 : -1 }
  }

  items.forEach((line, pos) => {
    const t = line.text.trim()
    const kind = kinds[pos]!
    if (kind === 'header') {
      const h = byPos.get(pos)!
      current = {
        title: h.title,
        company: h.company,
        start: h.start,
        end: h.end,
        bullets: [],
        ...(h.location ? { location: h.location } : {}),
        lines: h.lines,
      }
      roles.push(current)
      open = null
      return
    }
    if (used.has(pos)) return
    if (kind === 'tech') {
      const m = TECH_LINE.exec(t)
      if (current && m) current.tech = [...(current.tech ?? []), ...splitTech(m[1]!)]
      open = null
      return
    }
    if (kind === 'glyph') {
      const text = t.replace(BULLET_RE, '').trim()
      if (text) pushBullet(text, line, true)
      return
    }
    const o = open as { bullet: SegBullet; last: SegLine; glyph: boolean; roleBulletIdx: number } | null
    if (o && continuesBullet(o.last, line, o.glyph, stats)) {
      o.bullet.text = `${o.bullet.text} ${t}`.replace(/\s+/g, ' ')
      o.bullet.lines.push(line.index)
      if (current && o.roleBulletIdx >= 0) current.bullets[o.roleBulletIdx] = o.bullet.text
      o.last = line
      return
    }
    // Paragraph-style achievement line inside a role (no bullet glyph).
    if (current && wordCount(t) >= 4 && !startsLowercase(t)) pushBullet(t, line, false)
  })
  return { roles, bullets }
}

/**
 * A project / item header: no sentence end or trailing comma, and either
 * short or split by a separator ("Name – Description    Tech, Stack").
 * With layout, a line indented past the section's left edge is body text.
 */
function isItemHeader(line: SegLine, minX: number | null): boolean {
  const t = line.text.trim()
  if (endsTerminal(t) || /,$/.test(t) || startsLowercase(t)) return false
  if (minX !== null && line.layout && line.layout.x > minX + line.layout.fontSize * 0.8) return false
  const n = wordCount(t)
  return n <= 16 && (n <= 8 || /\s{3,}|\s[|–—-]\s|\t/.test(t))
}

export interface BlockParse {
  bullets: SegBullet[]
  /** Item header lines (project names + tech stacks), never counted as prose. */
  headerLines: number[]
}

/**
 * Projects (and similar) sections: unmarked short lines without a full stop
 * are item headers ("Name – Description    Tech, Stack"); the paragraphs or
 * glyph bullets under them are bullets.
 */
export function parseBlocks(input: readonly (string | SegLine)[], opts: { headers: boolean }): BlockParse {
  const items = toSegLines(input)
  const kinds = items.map((l) => (BULLET_RE.test(l.text) ? 'glyph' : 'text') as Kind)
  const stats = sectionStats(items, kinds)
  const bullets: SegBullet[] = []
  const headerLines: number[] = []
  const xs = items.map((l) => l.layout?.x).filter((x): x is number => typeof x === 'number')
  const minX = xs.length ? Math.min(...xs) : null
  let open: { bullet: SegBullet; last: SegLine; glyph: boolean } | null = null
  items.forEach((line, pos) => {
    const t = line.text.trim()
    if (kinds[pos] === 'glyph') {
      const text = t.replace(BULLET_RE, '').trim()
      if (!text) return
      const bullet = { text, lines: [line.index] }
      bullets.push(bullet)
      open = { bullet, last: line, glyph: true }
      return
    }
    const o = open as { bullet: SegBullet; last: SegLine; glyph: boolean } | null
    if (o && continuesBullet(o.last, line, o.glyph, stats)) {
      o.bullet.text = `${o.bullet.text} ${t}`.replace(/\s+/g, ' ')
      o.bullet.lines.push(line.index)
      o.last = line
      return
    }
    if (!opts.headers) {
      open = null
      return
    }
    const headerish = isItemHeader(line, minX)
    if (headerish) {
      headerLines.push(line.index)
      open = null
      return
    }
    if (wordCount(t) >= 4 && !startsLowercase(t)) {
      const bullet = { text: t, lines: [line.index] }
      bullets.push(bullet)
      open = { bullet, last: line, glyph: false }
    }
  })
  return { bullets, headerLines }
}
