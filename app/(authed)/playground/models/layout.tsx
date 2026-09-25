import { RouteTabs, type RouteTab } from '@/components/route-tabs'

const MODEL_TABS: RouteTab[] = [
  { href: '/playground/models', label: 'Overview' },
  { href: '/playground/models/arena', label: 'Arena' },
  { href: '/playground/models/providers', label: 'Providers' },
]

export default function ModelPlaygroundLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <RouteTabs tabs={MODEL_TABS} label="Model Playground sections" />
      {children}
    </div>
  )
}
