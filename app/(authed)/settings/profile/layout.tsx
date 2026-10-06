import { RouteTabs, type RouteTab } from '@/components/route-tabs'

const PROFILE_TABS: RouteTab[] = [
  { href: '/settings/profile', label: 'Preferences' },
  { href: '/settings/profile/resume', label: 'Résumé' },
  { href: '/settings/profile/study', label: 'Study list' },
  { href: '/settings/profile/variants', label: 'Variants' },
  { href: '/settings/profile/publish', label: 'Publish' },
]

export default function ProfileSettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <RouteTabs tabs={PROFILE_TABS} label="Profile sections" />
      {children}
    </div>
  )
}
