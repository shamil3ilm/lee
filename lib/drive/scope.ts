/**
 * `drive.file`: per-file access to files Employ creates or the user opens
 * with the app (Google Picker). Non-sensitive, no access to the rest of the
 * user's Drive. https://developers.google.com/workspace/drive/api/guides/api-specific-auth
 */
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

/** True when a space-delimited OAuth scope string includes drive.file. */
export function hasDriveScope(scope: string | null | undefined): boolean {
  return (scope ?? '').split(' ').includes(DRIVE_FILE_SCOPE)
}
