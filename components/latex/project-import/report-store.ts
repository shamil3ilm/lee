'use client'

/** What the editor shows after an import: missing references and failed uploads, clickable. */
export interface ImportReportItem {
  message: string
  file?: string
  line?: number
}

const REPORT_KEY = (documentId: string) => `lee.latex.importReport.${documentId}`

/** Hand the report to the editor the import navigates to (best effort). */
export function saveImportReport(documentId: string, items: readonly ImportReportItem[]): void {
  try {
    window.sessionStorage.setItem(REPORT_KEY(documentId), JSON.stringify(items.slice(0, 50)))
  } catch {
    // Storage blocked: the review step already listed these.
  }
}

/** Read (and clear) a report saved by an import from the Documents page. */
export function takeImportReport(documentId: string): ImportReportItem[] {
  try {
    const raw = window.sessionStorage.getItem(REPORT_KEY(documentId))
    if (!raw) return []
    window.sessionStorage.removeItem(REPORT_KEY(documentId))
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((i): i is ImportReportItem => typeof i === 'object' && i !== null && typeof (i as ImportReportItem).message === 'string')
      .map((i) => ({
        message: String(i.message).slice(0, 300),
        file: typeof i.file === 'string' ? i.file : undefined,
        line: typeof i.line === 'number' ? i.line : undefined,
      }))
  } catch {
    return []
  }
}
