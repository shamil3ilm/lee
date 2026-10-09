/**
 * Client-safe. A company name reduced for matching connections to a
 * posting's company: lower case, accents and punctuation dropped, legal
 * suffixes removed ("Careem Networks FZ-LLC" and "careem networks" match).
 * Words like "Technologies" are kept; hints then match keys as whole-word
 * prefixes ("careem" ~ "careem networks"), see lib/db/queries/linkedin.ts.
 */

const LEGAL = new Set([
  'inc', 'incorporated', 'llc', 'l l c', 'ltd', 'limited', 'plc', 'gmbh', 'ag', 'sa', 'bv', 'nv', 'co', 'corp', 'corporation',
  'company', 'pvt', 'private', 'pte', 'fz', 'fze', 'fzco', 'fzc', 'fzllc', 'dmcc', 'wll', 'spc', 'llp', 'srl', 'oy', 'ab', 'as',
  // Gulf company forms: Kuwait (K.S.C., K.S.C.C., K.S.C.P.), Bahrain (B.S.C.), Qatar (Q.S.C., Q.P.S.C.), UAE (P.J.S.C.), Oman (S.A.O.C./G.)
  'ksc', 'kscc', 'kscp', 'kpsc', 'bsc', 'qsc', 'qpsc', 'pjsc', 'psc', 'saoc', 'saog', 'jsc',
])

export function companyKey(name: string): string {
  const words = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    // "S.A.", "L.L.C." → "sa", "llc"
    .replace(/\./g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
  while (words.length > 1 && LEGAL.has(words[words.length - 1]!)) words.pop()
  if (words.length > 1 && words[0] === 'the') words.shift()
  return words.join(' ').slice(0, 200)
}
