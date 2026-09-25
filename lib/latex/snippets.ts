import type { AssetMetadata } from '@/lib/db/queries/documentAssets'

// ---------------------------------------------------------------------------
// LaTeX snippet helpers. Each helper produces a small block of LaTeX suitable
// for inserting at the user's cursor. Kept as plain functions so both the
// editor UI and future automation (server-side "insert-photo" actions) can
// share the same output.
// ---------------------------------------------------------------------------

export type SnippetVariant = 'includegraphics' | 'photo' | 'logo' | 'includepdf' | 'input' | 'raw'

export interface InsertVariant {
  id: SnippetVariant
  label: string
  description: string
}

/**
 * Wrap a filename in a LaTeX `\includegraphics` at a given width (fraction of
 * `\textwidth`). The default (0.3) matches the drag-drop snippet.
 */
export function includegraphics(filename: string, widthFraction = 0.3): string {
  const clamped = Math.max(0.05, Math.min(1, widthFraction))
  return `\\includegraphics[width=${clamped.toFixed(2).replace(/\.?0+$/, '')}\\textwidth]{${filename}}`
}

/**
 * A CV-style "photo" block: fixed 3cm width, centred. Suited for a headshot
 * in the header block of a résumé template.
 */
export function photoBlock(filename: string): string {
  return [
    '\\begin{center}',
    `  \\includegraphics[width=3cm]{${filename}}`,
    '\\end{center}',
  ].join('\n')
}

/**
 * A small inline logo — 1cm high, aligned to the current baseline. Useful in
 * cover-letter letterheads.
 */
export function logoBlock(filename: string): string {
  return `\\raisebox{-0.3\\height}{\\includegraphics[height=1cm]{${filename}}}`
}

/**
 * A `\includepdf` block from `pdfpages`. Pass a single filename or a list of
 * filenames to emit one section per PDF. When emitting more than one, wraps
 * everything in a "Certificates" section.
 */
export function certificatesBlock(filenames: readonly string[]): string {
  if (filenames.length === 0) return ''
  if (filenames.length === 1) return `\\includepdf[pages=-]{${filenames[0]}}`
  const includes = filenames.map((f) => `\\includepdf[pages=-]{${f}}`).join('\n')
  return `\\section*{Certificates}\n${includes}`
}

/**
 * Include a single external PDF via `pdfpages`. `pages=-` grabs every page.
 */
export function includePdf(filename: string): string {
  return `\\includepdf[pages=-]{${filename}}`
}

/**
 * Insert a `\input{...}` for arbitrary text-like files (e.g. a shared
 * preamble fragment).
 */
export function inputBlock(filename: string): string {
  return `\\input{${filename}}`
}

/**
 * Produce a comment stub for a file kind we don't know how to embed. The
 * user can then reference it manually (e.g. via a package that supports it).
 */
export function attachedComment(filename: string): string {
  return `% attached: ${filename}`
}

// ---------------------------------------------------------------------------
// Editor integration: which variants make sense per asset type, and the
// canonical snippet each variant emits.
// ---------------------------------------------------------------------------

function isImage(mime: string): boolean {
  return mime.startsWith('image/')
}

function isPdf(mime: string): boolean {
  return mime === 'application/pdf'
}

function isText(mime: string): boolean {
  return (
    mime.startsWith('text/') ||
    mime === 'application/x-tex' ||
    mime === 'application/x-bibtex' ||
    mime === 'application/x-latex'
  )
}

/**
 * Return the set of "Insert as X" buttons appropriate for a given asset,
 * ordered from most to least common for that MIME type.
 */
export function insertVariants(asset: Pick<AssetMetadata, 'mimeType'>): InsertVariant[] {
  if (isImage(asset.mimeType)) {
    return [
      { id: 'includegraphics', label: 'Image', description: '\\includegraphics at 30% width' },
      { id: 'photo', label: 'Photo', description: 'Centered 3cm headshot block' },
      { id: 'logo', label: 'Logo', description: 'Inline 1cm-high logo' },
    ]
  }
  if (isPdf(asset.mimeType)) {
    return [
      { id: 'includepdf', label: 'PDF', description: '\\includepdf all pages (needs pdfpages)' },
    ]
  }
  if (isText(asset.mimeType)) {
    return [
      { id: 'input', label: 'Input', description: '\\input the file' },
      { id: 'raw', label: 'Reference', description: 'Insert as a comment for manual reference' },
    ]
  }
  return [
    { id: 'raw', label: 'Reference', description: 'Insert as a comment for manual reference' },
  ]
}

/**
 * Build the LaTeX snippet for the (asset, variant) pair. Used by the assets
 * panel's "Insert as X" buttons and by the drag-drop default insertion.
 */
export function buildAssetSnippet(
  asset: Pick<AssetMetadata, 'filename' | 'mimeType'>,
  variant: SnippetVariant,
): string {
  switch (variant) {
    case 'includegraphics':
      return includegraphics(asset.filename)
    case 'photo':
      return photoBlock(asset.filename)
    case 'logo':
      return logoBlock(asset.filename)
    case 'includepdf':
      return includePdf(asset.filename)
    case 'input':
      return inputBlock(asset.filename)
    case 'raw':
      return attachedComment(asset.filename)
  }
}

/**
 * Pick the best default snippet for a freshly-uploaded asset — image →
 * `\includegraphics`, PDF → `\includepdf`, everything else → a comment.
 */
export function defaultSnippetForAsset(
  asset: Pick<AssetMetadata, 'filename' | 'mimeType'>,
): string {
  if (isImage(asset.mimeType)) return includegraphics(asset.filename)
  if (isPdf(asset.mimeType)) return includePdf(asset.filename)
  return attachedComment(asset.filename)
}
