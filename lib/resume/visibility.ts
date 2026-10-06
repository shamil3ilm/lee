import type { Visibility } from './types'

/**
 * Default public/private flag per field. A field's own `visibility[key]`
 * overrides these. `_item` is the whole item (a private work item never
 * leaves lee, whatever its fields say).
 *
 * Public by default: name, label, summary, work, projects, skills,
 * education, links (profiles, url) — and email, which the portfolio build
 * requires. Private by default: phone, location detail, nationality, visa
 * status, notice period, salary, date of birth, marital status, photo.
 * Search preferences live in other columns and are never exported at all.
 */
export const DEFAULT_VISIBILITY = {
  basics: {
    name: 'public',
    label: 'public',
    email: 'public',
    url: 'public',
    summary: 'public',
    countryCode: 'public',
    phone: 'private',
    location: 'private',
    image: 'private',
    nationality: 'private',
    visaStatus: 'private',
    noticePeriod: 'private',
    dateOfBirth: 'private',
    maritalStatus: 'private',
    expectedSalary: 'private',
  },
  profiles: { _item: 'public' },
  work: { _item: 'public', location: 'public', url: 'public', summary: 'public', description: 'public' },
  highlight: { _item: 'public' },
  projects: { _item: 'public', url: 'public' },
  skills: { _item: 'public' },
  education: { _item: 'public', score: 'public' },
  languages: { _item: 'public' },
  certificates: { _item: 'public' },
} as const satisfies Record<string, Record<string, Visibility>>

export type VisibilityScope = keyof typeof DEFAULT_VISIBILITY

/** The basics fields that carry a flag, in editor order. */
export const BASICS_FLAGGED_FIELDS = Object.keys(DEFAULT_VISIBILITY.basics) as Array<
  keyof typeof DEFAULT_VISIBILITY.basics
>

export function defaultVisibility(scope: VisibilityScope, field: string): Visibility {
  const table = DEFAULT_VISIBILITY[scope] as Readonly<Record<string, Visibility>>
  // Unknown fields default to private: a new field never leaks by accident.
  return table[field] ?? 'private'
}

export function visibilityOf(
  scope: VisibilityScope,
  owner: { visibility?: Readonly<Record<string, Visibility>> },
  field: string,
): Visibility {
  return owner.visibility?.[field] ?? defaultVisibility(scope, field)
}

export function isPublic(
  scope: VisibilityScope,
  owner: { visibility?: Readonly<Record<string, Visibility>> },
  field: string,
): boolean {
  return visibilityOf(scope, owner, field) === 'public'
}

/** The item itself is public (its `_item` flag). */
export function isPublicItem(
  scope: VisibilityScope,
  owner: { visibility?: Readonly<Record<string, Visibility>> },
): boolean {
  return isPublic(scope, owner, '_item')
}

/** A copy of `owner` with one flag set (never mutates). */
export function withVisibility<T extends { visibility: Record<string, Visibility> }>(
  owner: T,
  field: string,
  value: Visibility,
): T {
  return { ...owner, visibility: { ...owner.visibility, [field]: value } }
}
