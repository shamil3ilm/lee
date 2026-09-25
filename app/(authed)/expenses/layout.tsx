import { RouteTabs, type RouteTab } from '@/components/route-tabs'

const EXPENSES_TABS: RouteTab[] = [
  { href: '/expenses', label: 'Overview' },
  { href: '/expenses/budgets', label: 'Budgets' },
  { href: '/expenses/import', label: 'Import' },
]

export default function ExpensesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      {/* Hidden on /expenses/[id]/edit — an edit form isn't a sibling tab. */}
      <RouteTabs tabs={EXPENSES_TABS} label="Expenses sections" hideOnSubroutes />
      {children}
    </div>
  )
}
