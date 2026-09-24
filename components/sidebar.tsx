'use client'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  Briefcase,
  Building2,
  Users,
  Settings,
  FileText,
  Sparkles,
  Rss,
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
      { href: '/discoveries', label: 'Discovery', icon: Sparkles },
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
      { href: '/settings/cv', label: 'CV', icon: FileText },
      { href: '/settings/sources', label: 'Sources', icon: Rss },
      { href: '/digest', label: 'Digest', icon: FileText },
    ],
  },
]

interface SidebarProps {
  className?: string
  onNavigate?: () => void
  email?: string | null
  name?: string | null
  image?: string | null
}

function initials(email: string, name?: string | null): string {
  const base = name?.trim() || email
  const parts = base.split(/[\s@.]+/).filter(Boolean)
  const first = parts[0]?.[0] ?? '?'
  const second = parts[1]?.[0] ?? ''
  return (first + second).toUpperCase()
}

export function Sidebar({ className, onNavigate, email, name, image }: SidebarProps) {
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
                      'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      active
                        ? 'bg-accent font-semibold text-accent-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
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
      {email ? (
        <footer className="mt-auto border-t p-3">
          <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
            {image ? (
              <Image
                src={image}
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 rounded-full object-cover ring-1 ring-border"
                unoptimized
              />
            ) : (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-medium text-secondary-foreground">
                {initials(email, name)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              {name ? (
                <div className="truncate text-xs font-medium">{name}</div>
              ) : null}
              <div className="truncate text-xs text-muted-foreground">{email}</div>
            </div>
          </div>
        </footer>
      ) : null}
    </aside>
  )
}
