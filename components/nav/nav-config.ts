import {
  BarChart3,
  Beaker,
  Briefcase,
  Building2,
  CheckSquare,
  FileCheck2,
  FileText,
  Gauge,
  Home,
  Settings,
  Shapes,
  Sparkles,
  Swords,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

export type NavBadgeKey = 'discoveries' | 'todos'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  badge?: NavBadgeKey
}

export interface NavGroup {
  key: string
  label: string
  items: NavItem[]
}

export type NavBadges = Partial<Record<NavBadgeKey, number>>

export const HOME_ITEM: NavItem = { href: '/', label: 'Home', icon: Home }

export const SETTINGS_ITEM: NavItem = { href: '/settings', label: 'Settings', icon: Settings }

/** Journey-ordered groups (spec §2.2). */
export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'find',
    label: 'Find',
    items: [
      { href: '/discoveries', label: 'Discovery', icon: Sparkles, badge: 'discoveries' },
      { href: '/companies', label: 'Companies', icon: Building2 },
    ],
  },
  {
    key: 'apply',
    label: 'Apply',
    items: [
      { href: '/applications', label: 'Applications', icon: Briefcase },
      { href: '/documents', label: 'Documents', icon: FileCheck2 },
      { href: '/cv-score', label: 'CV Score', icon: Gauge },
      { href: '/contacts', label: 'Contacts', icon: Users },
    ],
  },
  {
    key: 'plan',
    label: 'Plan',
    items: [
      { href: '/todos', label: 'Todos', icon: CheckSquare, badge: 'todos' },
      { href: '/digest', label: 'Digest', icon: FileText },
    ],
  },
  {
    key: 'insights',
    label: 'Insights',
    items: [{ href: '/analytics', label: 'Analytics', icon: BarChart3 }],
  },
  {
    key: 'playground',
    label: 'Playground',
    items: [
      { href: '/playground', label: 'Playground', icon: Shapes },
      { href: '/playground/models', label: 'Models', icon: Swords },
      { href: '/playground/decisions', label: 'Decisions', icon: Beaker },
    ],
  },
  {
    key: 'money',
    label: 'Money',
    items: [{ href: '/expenses', label: 'Expenses', icon: Wallet }],
  },
]

export const ALL_NAV_HREFS: readonly string[] = [
  HOME_ITEM.href,
  ...NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href)),
  SETTINGS_ITEM.href,
]
