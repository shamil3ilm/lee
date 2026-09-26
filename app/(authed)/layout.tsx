import { redirect } from 'next/navigation'
import { preconnect } from 'react-dom'
import { getSession } from '@/lib/auth/require-session'
import * as discoveriesQ from '@/lib/db/queries/discoveries'
import * as todosQ from '@/lib/db/queries/todos'
import { logger } from '@/lib/logger'
import { scheduleVisitDrain } from '@/lib/queue/visit'
import { Sidebar } from '@/components/sidebar'
import { CommandMenuButton } from '@/components/command-menu-button'
import { InlineScript } from '@/components/inline-script'
import { MobileNav } from '@/components/mobile-nav'
import { ModeToggle } from '@/components/mode-toggle'
import { NotificationScheduler } from '@/components/notification-scheduler'
import { UserMenu } from '@/components/user-menu'
import type { NavBadges } from '@/components/nav/nav-config'
import { NavBadgesProvider } from '@/components/nav/nav-badges'
import { WebVitalsReporter } from '@/components/web-vitals-reporter'
import { APP_SHELL_ID, RAIL_BOOT_SCRIPT } from '@/lib/ui/sidebar-store'
import Link from 'next/link'
import { Logo } from '@/components/brand/logo'
import { APP_NAME } from '@/lib/brand'

export const dynamic = 'force-dynamic'

/** Two cheap count queries; a failure degrades to "no badges", never a 500. */
async function loadNavBadges(userId: string, now: Date): Promise<NavBadges> {
  try {
    const [discoveries, todos] = await Promise.all([
      discoveriesQ.countNew(userId),
      todosQ.countOverdue(userId, now),
    ])
    return { discoveries, todos }
  } catch (err) {
    logger.error('nav.badges_failed', { userId, error: err instanceof Error ? err.message : String(err) })
    return {}
  }
}

/** The avatar's https origin (e.g. Google's image host), or null. */
function imageOrigin(image: string | null): string | null {
  if (!image) return null
  try {
    const url = new URL(image)
    return url.protocol === 'https:' ? url.origin : null
  } catch {
    return null
  }
}

/**
 * The app shell. It awaits only the session, which is a JWT cookie decode (no
 * database), so the sidebar, header and the page's loading skeleton flush in
 * the first bytes. The nav badge counts are started here but not awaited: the
 * promise streams to the client and each badge fills in when it resolves
 * (components/nav/nav-badges.tsx). Pages fetch their own data behind their
 * loading.tsx / Suspense boundaries.
 */
export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session?.user) redirect('/signin')
  const email = session.user.email ?? 'unknown'
  const name = session.user.name ?? null
  const image = session.user.image ?? null
  // The header avatar is an unoptimized remote image: open that connection
  // early, while the rest of the shell streams.
  const avatarOrigin = imageOrigin(image)
  if (avatarOrigin) preconnect(avatarOrigin)
  const badges: Promise<NavBadges> = session.user.id
    ? loadNavBadges(session.user.id, new Date())
    : Promise.resolve({})
  // Opportunistic queue drain for this user, registered with after(): no
  // query on the render path; one indexed check once the response is sent.
  if (session.user.id) void scheduleVisitDrain(session.user.id)
  return (
    // `group/shell` + `data-sidebar="rail"` drive every rail-mode width/label
    // variant. The boot script sets the attribute pre-paint from storage, so
    // there is no layout shift on hydration.
    <NavBadgesProvider badges={badges}>
      <div id={APP_SHELL_ID} className="group/shell flex min-h-screen" suppressHydrationWarning>
        <InlineScript html={RAIL_BOOT_SCRIPT} />
        <aside className="hidden w-[240px] shrink-0 group-data-[sidebar=rail]/shell:w-14 md:block">
          <div className="fixed inset-y-0 left-0 z-30 w-[240px] group-data-[sidebar=rail]/shell:w-14">
            <Sidebar email={email} name={name} image={image} railEnabled />
          </div>
        </aside>
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6">
            <MobileNav email={email} name={name} image={image} />
            {/* Phones have no sidebar, so the brand sits in the top bar. */}
            <Link href="/" aria-label={`${APP_NAME} home`} className="md:hidden">
              <Logo size={24} />
            </Link>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <CommandMenuButton />
              <ModeToggle />
              <UserMenu email={email} name={name} image={image} />
            </div>
          </header>
          <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
            <div className="mx-auto w-full max-w-[1600px]">{children}</div>
          </main>
        </div>
        <NotificationScheduler />
        <WebVitalsReporter />
      </div>
    </NavBadgesProvider>
  )
}
