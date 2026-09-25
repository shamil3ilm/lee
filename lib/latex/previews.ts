/**
 * Stylized SVG wireframe previews for the 14 LaTeX templates. These are
 * hand-crafted mockups — NOT real LaTeX renders — that hint at each
 * template's layout (single vs. two-column, header block, sidebar, letter
 * body, colored accent stripe, etc.) so the picker can convey visual
 * distinction without shipping heavy image assets or attempting a
 * client-side LaTeX compile.
 *
 * All SVGs share the same viewBox (200 x 280 → letter-ish 5:7 aspect) so
 * they render consistently inside the picker's fixed preview slot.
 *
 * Category conventions:
 *   - minimalist: 1 column, thin rules, no color
 *   - modern: color accent (blue/indigo), section rules
 *   - two-column CVs (altacv/deedy): sidebar band + main
 *   - academic: many short section blocks
 *   - creative: shape/stripe accent
 *   - letters: obvious letterhead + paragraphs, no bullet lists
 */

// Reusable style tokens. Recharts / picker background is `bg-muted` so the
// preview canvas is white to pop against it.
const CANVAS = { w: 200, h: 280 } as const
const INK = '#1f2937' // slate-800
const DIM = '#94a3b8' // slate-400
const RULE = '#e2e8f0' // slate-200

// Helpers for hand-rolling section blocks; each returns an SVG fragment
// (not a full <svg>) so template functions can compose freely.
function bar(x: number, y: number, w: number, h: number, fill = INK): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1" fill="${fill}"/>`
}
function rule(x1: number, y1: number, x2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y1}" stroke="${RULE}" stroke-width="1"/>`
}
function sectionHeading(x: number, y: number, w: number, color = INK): string {
  return bar(x, y, w, 5, color)
}
function line(x: number, y: number, w: number, dim = true): string {
  return bar(x, y, w, 2, dim ? DIM : INK)
}
function bullet(x: number, y: number, w: number): string {
  return `<circle cx="${x}" cy="${y + 1}" r="1.4" fill="${DIM}"/>${bar(x + 5, y, w, 2, DIM)}`
}

function svg(body: string, bg = '#ffffff'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS.w} ${CANVAS.h}" role="img" aria-label="Template preview" preserveAspectRatio="xMidYMid meet"><rect width="100%" height="100%" fill="${bg}"/>${body}</svg>`
}

// ---------------------------------------------------------------------------
// CV templates
// ---------------------------------------------------------------------------

function makeSingleColumnCv(opts: {
  accent?: string
  headerFill?: string
  ruled?: boolean
}): string {
  const accent = opts.accent ?? INK
  const headerFill = opts.headerFill ?? INK
  const parts: string[] = []
  // Header: name + contact line
  parts.push(bar(16, 18, 90, 10, headerFill))
  parts.push(bar(16, 32, 60, 4, DIM))
  parts.push(bar(16, 40, 140, 2, DIM))
  if (opts.ruled) parts.push(rule(16, 50, 184))

  // Section: Experience
  parts.push(sectionHeading(16, 60, 60, accent))
  if (opts.ruled) parts.push(rule(16, 68, 184))
  parts.push(bar(16, 74, 90, 3, INK))
  parts.push(bar(140, 74, 44, 3, DIM))
  parts.push(bullet(20, 84, 150))
  parts.push(bullet(20, 92, 140))
  parts.push(bullet(20, 100, 155))

  parts.push(bar(16, 116, 90, 3, INK))
  parts.push(bar(140, 116, 44, 3, DIM))
  parts.push(bullet(20, 126, 150))
  parts.push(bullet(20, 134, 130))

  // Section: Education
  parts.push(sectionHeading(16, 154, 60, accent))
  if (opts.ruled) parts.push(rule(16, 162, 184))
  parts.push(bar(16, 168, 120, 3, INK))
  parts.push(line(16, 176, 160))

  // Section: Skills
  parts.push(sectionHeading(16, 196, 60, accent))
  if (opts.ruled) parts.push(rule(16, 204, 184))
  parts.push(line(16, 212, 150))
  parts.push(line(16, 220, 140))

  // Section: Projects
  parts.push(sectionHeading(16, 240, 60, accent))
  if (opts.ruled) parts.push(rule(16, 248, 184))
  parts.push(line(16, 256, 150))
  parts.push(line(16, 264, 130))
  return svg(parts.join(''))
}

function makeTwoColumnCv(opts: {
  sidebarBg: string
  accent: string
  sidebarLeft?: boolean
}): string {
  const left = opts.sidebarLeft !== false
  const sidebarX = left ? 0 : 132
  const mainX = left ? 78 : 16
  const parts: string[] = []
  // Sidebar band
  parts.push(`<rect x="${sidebarX}" y="0" width="68" height="280" fill="${opts.sidebarBg}"/>`)
  // Sidebar contents: name + contact block + skills + education mini
  parts.push(bar(sidebarX + 8, 20, 52, 8, '#ffffff'))
  parts.push(bar(sidebarX + 8, 34, 40, 3, '#ffffff'))
  parts.push(bar(sidebarX + 8, 42, 44, 3, '#ffffff'))
  parts.push(bar(sidebarX + 8, 58, 32, 4, opts.accent))
  for (let i = 0; i < 5; i++) {
    parts.push(bar(sidebarX + 8, 68 + i * 8, 48 - (i % 2) * 4, 2, '#ffffff'))
  }
  parts.push(bar(sidebarX + 8, 128, 32, 4, opts.accent))
  for (let i = 0; i < 4; i++) {
    parts.push(bar(sidebarX + 8, 138 + i * 8, 48 - (i % 2) * 6, 2, '#ffffff'))
  }
  parts.push(bar(sidebarX + 8, 188, 32, 4, opts.accent))
  for (let i = 0; i < 4; i++) {
    parts.push(bar(sidebarX + 8, 198 + i * 8, 48 - (i % 2) * 4, 2, '#ffffff'))
  }

  // Main column: name spine + experience
  parts.push(bar(mainX, 18, 80, 8, INK))
  parts.push(bar(mainX, 30, 60, 3, DIM))
  parts.push(sectionHeading(mainX, 50, 60, opts.accent))
  parts.push(bar(mainX, 62, 90, 3, INK))
  parts.push(bullet(mainX + 4, 72, 90))
  parts.push(bullet(mainX + 4, 80, 80))
  parts.push(bullet(mainX + 4, 88, 90))

  parts.push(bar(mainX, 108, 90, 3, INK))
  parts.push(bullet(mainX + 4, 118, 90))
  parts.push(bullet(mainX + 4, 126, 80))

  parts.push(sectionHeading(mainX, 150, 60, opts.accent))
  parts.push(bar(mainX, 162, 90, 3, INK))
  parts.push(bullet(mainX + 4, 172, 90))
  parts.push(bullet(mainX + 4, 180, 70))

  parts.push(sectionHeading(mainX, 204, 60, opts.accent))
  parts.push(line(mainX, 214, 100))
  parts.push(line(mainX, 222, 90))
  parts.push(line(mainX, 230, 100))
  return svg(parts.join(''))
}

function makeAcademicCv(): string {
  const parts: string[] = []
  parts.push(bar(16, 16, 100, 10, INK))
  parts.push(bar(16, 30, 80, 3, DIM))
  parts.push(bar(16, 38, 140, 2, DIM))
  const sections = [
    'Education',
    'Publications',
    'Grants',
    'Teaching',
    'Talks',
    'Service',
  ]
  let y = 50
  for (const _ of sections) {
    parts.push(sectionHeading(16, y, 70, INK))
    parts.push(rule(16, y + 8, 184))
    parts.push(line(16, y + 14, 160))
    parts.push(line(16, y + 21, 150))
    parts.push(line(16, y + 28, 140))
    y += 38
  }
  return svg(parts.join(''))
}

function makeCreativeCv(): string {
  // Friggeri-style: colored stripe on left with photo blob, main column right
  const parts: string[] = []
  parts.push(`<rect x="0" y="0" width="60" height="280" fill="#7c3aed"/>`)
  parts.push(`<circle cx="30" cy="40" r="18" fill="#ffffff" opacity="0.9"/>`)
  parts.push(bar(6, 68, 48, 4, '#ffffff'))
  parts.push(bar(6, 78, 40, 3, '#ffffff'))
  parts.push(bar(6, 84, 44, 3, '#ffffff'))
  parts.push(bar(6, 100, 32, 4, '#c4b5fd'))
  for (let i = 0; i < 4; i++) {
    parts.push(bar(6, 110 + i * 8, 44 - i * 3, 2, '#ffffff'))
  }
  parts.push(bar(6, 158, 32, 4, '#c4b5fd'))
  for (let i = 0; i < 3; i++) {
    parts.push(bar(6, 168 + i * 8, 44 - i * 4, 2, '#ffffff'))
  }
  // Main
  parts.push(bar(72, 18, 100, 8, INK))
  parts.push(bar(72, 30, 60, 3, DIM))
  parts.push(sectionHeading(72, 50, 70, '#7c3aed'))
  parts.push(bullet(76, 62, 100))
  parts.push(bullet(76, 70, 90))
  parts.push(bullet(76, 78, 100))
  parts.push(bullet(76, 86, 80))
  parts.push(sectionHeading(72, 108, 70, '#7c3aed'))
  parts.push(bullet(76, 120, 100))
  parts.push(bullet(76, 128, 90))
  parts.push(sectionHeading(72, 150, 70, '#7c3aed'))
  parts.push(line(72, 160, 110))
  parts.push(line(72, 168, 100))
  parts.push(sectionHeading(72, 190, 70, '#7c3aed'))
  parts.push(line(72, 200, 100))
  parts.push(line(72, 208, 90))
  return svg(parts.join(''))
}

// ---------------------------------------------------------------------------
// Cover letter templates
// ---------------------------------------------------------------------------

function makeLetter(opts: {
  accent?: string
  centeredHeader?: boolean
  senderRight?: boolean
  friendly?: boolean
}): string {
  const parts: string[] = []
  if (opts.centeredHeader) {
    parts.push(bar(60, 18, 80, 10, INK))
    parts.push(bar(70, 32, 60, 3, DIM))
  } else if (opts.senderRight) {
    parts.push(bar(110, 18, 74, 8, INK))
    parts.push(bar(110, 30, 74, 3, DIM))
    parts.push(bar(110, 36, 74, 3, DIM))
  } else {
    parts.push(bar(16, 18, 90, 8, INK))
    parts.push(bar(16, 30, 74, 3, DIM))
    parts.push(bar(16, 36, 74, 3, DIM))
  }
  if (opts.accent) {
    // colored accent stripe under the header
    parts.push(bar(16, 50, 168, 2, opts.accent))
  } else {
    parts.push(rule(16, 52, 184))
  }
  // Date
  parts.push(bar(16, 66, 40, 3, DIM))
  // Recipient block
  parts.push(bar(16, 82, 60, 3, INK))
  parts.push(bar(16, 90, 70, 3, INK))
  parts.push(bar(16, 98, 50, 3, INK))
  // Greeting
  parts.push(bar(16, 116, 60, 3, INK))
  // Body paragraphs
  const paraStarts = [128, 168, 208]
  for (const y of paraStarts) {
    parts.push(line(16, y, 168))
    parts.push(line(16, y + 6, 160))
    parts.push(line(16, y + 12, 168))
    parts.push(line(16, y + 18, 130))
  }
  // Closing
  const closingY = opts.friendly ? 244 : 250
  parts.push(bar(16, closingY, 40, 3, INK))
  parts.push(bar(16, closingY + 8, 60, 3, INK))
  return svg(parts.join(''))
}

// ---------------------------------------------------------------------------
// Registry — one entry per template id in lib/latex/templates/index.ts
// ---------------------------------------------------------------------------

export const TEMPLATE_PREVIEWS: Record<string, string> = {
  // CVs
  'moderncv-classic': makeSingleColumnCv({ accent: '#2563eb', headerFill: '#2563eb' }),
  'awesome-cv': makeSingleColumnCv({
    accent: '#1e40af',
    headerFill: INK,
    ruled: true,
  }),
  'altacv-tw': makeTwoColumnCv({ sidebarBg: '#0f766e', accent: '#f59e0b' }),
  'cv-simple': makeSingleColumnCv({ accent: INK, headerFill: INK, ruled: true }),
  'cv-europass-style': makeTwoColumnCv({
    sidebarBg: '#1e3a8a',
    accent: '#fbbf24',
    sidebarLeft: false,
  }),
  'cv-academic-cv': makeAcademicCv(),
  'cv-deedy-resume': makeTwoColumnCv({ sidebarBg: '#334155', accent: '#e11d48' }),
  'cv-jake-gwinnett': makeSingleColumnCv({
    accent: INK,
    headerFill: INK,
    ruled: true,
  }),
  'cv-friggeri': makeCreativeCv(),

  // Cover letters
  'letter-classic': makeLetter({ senderRight: true }),
  'letter-moderncv': makeLetter({ accent: '#2563eb' }),
  'letter-awesome-cv': makeLetter({ accent: '#1e40af', centeredHeader: true }),
  'letter-modern-professional': makeLetter({ accent: '#0ea5e9' }),
  'letter-friendly': makeLetter({ friendly: true }),
}

/**
 * Returns SVG markup for a template preview, or a neutral placeholder when
 * the template id is unknown. Consumers should still guard-check that the
 * result starts with `<svg` before dangerouslySetInnerHTML — the check is
 * cheap defense-in-depth since these SVGs are our own strings but the map
 * is looked up by external id.
 */
export function getTemplatePreview(templateId: string): string {
  const src = TEMPLATE_PREVIEWS[templateId]
  if (src && src.startsWith('<svg')) return src
  // Fallback: a neutral blank sheet mockup so an unknown template still
  // renders something rather than a hollow box.
  return svg(
    [
      bar(16, 18, 90, 8, DIM),
      bar(16, 34, 140, 3, RULE),
      bar(16, 60, 60, 4, DIM),
      rule(16, 70, 184),
      line(16, 78, 150),
      line(16, 86, 160),
      line(16, 94, 140),
    ].join(''),
  )
}
