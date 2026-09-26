import { RouteTabs, type RouteTab } from '@/components/route-tabs'

const SETTINGS_TABS: RouteTab[] = [
  { href: '/settings/profile', label: 'Profile' },
  { href: '/settings/cv', label: 'CV' },
  { href: '/settings/ai', label: 'AI' },
  { href: '/settings/sources', label: 'Sources' },
  { href: '/settings/integrations', label: 'Integrations' },
  { href: '/settings/notifications', label: 'Notifications' },
  { href: '/settings/scam-shield', label: 'Scam Shield' },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <RouteTabs tabs={SETTINGS_TABS} label="Settings sections" className="mx-auto max-w-4xl" />
      {children}
    </div>
  )
}
