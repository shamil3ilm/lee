'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  Briefcase,
  Building2,
  Users,
  Settings,
  FileText,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

interface NavSection {
  label: string
  items: NavItem[]
}

const SECTIONS: NavSection[] = [
  {
    label: 'Pipeline',
    items: [
      { href: '/', label: 'Dashboard', icon: Home },
      { href: '/applications', label: 'Applications', icon: Briefcase },
    ],
  },
  {
    label: 'Directory',
    items: [
      { href: '/companies', label: 'Companies', icon: Building2 },
      { href: '/contacts', label: 'Contacts', icon: Users },
    ],
  },
  {
    label: 'Personal',
    items: [
      { href: '/settings/profile', label: 'Profile', icon: Settings },
      { href: '/digest', label: 'Digest', icon: FileText },
    ],
  },
]

interface SidebarProps {
  className?: string
  onNavigate?: () => void
}

export function Sidebar({ className, onNavigate }: SidebarProps) {
  const pathname = usePathname()

  const isActive = (href: string): boolean => {
    if (href === '/') return pathname === '/'
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  return (
    <aside className={cn('flex h-full flex-col border-r bg-background', className)}>
      <div className="flex h-14 items-center border-b px-5">
        <Link
          href="/"
          onClick={onNavigate}
          className="text-base font-semibold tracking-tight"
        >
          Employ
        </Link>
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {SECTIONS.map((section) => (
          <div key={section.label}>
            <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.label}
            </div>
            <div className="space-y-0.5">
              {section.items.map(({ href, label, icon: Icon }) => {
                const active = isActive(href)
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onNavigate}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors',
                      active
                        ? 'bg-accent font-medium text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                    )}
                  >
                    <Icon className="size-4" />
                    <span>{label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  )
}
