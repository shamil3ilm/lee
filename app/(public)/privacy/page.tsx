import type { Metadata } from 'next'
import { env } from '@/lib/env'
import { APP_NAME } from '@/lib/brand'

export const metadata: Metadata = { title: 'Privacy policy' }

// Update this date whenever the policy text changes.
const LAST_UPDATED = '26 September 2026'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}

export default function PrivacyPage() {
  const contact = env.SUPPORT_EMAIL
  return (
    <article className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Privacy policy</h1>
        <p className="text-sm text-muted-foreground">Last updated {LAST_UPDATED}</p>
      </header>

      <p className="text-base leading-relaxed">
        {APP_NAME} is a personal, single-user job-search tool. It is operated by its owner for their own use,
        and sign-in is restricted to the owner&rsquo;s Google account. It is not offered to the public and
        has no advertising.
      </p>

      <Section title="Google user data we access and why">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Basic profile</strong> (name, email address, profile picture): to sign you in and show who
            is signed in.
          </li>
          <li>
            <strong>Gmail, read-only</strong> (<code>gmail.readonly</code>): recent threads (about the last 30
            days) are checked against your tracked applications. For a matching thread we store the
            sender&rsquo;s address, the subject and Gmail&rsquo;s short snippet on that application&rsquo;s
            timeline. For threads that don&rsquo;t match we keep only the thread ID so they aren&rsquo;t
            checked twice, and delete it after 35 days. We do not store full message bodies.
          </li>
          <li>
            <strong>Gmail, send</strong> (<code>gmail.send</code>): to send emails you trigger, such as your
            weekly digest and new-match alerts.
          </li>
          <li>
            <strong>Google Calendar events</strong> (<code>calendar.events</code>): to create, update and remove
            events for interview stages you schedule.
          </li>
          <li>
            <strong>Google Drive, per-file</strong> (<code>drive.file</code>): to store your documents, files and
            generated PDFs in an <code>Employ</code> folder in your Drive, and to open files you explicitly pick.
            This access covers only files the app creates or you choose; it cannot see the rest of your Drive.
          </li>
        </ul>
      </Section>

      <Section title="Limited Use">
        <p>
          {APP_NAME}&rsquo;s use and transfer of information received from Google APIs adheres to the{' '}
          <a
            className="underline underline-offset-4"
            href="https://developers.google.com/terms/api-services-user-data-policy"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. Google user data is used only to provide the features
          described above, which you request in the app. {APP_NAME} does not sell it, use it for advertising,
          or use it to train AI models, and no person reads it except the owner.
        </p>
      </Section>

      <Section title="AI features">
        <p>
          When you use AI features (for example tailoring a CV, drafting a cover letter or scoring a CV against
          a job), the relevant text, such as your CV, profile and the job description, is sent to the AI
          provider you choose in settings (for example Groq or Google Gemini) to produce the result. This can
          include a document stored in your Drive, but only when you ask for an AI feature on it.{' '}
          <strong>Gmail and Calendar data are not sent to AI providers.</strong> Usage logs record token counts
          and timings only, never your prompts.
        </p>
        <p>
          Each AI provider handles what it receives under its own terms. Some free tiers (for example
          Gemini&rsquo;s unpaid tier) allow the provider to use submitted content to improve its services; pick
          a provider in settings accordingly.
        </p>
      </Section>

      <Section title="Where data is stored">
        <p>
          Application data is stored in a hosted PostgreSQL database (Neon), and the app is hosted on Vercel.
          Files are stored in your own Google Drive once connected, otherwise in the database. Provider API
          keys you add are encrypted at rest. Page-view and performance statistics use Vercel Web Analytics and
          Speed Insights, which do not use cookies.
        </p>
      </Section>

      <Section title="Retention and deletion">
        <p>
          Your data is kept while you use the app. Old AI usage logs (after 180 days), processed-email markers
          (after 35 days) and the bulky content of dismissed job listings (after 90 days) are removed
          automatically. You can revoke {APP_NAME}&rsquo;s access to your Google account at any time at{' '}
          <a className="underline underline-offset-4" href="https://myaccount.google.com/permissions">
            myaccount.google.com/permissions
          </a>
          , and ask for your data to be deleted using the contact below.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          {contact ? (
            <>
              Questions or deletion requests:{' '}
              <a className="underline underline-offset-4" href={`mailto:${contact}`}>
                {contact}
              </a>
              .
            </>
          ) : (
            <>Questions or deletion requests: use the support email shown on the Google sign-in screen for {APP_NAME}.</>
          )}
        </p>
      </Section>
    </article>
  )
}
