import Link from 'next/link'
import { Logo } from '@/components/brand/logo'
import { APP_NAME } from '@/lib/brand'

// Public pages (no sign-in): the homepage and privacy policy that Google's
// OAuth consent screen links to. proxy.ts lists these paths as public.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/about" aria-label={`${APP_NAME} home`}>
            <Logo size={26} />
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/signin" className="hover:text-foreground">
              Sign in
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">{children}</main>
    </div>
  )
}
