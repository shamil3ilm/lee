/** Drive viewer link for a file id (opens in the user's own Google session). */
export function driveViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`
}
