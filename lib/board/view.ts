/** Board / List view selection, shared by server pages and the toggle. */
export type BoardView = 'board' | 'list'

/** Resolve `?view=` against a page default. */
export function parseBoardView(
  raw: string | string[] | undefined,
  defaultView: BoardView,
): { view: BoardView; explicit: boolean } {
  if (raw === 'board' || raw === 'list') return { view: raw, explicit: true }
  return { view: defaultView, explicit: false }
}

/** Same URL with `view` set (other params kept, `page` reset). */
export function viewHref(
  pathname: string,
  params: Record<string, string | string[] | undefined>,
  view: BoardView,
): string {
  const next = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (k === 'view' || k === 'page' || v === undefined) continue
    next.set(k, Array.isArray(v) ? (v[0] ?? '') : v)
  }
  next.set('view', view)
  return `${pathname}?${next.toString()}`
}
