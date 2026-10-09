/** Client-safe labels for import sources (Reset details, Undo last import). */
const SOURCES: Readonly<Record<string, string>> = { url: 'Public page', linkedin: 'LinkedIn export', cv: 'CV', github: 'GitHub' }

export function importSourceLabel(source: string): string {
  return SOURCES[source] ?? source
}

export function countsSummary(counts: Record<string, number>): string {
  const total = Object.entries(counts)
    .filter(([k]) => !k.endsWith('Updated'))
    .reduce((n, [, v]) => n + v, 0)
  return `${total} item${total === 1 ? '' : 's'}`
}
