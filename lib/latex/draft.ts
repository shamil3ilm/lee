// Draft mode (v17 §8.5 decision 8): graphicx's `draft` option draws image
// boxes instead of embedding images, for faster previews. The option is
// prepended on the SAME line as the first source line, so every line number
// in the compile log still matches the editor.

export const DRAFT_GRAPHICX = '\\PassOptionsToPackage{draft}{graphicx}'

export function withDraftMode(source: string): string {
  return `${DRAFT_GRAPHICX}${source}`
}
