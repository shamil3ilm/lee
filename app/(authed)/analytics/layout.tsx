import { RouteTabs, type RouteTab } from '@/components/route-tabs'

const ANALYTICS_TABS: RouteTab[] = [
  { href: '/analytics', label: 'Overview' },
  { href: '/analytics/performance', label: 'Performance' },
]

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <RouteTabs tabs={ANALYTICS_TABS} label="Analytics sections" />
      {children}
    </div>
  )
}
