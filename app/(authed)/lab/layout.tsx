import { RouteTabs, type RouteTab } from '@/components/route-tabs'

const LAB_TABS: RouteTab[] = [
  { href: '/lab', label: 'Overview' },
  { href: '/lab/arena', label: 'Arena' },
  { href: '/lab/providers', label: 'Providers' },
]

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <RouteTabs tabs={LAB_TABS} label="Model Lab sections" />
      {children}
    </div>
  )
}
