import { RouteTabs, type RouteTab } from '@/components/route-tabs'

const SETTINGS_TABS: RouteTab[] = [
  { href: '/settings/profile', label: 'Profile' },
  { href: '/settings/cv', label: 'CV' },
  { href: '/settings/ai', label: 'AI' },
  { href: '/settings/sources', label: 'Sources' },
  { href: '/settings/integrations', label: 'Integrations' },
  { href: '/settings/notifications', label: 'Notifications' },
  { href: '/settings/scam-shield', label: 'Scam Shield' },
  { href: '/settings/jobs', label: 'Background jobs' },
  { href: '/settings/usage', label: 'Usage' },
]

/**
 * Settings share one reading-width column, left-aligned on the page gutter
 * like every other page, so the tab bar, page header and cards all start at
 * the same x (pages keep their own max-w-4xl, which is then a no-op).
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-4xl space-y-6">
      <RouteTabs tabs={SETTINGS_TABS} label="Settings sections" />
      {children}
    </div>
  )
}
