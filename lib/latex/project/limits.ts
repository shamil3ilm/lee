// Limits for LaTeX projects: the per-document asset caps (enforced by the
// server in lib/db/queries/documentAssets.ts) and the .zip import guards
// (enforced in the browser before anything is stored). Client-safe.

const MB = 1024 * 1024

/** Largest single document asset (server cap). */
export const MAX_ASSET_BYTES = 5 * MB
/**
 * Most assets one document holds. Raised from 20 so an imported Overleaf
 * project (sections, figures, styles) fits; the per-user storage quota still
 * bounds the bytes.
 */
export const MAX_ASSETS_PER_DOCUMENT = 100
/**
 * Largest file sent through a function (multipart POST) when Google Drive is
 * not in use: Vercel caps a request body at 4.5 MB, multipart framing included.
 */
export const SERVER_UPLOAD_MAX_BYTES = 4 * MB

/** The .zip file itself. */
export const MAX_ZIP_BYTES = 25 * MB
/** Sum of the declared uncompressed sizes of the files read from a zip. */
export const MAX_ZIP_TOTAL_BYTES = 25 * MB
/** One file's declared uncompressed size; bigger files are skipped. */
export const MAX_ZIP_FILE_BYTES = 10 * MB
/** Entries in the zip's central directory (folders and junk included). */
export const MAX_ZIP_ENTRIES = 300
/** Uncompressed / compressed above this is treated as a zip bomb… */
export const MAX_COMPRESSION_RATIO = 100
/** …for entries at least this big (small text legitimately compresses well). */
export const RATIO_CHECK_MIN_BYTES = 1 * MB
/** The review step warns above this total. */
export const LARGE_PROJECT_BYTES = 10 * MB
/** The main file becomes the document source, saved through a server action (1 MB body). */
export const MAX_MAIN_FILE_BYTES = 768 * 1024
