import type { ApplicationListRow } from '@/lib/db/queries/applications'

/**
 * Fields exported to CSV. Order matters — this list drives both the header
 * row and every data row. Column names are the header text.
 */
const COLUMNS: Array<[label: string, extract: (r: ApplicationListRow) => unknown]> = [
  ['Company', (r) => r.job?.company?.name ?? ''],
  ['Title', (r) => r.job?.title ?? ''],
  ['Status', (r) => r.status],
  ['Source', (r) => r.source ?? ''],
  ['Applied At', (r) => (r.appliedAt ? r.appliedAt.toISOString() : '')],
  ['Location', (r) => r.job?.location ?? ''],
  ['Remote Type', (r) => r.job?.remoteType ?? ''],
  ['Salary Min', (r) => (r.job?.salaryMin != null ? String(r.job.salaryMin) : '')],
  ['Salary Max', (r) => (r.job?.salaryMax != null ? String(r.job.salaryMax) : '')],
  ['Currency', (r) => r.job?.salaryCurrency ?? ''],
  ['Interest Level', (r) => (r.interestLevel != null ? String(r.interestLevel) : '')],
  ['Next Action At', (r) => (r.nextActionAt ? r.nextActionAt.toISOString() : '')],
  ['Notes URL', (r) => `/applications/${r.id}`],
  ['Source URL', (r) => r.job?.sourceUrl ?? ''],
  ['Added At', (r) => r.createdAt.toISOString()],
]

/**
 * Escape a value for CSV per RFC 4180 — quote it and double any internal
 * quotes when it contains commas, quotes, or newlines. Numbers and other
 * non-strings are stringified first.
 */
function escapeCell(value: unknown): string {
  const s = value == null ? '' : String(value)
  if (s.length === 0) return ''
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/**
 * Serialize a list of applications to CSV. Includes a UTF-8 BOM so Excel on
 * Windows picks up encoding without prompting. Uses CRLF line endings for
 * RFC 4180 compliance.
 */
export function applicationsToCsv(rows: readonly ApplicationListRow[]): string {
  const header = COLUMNS.map(([label]) => escapeCell(label)).join(',')
  const body = rows
    .map((r) => COLUMNS.map(([, extract]) => escapeCell(extract(r))).join(','))
    .join('\r\n')
  return `﻿${header}\r\n${body}${body.length ? '\r\n' : ''}`
}

/** Formatted attachment name like `lee-applications-2026-09-25.csv`. */
export function csvFilename(now: Date = new Date()): string {
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const d = String(now.getUTCDate()).padStart(2, '0')
  return `lee-applications-${y}-${m}-${d}.csv`
}
