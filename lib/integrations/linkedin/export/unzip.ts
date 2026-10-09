import { exportFileKey, parseLinkedInExport, type LinkedInExport } from './parse'

/**
 * Client-only. Read the export ZIP in the browser: fflate is loaded on
 * demand, only the CSVs lee uses are decompressed (the Complete archive
 * also holds messages and media, which are never read), each capped.
 */

export const MAX_ZIP_BYTES = 80 * 1024 * 1024
const MAX_CSV_BYTES = 15 * 1024 * 1024

export class ExportZipError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExportZipError'
  }
}

export async function readLinkedInExportZip(bytes: Uint8Array): Promise<LinkedInExport> {
  if (bytes.byteLength > MAX_ZIP_BYTES) throw new ExportZipError('That file is too large for a LinkedIn export.')
  const { unzipSync, strFromU8 } = await import('fflate')
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(bytes, { filter: (f) => exportFileKey(f.name) !== null && f.originalSize <= MAX_CSV_BYTES })
  } catch {
    throw new ExportZipError('This is not a readable ZIP file.')
  }
  const files: Record<string, string> = {}
  for (const [name, data] of Object.entries(entries)) {
    const key = exportFileKey(name)
    if (key && !(key in files)) files[key] = strFromU8(data)
  }
  if (Object.keys(files).length === 0) throw new ExportZipError('No LinkedIn CSV files were found in this ZIP.')
  return parseLinkedInExport(files)
}
