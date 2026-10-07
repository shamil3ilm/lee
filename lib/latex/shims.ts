import type { CompileAsset } from './compile-types'

/**
 * Bundled stand-ins for packages a compile service lacks. Injected into the
 * compile tarball only when the document loads the package, the service
 * reported it missing, and no full-TeX-Live fallback produced the PDF. The
 * stand-in keeps the document compiling: icons are typeset as short text.
 */

// [macro suffix (\fa<Suffix>), \faIcon name, text shown]
const FA_ICONS: readonly (readonly [string, string, string])[] = [
  ['Envelope', 'envelope', '@'],
  ['EnvelopeOpen', 'envelope-open', '@'],
  ['At', 'at', '@'],
  ['Phone', 'phone', 'Tel.'],
  ['PhoneAlt', 'phone-alt', 'Tel.'],
  ['PhoneSquare', 'phone-square', 'Tel.'],
  ['Mobile', 'mobile', 'Mob.'],
  ['MobileAlt', 'mobile-alt', 'Mob.'],
  ['Github', 'github', 'GitHub'],
  ['GithubSquare', 'github-square', 'GitHub'],
  ['Gitlab', 'gitlab', 'GitLab'],
  ['Linkedin', 'linkedin', 'LinkedIn'],
  ['LinkedinIn', 'linkedin-in', 'LinkedIn'],
  ['Twitter', 'twitter', 'Twitter'],
  ['Stackoverflow', 'stack-overflow', 'Stack Overflow'],
  ['Globe', 'globe', 'Web'],
  ['GlobeAmericas', 'globe-americas', 'Web'],
  ['Link', 'link', 'Link'],
  ['ExternalLink', 'external-link', 'Link'],
  ['ExternalLinkAlt', 'external-link-alt', 'Link'],
  ['Home', 'home', 'Home'],
  ['MapMarker', 'map-marker', 'Loc.'],
  ['MapMarkerAlt', 'map-marker-alt', 'Loc.'],
  ['MapPin', 'map-pin', 'Loc.'],
  ['Calendar', 'calendar', 'Date'],
  ['CalendarAlt', 'calendar-alt', 'Date'],
  ['Briefcase', 'briefcase', 'Work'],
  ['GraduationCap', 'graduation-cap', 'Edu.'],
  ['University', 'university', 'Edu.'],
  ['Code', 'code', 'Code'],
  ['Laptop', 'laptop', 'Laptop'],
  ['LaptopCode', 'laptop-code', 'Code'],
  ['User', 'user', 'User'],
  ['Star', 'star', '*'],
  ['Check', 'check', '+'],
  ['Award', 'award', 'Award'],
  ['Trophy', 'trophy', 'Award'],
  ['Certificate', 'certificate', 'Cert.'],
  ['Language', 'language', 'Lang.'],
  ['Heart', 'heart', 'Heart'],
  ['Book', 'book', 'Book'],
  ['Skype', 'skype', 'Skype'],
  ['Medium', 'medium', 'Medium'],
  ['Orcid', 'orcid', 'ORCID'],
  ['Kaggle', 'kaggle', 'Kaggle'],
  ['Dribbble', 'dribbble', 'Dribbble'],
  ['Behance', 'behance', 'Behance'],
  ['Youtube', 'youtube', 'YouTube'],
  ['Facebook', 'facebook', 'Facebook'],
  ['Instagram', 'instagram', 'Instagram'],
  ['Telegram', 'telegram', 'Telegram'],
  ['Whatsapp', 'whatsapp', 'WhatsApp'],
]

function fontawesome5Shim(): string {
  return [
    '% lee stand-in for fontawesome5: the compile service lacks the package.',
    '% Icons are typeset as short text so the document still compiles.',
    '\\NeedsTeXFormat{LaTeX2e}',
    '\\ProvidesPackage{fontawesome5}[2026/10/07 lee text stand-in]',
    '\\DeclareOption*{}',
    '\\ProcessOptions\\relax',
    '\\PackageWarningNoLine{fontawesome5}{lee stand-in: icons are shown as text}',
    '\\newcommand*\\lee@fa[1]{{\\small\\textsf{#1}}}',
    '\\newcommand*\\lee@faicon[2][]{\\@ifundefined{lee@fa@#2}{\\lee@fa{#2}}{\\@nameuse{lee@fa@#2}}}',
    '\\newcommand*\\faIcon{\\@ifstar\\lee@faicon\\lee@faicon}',
    '\\newcommand*\\lee@fadef[3]{%',
    '  \\@namedef{lee@fa@#2}{\\lee@fa{#3}}%',
    '  \\@ifundefined{fa#1}{\\@namedef{fa#1}{\\@ifstar{\\lee@fa{#3}}{\\lee@fa{#3}}}}{}}',
    ...FA_ICONS.map(([macro, name, text]) => `\\lee@fadef{${macro}}{${name}}{${text}}`),
    '\\endinput',
    '',
  ].join('\n')
}

const SHIMS: Readonly<Record<string, () => string>> = {
  fontawesome5: fontawesome5Shim,
}

export const SHIM_NOTES: Readonly<Record<string, string>> = {
  fontawesome5: "fontawesome5 isn't available on the compile service; icons shown as text.",
}

export function hasShim(pkg: string): boolean {
  return pkg in SHIMS
}

/** The stand-in .sty as a compile asset, or null when none is bundled. */
export function shimAsset(pkg: string): CompileAsset | null {
  const make = SHIMS[pkg]
  if (!make) return null
  return { filename: `${pkg}.sty`, mimeType: 'text/x-tex', bytes: Buffer.from(make(), 'utf8') }
}
