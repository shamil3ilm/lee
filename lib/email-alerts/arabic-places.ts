import { TARGET_REGIONS } from '@/lib/discovery/relevance/places'
import { normalizeForMatch } from '@/lib/discovery/relevance/text'

/**
 * Arabic location lines in job-alert emails ("دبي، الإمارات العربية المتحدة",
 * "الرياض، المملكة العربية السعودية (عن بُعد)"). A line is a location when
 * nothing but place names, work-mode words and filler is left after the
 * known Arabic place names are removed — so "شركة دبي للتقنية" (a company
 * that names Dubai) is not one.
 */

const EXTRA = [
  'الخليج', 'الشرق الأوسط', 'عن بعد', 'عن بُعد', 'هجين', 'في الموقع', 'من المكتب', 'المنطقة الشرقية',
  'منطقة الرياض', 'منطقة مكة المكرمة', 'مكة المكرمة', 'محافظة',
]
const FILLER = ['في', 'و', 'مدينة', 'منطقة', 'إمارة', 'دولة']

const ALIASES: readonly string[] = [
  ...TARGET_REGIONS.flatMap((r) => r.aliases).filter((a) => /[؀-ۿ]/.test(a)),
  ...EXTRA,
]
  .map((a) => normalizeForMatch(a))
  // Longest first so "الإمارات العربية المتحدة" is removed before "الإمارات".
  .sort((a, b) => b.length - a.length)

const FILLER_NORM = new Set(FILLER.map((f) => normalizeForMatch(f)))

export function isArabicLocation(line: string): boolean {
  let rest = ` ${normalizeForMatch(line).replace(/[()[\],،·\-–—|/]/g, ' ')} `
  let found = false
  for (const alias of ALIASES) {
    const padded = ` ${alias} `
    while (rest.includes(padded)) {
      rest = rest.replace(padded, ' ')
      found = true
    }
  }
  if (!found) return false
  const words = rest.split(/\s+/).filter((w) => w && !FILLER_NORM.has(w))
  return words.length === 0
}
