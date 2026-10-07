import { RouteTabs, type RouteTab } from '@/components/route-tabs'

const PLAYGROUND_TABS: RouteTab[] = [
  { href: '/playground', label: 'Practice' },
  { href: '/playground/problems', label: 'Problems' },
  { href: '/playground/review', label: 'Review' },
  { href: '/playground/history', label: 'History' },
  { href: '/playground/models', label: 'Models' },
  { href: '/playground/decisions', label: 'Decisions' },
]

export default function PlaygroundLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <RouteTabs tabs={PLAYGROUND_TABS} label="Playground sections" />
      {children}
    </div>
  )
}
