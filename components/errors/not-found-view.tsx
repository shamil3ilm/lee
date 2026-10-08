import Link from 'next/link'
import { Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CommandMenuButton } from '@/components/command-menu-button'
import { BackButton } from '@/components/errors/back-button'
import { StatusView } from '@/components/errors/status-view'
import { APP_NAME } from '@/lib/brand'

const QUICK_LINKS = [
  { href: '/discoveries', label: 'Discovery' },
  { href: '/applications', label: 'Applications' },
  { href: '/documents', label: 'Documents' },
  { href: '/settings', label: 'Settings' },
] as const

const linkCls = 'underline-offset-4 hover:text-foreground hover:underline'

/**
 * The 404 body. Signed in, it also offers search (the command menu), the
 * main sections and the Logs page; signed out, only Home and Back, since
 * every other page would bounce to sign-in.
 */
export function NotFoundView({ signedIn }: { signedIn: boolean }) {
  return (
    <StatusView
      eyebrow="Page not found"
      title="This page doesn't exist"
      description="The link may be old, or the item was deleted. Nothing you saved is affected."
      actions={
        <>
          <Button asChild>
            <Link href="/">
              <Home aria-hidden="true" />
              Go home
            </Link>
          </Button>
          <BackButton />
          {signedIn ? <CommandMenuButton /> : null}
        </>
      }
      footer={
        signedIn ? (
          <>
            <nav aria-label="Main sections">
              <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1">
                {QUICK_LINKS.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className={`inline-flex min-h-6 items-center ${linkCls}`}>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <p>
              Followed a link inside {APP_NAME}?{' '}
              <Link href="/settings/logs?level=problems" className={`underline ${linkCls}`}>
                Check the logs
              </Link>
            </p>
          </>
        ) : null
      }
    />
  )
}
