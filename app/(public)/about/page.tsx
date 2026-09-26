import type { Metadata } from 'next'
import Link from 'next/link'
import { LogoMark } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import { APP_NAME, APP_TAGLINE } from '@/lib/brand'

export const metadata: Metadata = { title: 'About' }

export default function AboutPage() {
  return (
    <article className="space-y-8">
      <div className="flex items-center gap-4">
        <LogoMark size={64} />
        <div>
          <h1 className="text-3xl font-semibold lowercase tracking-tight">{APP_NAME}</h1>
          <p className="text-muted-foreground">{APP_TAGLINE}</p>
        </div>
      </div>

      <p className="text-base leading-relaxed">
        {APP_NAME} (from Arabic لي, &ldquo;mine&rdquo;) is a personal, single-user job-search workspace. It
        keeps applications, CVs and cover letters, interview stages, contacts, discoveries from job boards,
        todos and expenses in one place, and includes practice tools for growing as an engineer.
      </p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">What it does with your Google account</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
          <li>Signs you in with Google. Only the owner&rsquo;s account is allowed.</li>
          <li>Reads recent Gmail threads to attach job-related emails to the matching application.</li>
          <li>Sends emails you trigger, such as your weekly digest and new-match alerts.</li>
          <li>Adds interview stages you schedule to your Google Calendar.</li>
          <li>
            Stores your documents and files in a <code>{APP_NAME}</code> folder in your Google Drive, using access
            limited to files it creates or you pick.
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Details are in the <Link href="/privacy" className="underline underline-offset-4">privacy policy</Link>.
        </p>
      </section>

      <Button asChild>
        <Link href="/signin">Sign in</Link>
      </Button>
    </article>
  )
}
