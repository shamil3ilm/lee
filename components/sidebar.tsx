import Link from 'next/link'
import { Home, Briefcase, Building2, Users, Settings, FileText } from 'lucide-react'

const NAV = [
  { href: '/', label: 'Dashboard', icon: Home },
  { href: '/applications', label: 'Applications', icon: Briefcase },
  { href: '/companies', label: 'Companies', icon: Building2 },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/digest', label: 'Digest', icon: FileText },
  { href: '/settings/profile', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  return (
    <aside className="border-r p-4">
      <div className="mb-6 text-lg font-semibold">Employ</div>
      <nav className="space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-2 rounded px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <Icon className="size-4" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  )
}
