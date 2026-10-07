import { RouteTabs, type RouteTab } from '@/components/route-tabs'

const PROBLEM_TABS: RouteTab[] = [
  { href: '/playground/problems', label: 'Problem set' },
  { href: '/playground/problems/plans', label: 'Study plans' },
  { href: '/playground/problems/mock', label: 'Mock assessment' },
  { href: '/playground/problems/stats', label: 'Stats' },
]

/** Coding workbench section (phase 13.1). The workbench itself hides the sub-tabs to keep its split view tall. */
export default function ProblemsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <RouteTabs tabs={PROBLEM_TABS} label="Problem sections" hideOnSubroutes />
      {children}
    </div>
  )
}
