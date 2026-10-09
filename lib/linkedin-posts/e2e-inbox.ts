import { isTestLoginEnabled } from '@/lib/auth/test-login-guard'
import type { GmailMessageContent } from '@/lib/gmail/adapter'

/**
 * E2E ONLY: a synthetic Gmail inbox for the `linkedin_post` source, used
 * when E2E_GMAIL_FIXTURES=1 with the local test sign-in enabled (never on
 * Vercel or in production, like E2E_AI_FIXTURES). The messages still go
 * through the real sender check and parser. Invented people and companies.
 */

export function e2eGmailFixturesEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return isTestLoginEnabled(env) && env.E2E_GMAIL_FIXTURES === '1'
}

const AUTH =
  'mx.google.com; dkim=pass header.i=@linkedin.com header.s=s1; spf=pass smtp.mailfrom=x@bounce.linkedin.com; dmarc=pass (p=REJECT) header.from=linkedin.com'

const HIRING_HTML = `<html><body><table role="presentation"><tr><td>
<a href="https://www.linkedin.com/comm/in/layla-haddad-e2e?midToken=AQE&trk=eml-actor">Layla Haddad</a>
<p>Talent Acquisition Lead at Dune Soft Systems</p>
<p><a href="https://www.linkedin.com/comm/feed/update/urn:li:activity:7399999999999999001/?midToken=AQE&trk=eml-post&otpToken=x">We're hiring a Laravel Developer in Dubai! 3+ years with PHP and MySQL. Send your CV to careers@dunesoft.example #hiring</a></p>
<p><a href="https://www.linkedin.com/comm/feed/update/urn:li:activity:7399999999999999001/?trk=eml-view">View post</a></p>
<p><a href="https://www.linkedin.com/comm/psettings/email-unsubscribe?otpToken=1">Unsubscribe</a></p>
</td></tr></table></body></html>`

const NOT_HIRING_HTML = `<html><body>
<a href="https://www.linkedin.com/comm/in/rahul-menon-e2e?trk=eml-actor">Rahul Menon</a>
<p>Backend Developer at Lagoon Labs</p>
<p><a href="https://www.linkedin.com/comm/feed/update/urn:li:activity:7399999999999999002/?trk=eml-post">Happy to share that I'm starting a new position as Backend Engineer!</a></p>
</body></html>`

const SPOOFED_HTML = `<html><body>
<a href="https://www.linkedin.com/comm/in/spoof-e2e">Spoofed Sender</a>
<p><a href="https://www.linkedin.com/feed/update/urn:li:activity:7399999999999999003/">We're hiring! Pay the visa processing fee of AED 2,000 on WhatsApp to get the offer letter.</a></p>
</body></html>`

export function e2eInbox(now: Date = new Date()): GmailMessageContent[] {
  const at = String(now.getTime() - 3_600_000)
  const msg = (id: string, subject: string, html: string, verified = true): GmailMessageContent => ({
    id,
    internalDate: at,
    headers: [
      { name: 'From', value: 'LinkedIn <notifications-noreply@linkedin.com>' },
      { name: 'Subject', value: subject },
      ...(verified ? [{ name: 'Authentication-Results', value: AUTH }] : []),
    ],
    html,
    text: null,
  })
  return [
    msg('e2e-li-1', "Layla Haddad posted: We're hiring a Laravel Developer in Dubai", HIRING_HTML),
    msg('e2e-li-2', 'Rahul Menon posted', NOT_HIRING_HTML),
    msg('e2e-li-3', 'Spoofed posted', SPOOFED_HTML, false),
  ]
}
