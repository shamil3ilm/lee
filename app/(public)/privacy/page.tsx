import type { Metadata } from 'next'
import { env } from '@/lib/env'
import { APP_NAME } from '@/lib/brand'
import { formatDateTime } from '@/lib/ui/date'
import { OUTBOUND_PARTIES, type OutboundParty } from '@/lib/net/outbound-hosts'
import { OSM_ATTRIBUTION, OSM_COPYRIGHT_URL } from '@/lib/company-discovery/sources/osm-attribution'

export const metadata: Metadata = { title: 'Privacy policy' }

// Update this date whenever the policy text changes.
// US style, like every other date in the app ("Sep 26, 2026").
const LAST_UPDATED = formatDateTime('2026-10-09T12:00:00Z', 'date-year', 'UTC')

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}

const GROUP_LABELS: Record<OutboundParty['group'], string> = {
  platform: 'Hosting and infrastructure',
  google: 'Google',
  ai: 'AI providers',
  documents: 'Documents and publishing',
  jobs: 'Job sources',
  research: 'Research and company information',
  lookups: 'Lookups',
}

/** Rendered from lib/net/outbound-hosts.ts: the one list of third parties. */
function ThirdParties() {
  const groups = Object.keys(GROUP_LABELS) as Array<OutboundParty['group']>
  return (
    <>
      {groups.map((g) => {
        const parties = OUTBOUND_PARTIES.filter((p) => p.group === g)
        if (parties.length === 0) return null
        return (
          <div key={g} className="space-y-1">
            <h3 className="font-medium text-foreground">{GROUP_LABELS[g]}</h3>
            <ul className="list-disc space-y-1 pl-5">
              {parties.map((p) => (
                <li key={p.id}>
                  <strong>{p.name}</strong>
                  {p.hosts.length > 0 ? (
                    <>
                      {' '}
                      (<span className="break-words">{p.hosts.join(', ')}</span>)
                    </>
                  ) : null}
                  : {p.sends}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </>
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
            generated PDFs in a <code>{APP_NAME}</code> folder in your Drive, and to open files you explicitly pick.
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
          provider you choose in settings (Groq or Google Gemini; in the Model Playground also OpenRouter,
          Cerebras or the Hugging Face router) to produce the result. Voice notes are transcribed by Groq. This can
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

      <Section title="PDF compilation">
        <p>
          When you compile a LaTeX document (a CV, cover letter or other document), its source and any images
          it uses are sent to a public LaTeX compile service to produce the PDF: latexonline.cc by default, and
          latex.ytotech.com when the first lacks a package or is unavailable. You can choose the service per
          document in the compile menu. Neither service is run by {APP_NAME}; each handles what it receives
          under its own terms. {APP_NAME} keeps its own cache of compiled PDFs so unchanged documents are not sent
          again.
        </p>
      </Section>

      <Section title="GitHub and LinkedIn">
        <p>
          Both connections are optional, yours alone, and removable in Settings › Integrations. Connect GitHub uses
          the {APP_NAME} GitHub App: {APP_NAME} reads your login, avatar, the repositories you installed the app on
          (private ones only if you chose them), their languages and stars, and your own commit and pull request
          counts, and writes only your portfolio file when you click Publish. Connect LinkedIn signs you in with
          LinkedIn (name, photo, email) and, only if you allow posting, publishes a post when you click Post;{' '}
          {APP_NAME} never posts on a schedule, likes, comments or sends connection requests. Access and refresh
          tokens for both are encrypted at rest and deleted on Disconnect (GitHub&rsquo;s authorization is also
          revoked; for LinkedIn, also remove {APP_NAME} under LinkedIn&rsquo;s Permitted services). Cached GitHub
          repository counts are deleted after 30 days unless you linked the repository to a project.
        </p>
        <p className="mt-3">
          A LinkedIn data export you upload is read in your browser; only your profile fields, positions,
          education, skills, certifications, projects, languages and, if you choose, your connections are sent to{' '}
          {APP_NAME}. Connections are stored as name, company, position and the date you connected (email
          addresses only if you opt in), are visible only to you, are used only for referral hints, and can be
          deleted at once in Settings › LinkedIn. Messages and other export files are never read.
        </p>
      </Section>

      <Section title="Third parties lee sends data to">
        <p>
          This is every outside service {APP_NAME}&rsquo;s code contacts, and what each one receives. Each handles
          what it receives under its own terms. Services you never turn on (for example an optional key you
          don&rsquo;t add) receive nothing.
        </p>
        <ThirdParties />
      </Section>

      <Section title="Open data credits">
        <p data-testid="privacy-osm-attribution">
          Company discovery uses open data. Map data{' '}
          <a className="underline underline-offset-4" href={OSM_COPYRIGHT_URL}>
            {OSM_ATTRIBUTION}
          </a>{' '}
          (Open Database License 1.0). Legal entity data from GLEIF (CC0 1.0). Indian company data from the Ministry
          of Corporate Affairs via data.gov.in (Government Open Data License – India), only if you add a data.gov.in key.
          {APP_NAME} reads no Google Maps data: the per-company &ldquo;Look up on Google Maps&rdquo; link simply opens
          Google Maps in your browser.
        </p>
      </Section>

      <Section title="Where data is stored">
        <p>
          Application data is stored in a hosted PostgreSQL database (Neon), and the app is hosted on Vercel.
          Files are stored in your own Google Drive once connected, otherwise in the database. Provider API
          keys you add and your Google sign-in tokens are encrypted at rest. Page-view and performance statistics use Vercel Web Analytics and
          Speed Insights, which do not use cookies.
        </p>
      </Section>

      <Section title="Retention and deletion">
        <p>
          Your data is kept while you use the app. Clutter is removed automatically every night: by default,
          unreviewed job listings move to Dismissed after 60 days, the bulky content of dismissed listings is
          removed after 30 days, AI usage logs after 180 days, processed-email markers after 35 days, and old
          CV score runs, Model Lab runs and cached PDFs after their own windows. The owner can change these
          windows in Settings › Storage. Applications, saved jobs, notes and documents are never removed by
          this cleanup.
          Activity logs of background runs, syncs and errors (Settings › Logs) are deleted after 14 days, and
          warnings and errors after 60 days; background job records after 14 days (30 if a job failed). These
          logs hold counts, timings and short error messages only: secrets are removed, email addresses are
          reduced to their domain, and email bodies, prompts, CV text and document content are never stored in
          them. You can revoke {APP_NAME}&rsquo;s access to your Google account at any time at{' '}
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
