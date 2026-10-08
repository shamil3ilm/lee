import { RouteTabs, type RouteTab } from '@/components/route-tabs'

const RADAR_TABS: RouteTab[] = [
  { href: '/radar', label: 'Feed' },
  { href: '/radar/new', label: "What's new" },
  { href: '/radar/watchlist', label: 'Watchlist' },
  { href: '/radar/sources', label: 'Sources' },
]

export default function RadarLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <RouteTabs tabs={RADAR_TABS} label="Radar sections" hideOnSubroutes />
      {children}
    </div>
  )
}
