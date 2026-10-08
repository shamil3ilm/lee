import Link from 'next/link'
import { EmptyIllustration } from '@/components/brand/empty-illustration'
import { Logo } from '@/components/brand/logo'
import { APP_NAME } from '@/lib/brand'
import { MAIN_CONTENT_ID } from '@/components/skip-link'
import { cn } from '@/lib/utils'

interface StatusViewProps {
  /** Small label above the title, e.g. "Page not found" or "Error". */
  eyebrow: string
  title: string
  description: string
  /** Buttons: the first is the primary way back. */
  actions: React.ReactNode
  /** Secondary links or the error code under the actions. */
  footer?: React.ReactNode
  className?: string
}

/**
 * The shared body of the 404 and error screens: the brand illustration, one
 * clear sentence and a way back. Server-safe (no hooks), token colours only,
 * so it follows the theme in light and dark.
 */
export function StatusView({ eyebrow, title, description, actions, footer, className }: StatusViewProps) {
  return (
    <section
      aria-labelledby="status-title"
      className={cn('mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-12 text-center sm:py-16', className)}
    >
      <EmptyIllustration size={88} />
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{eyebrow}</p>
        <h1 id="status-title" className="text-balance text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="text-pretty text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">{actions}</div>
      {footer ? <div className="space-y-2 text-xs text-muted-foreground">{footer}</div> : null}
    </section>
  )
}

/**
 * Minimal page chrome for screens rendered outside the app shell (an
 * unmatched URL, a root-level error): the logo home link above the view.
 */
export function StatusFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-4">
          <Link href="/" aria-label={`${APP_NAME} home`} className="rounded-md">
            <Logo size={26} />
          </Link>
        </div>
      </header>
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="flex flex-1 items-start justify-center outline-none">
        {children}
      </main>
    </div>
  )
}
