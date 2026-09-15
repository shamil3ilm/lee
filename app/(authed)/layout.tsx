import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { Sidebar } from '@/components/sidebar'
import { CommandMenuButton } from '@/components/command-menu-button'
import { MobileNav } from '@/components/mobile-nav'
import { ModeToggle } from '@/components/mode-toggle'
import { UserMenu } from '@/components/user-menu'

export const dynamic = 'force-dynamic'

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/signin')
  const email = session.user.email ?? 'unknown'
  const name = session.user.name ?? null
  const image = session.user.image ?? null
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-[240px] shrink-0 md:block">
        <div className="fixed inset-y-0 left-0 z-30 w-[240px]">
          <Sidebar />
        </div>
      </aside>
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6">
          <MobileNav />
          <div className="flex-1" />
          <CommandMenuButton />
          <ModeToggle />
          <UserMenu email={email} name={name} image={image} />
        </header>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  )
}
