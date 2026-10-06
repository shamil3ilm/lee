import { redirect } from 'next/navigation'

/**
 * The master CV is now derived from the master profile (one source of
 * facts); its editor lives in Settings › Profile › Résumé.
 */
export default function CvSettingsPage(): never {
  redirect('/settings/profile/resume')
}
