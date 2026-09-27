import { describe, expect, it } from 'vitest'
import { verifyAlertSender } from '@/lib/email-alerts/sender'

const pass = (domain: string): string =>
  `mx.google.com; dkim=pass header.i=@${domain} header.s=s1 header.b=abc; spf=pass (google.com: domain of x@${domain}) smtp.mailfrom=x@${domain}; dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=${domain}`

describe('verifyAlertSender', () => {
  it('accepts a known sender with a passing Google DMARC / DKIM result', () => {
    expect(verifyAlertSender('jobalerts-noreply@linkedin.com', [pass('linkedin.com')])?.site.id).toBe('linkedin')
    expect(verifyAlertSender('alert@match.indeed.com', [pass('indeed.com')])?.site.id).toBe('indeed')
  })

  it('accepts DKIM alone from a subdomain of the site', () => {
    const r = 'mx.google.com; dkim=pass header.i=@mailer.naukri.com header.s=k1; spf=softfail; dmarc=fail header.from=naukri.com'
    expect(verifyAlertSender('naukrialerts@naukri.com', [r])?.site.id).toBe('naukri')
  })

  it('rejects a forged From (no auth results, failing results, or another domain signed it)', () => {
    expect(verifyAlertSender('alert@indeed.com', [])).toBeNull()
    expect(
      verifyAlertSender('alert@indeed.com', ['mx.google.com; dkim=fail header.i=@indeed.com; dmarc=fail header.from=indeed.com']),
    ).toBeNull()
    expect(verifyAlertSender('alert@indeed.com', [pass('evil.example')])).toBeNull()
  })

  it('ignores Authentication-Results not added by Google (a sender can write its own)', () => {
    expect(verifyAlertSender('alert@indeed.com', ['evil.example; dkim=pass header.i=@indeed.com'])).toBeNull()
  })

  it('rejects unknown and look-alike senders', () => {
    expect(verifyAlertSender('jobs@example.com', [pass('example.com')])).toBeNull()
    expect(verifyAlertSender('alert@notindeed.com', [pass('notindeed.com')])).toBeNull()
    expect(verifyAlertSender(undefined, [])).toBeNull()
  })
})
