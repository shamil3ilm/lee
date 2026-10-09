/** Document kinds that can be downloaded as Word (.docx): the CV shapes. */
export function hasWordExport(kind: string): boolean {
  return kind === 'master_cv' || kind === 'tailored_cv'
}
