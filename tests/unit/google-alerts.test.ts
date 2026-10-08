import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { siteName, unwrapGoogleUrl } from '@/lib/google-alerts/links'
import { parseGoogleAlertEmail, parseGoogleAlertFeed } from '@/lib/google-alerts/parse'
import { verifyGoogleAlertSender } from '@/lib/google-alerts/sender'
import { suggestAlertQueries } from '@/lib/google-alerts/queries'
import { GoogleAlertsAdapter, googleAlertsConfigSchema, type GoogleAlertsDeps } from '@/lib/discovery/adapters/google-alerts'
import type { GmailMessageContent } from '@/lib/gmail/adapter'

const FEED = readFileSync(join(__dirname, '../fixtures/google-alerts/feed.xml'), 'utf8')
const wrap = (target: string): string => `https://www.google.com/url?rct=j&sa=t&url=${encodeURIComponent(target)}&ct=ga&cd=X&usg=Y`

/** A synthetic Google Alerts email (structure only; no real person). */
const HTML = `<html><body><table>
<tr><td><a href="https://www.google.com/alerts?source=alertsmail">Google Alerts</a></td></tr>
<tr><td><div><a href="${wrap('https://jobs.lever.co/example/0f8fad5b-d9cb-469f-a165-70867728950e')}"><b>Laravel Developer</b> - Example Wallet</a>
<div>Example Wallet</div><div>Join our Riyadh team building wallet APIs with Laravel and MySQL.</div></div></td></tr>
<tr><td><div><a href="${wrap('https://www.example-careers.ae/jobs/123?utm_source=google')}">PHP Backend Engineer – Example Co</a>
<div>We are hiring in Dubai. Visa provided.</div></div></td></tr>
<tr><td><a href="${wrap('https://www.google.com/alerts/remove?s=abc')}">Flag as irrelevant</a>
<a href="https://www.google.com/alerts/feeds/1/2">See more results</a></td></tr>
</table></body></html>`

const TEXT = `Google Alerts

"Laravel developer" Dubai hiring
Daily update · October 8, 2026

NEWS

Laravel Developer - Example Pay
Example Pay
Build payment APIs in Laravel in Dubai.
<${wrap('https://boards.greenhouse.io/examplepay/jobs/4012345')}>

Unsubscribe
<https://www.google.com/alerts/remove?source=alertsmail>`

const AUTH_OK = 'mx.google.com; dkim=pass header.i=@google.com header.s=20230601; spf=pass smtp.mailfrom=googlealerts-noreply@google.com; dmarc=pass (p=REJECT) header.from=google.com'

describe('Google Alerts links', () => {
  it('unwraps google.com/url offline and strips tracking', () => {
    expect(unwrapGoogleUrl(wrap('https://www.example-careers.ae/jobs/123?utm_source=google&ref=x'))).toBe(
      'https://www.example-careers.ae/jobs/123?ref=x',
    )
    expect(unwrapGoogleUrl('https://www.google.com/url?q=https://example.com/a&sa=D')).toBe('https://example.com/a')
  })

  it('drops google.com-only links and non-web schemes', () => {
    expect(unwrapGoogleUrl(wrap('https://www.google.com/search?q=laravel'))).toBeNull()
    expect(unwrapGoogleUrl('https://www.google.com/alerts/remove?s=1')).toBeNull()
    expect(unwrapGoogleUrl(wrap('javascript:alert(1)'))).toBeNull()
  })

  it('names the site', () => {
    expect(siteName('https://careers.example-logistics.com/jobs/77')).toBe('example-logistics.com')
  })
})

describe('Google Alerts sender check', () => {
  it('needs the Google Alerts sender and a DMARC/DKIM pass for google.com from mx.google.com', () => {
    expect(verifyGoogleAlertSender('googlealerts-noreply@google.com', [AUTH_OK])).toBe(true)
    expect(verifyGoogleAlertSender('googlealerts-noreply@google.com', ['mx.google.com; dkim=fail; dmarc=fail header.from=google.com'])).toBe(false)
    expect(verifyGoogleAlertSender('alerts@evil.example', [AUTH_OK])).toBe(false)
    expect(verifyGoogleAlertSender('googlealerts-noreply@google.com', [AUTH_OK.replace('mx.google.com', 'mx.evil.example')])).toBe(false)
  })
})

describe('parsing', () => {
  it('reads results from the HTML email, without Google furniture', () => {
    const items = parseGoogleAlertEmail({ html: HTML })
    expect(items.map((i) => i.title)).toEqual(['Laravel Developer - Example Wallet', 'PHP Backend Engineer – Example Co'])
    expect(items[0]!.url).toBe('https://jobs.lever.co/example/0f8fad5b-d9cb-469f-a165-70867728950e')
    expect(items[0]!.snippet).toContain('wallet APIs with Laravel')
    expect(items[1]!.url).toBe('https://www.example-careers.ae/jobs/123')
  })

  it('falls back to the plain-text email', () => {
    const items = parseGoogleAlertEmail({ text: TEXT })
    expect(items).toEqual([
      {
        title: 'Laravel Developer - Example Pay',
        url: 'https://boards.greenhouse.io/examplepay/jobs/4012345',
        snippet: 'Example Pay Build payment APIs in Laravel in Dubai.',
      },
    ])
  })

  it('reads the RSS (Atom) feed', () => {
    const items = parseGoogleAlertFeed(FEED)
    expect(items.map((i) => i.title)).toEqual(['Laravel Developer - Example Pay - Dubai', 'Backend Engineer (PHP) | Example Logistics'])
    expect(items[1]!.url).toBe('https://careers.example-logistics.com/jobs/77')
    expect(items[0]!.publishedAt?.toISOString()).toBe('2026-10-07T09:00:00.000Z')
  })
})

describe('suggested queries', () => {
  it('builds role × place queries, a visa query and careers-site queries, with nothing personal', () => {
    const q = suggestAlertQueries({
      roleFamilies: ['backend', 'data_analyst'],
      customRoles: [],
      regions: ['AE', 'SA'],
      strengths: ['laravel'],
      careersHosts: ['careers.example-airline.com'],
      needsVisa: true,
    })
    expect(q).toContain('"Laravel developer" (Dubai OR "Abu Dhabi") hiring')
    expect(q).toContain('"data analyst" (Riyadh OR Jeddah) hiring')
    expect(q).toContain('"Laravel developer" (Dubai OR "Abu Dhabi") "visa sponsorship"')
    expect(q).toContain('careers site:careers.example-airline.com')
    expect(q.join(' ')).not.toMatch(/@|\+\d{6,}/)
  })
})

function deps(over: Partial<GoogleAlertsDeps> = {}): GoogleAlertsDeps {
  const msg: GmailMessageContent = {
    id: 'm1',
    internalDate: '1791446400000',
    headers: [
      { name: 'From', value: 'Google Alerts <googlealerts-noreply@google.com>' },
      { name: 'Authentication-Results', value: AUTH_OK },
    ],
    html: HTML,
    text: null,
  }
  return {
    getTokens: async () => ({ access_token: 't' }) as never,
    listMessageIds: vi.fn(async () => [{ id: 'm1', threadId: 't1' }]) as never,
    getMessageContent: vi.fn(async () => msg) as never,
    fetchFeed: vi.fn(async () => FEED),
    fetchJd: vi.fn(async () => '## Requirements\n- PHP and Laravel\n- MySQL'),
    existingUrls: vi.fn(async () => new Set<string>()),
    ...over,
  }
}

describe('GoogleAlertsAdapter (offline)', () => {
  it('merges email and RSS results, enriches ATS links with the full JD, leaves the rest title-only', async () => {
    const d = deps()
    const items = await new GoogleAlertsAdapter(d).fetch({ rssUrl: 'https://www.google.com/alerts/feeds/12345678901234567890/09876543210987654321' }, { userId: 'u1' })
    expect(items).toHaveLength(4)
    const lever = items.find((i) => (i.normalized as { applyUrl: string }).applyUrl.includes('lever.co'))!
    expect((lever.normalized as { descriptionMd: string }).descriptionMd).toContain('PHP and Laravel')
    const plain = items.find((i) => (i.normalized as { applyUrl: string }).applyUrl.includes('example-careers.ae'))!
    expect((plain.normalized as { descriptionMd: string }).descriptionMd).toBe('We are hiring in Dubai. Visa provided.')
    expect((plain.normalized as { tags: string[] }).tags).toContain('via:google_alerts')
    expect(d.fetchFeed).toHaveBeenCalledTimes(1)
  })

  it('skips links the user already has from another source, and unverified emails', async () => {
    const d = deps({
      existingUrls: vi.fn(async (_u: string, urls: readonly string[]) => new Set(urls.filter((u) => u.includes('lever.co')))),
    })
    const items = await new GoogleAlertsAdapter(d).fetch({}, { userId: 'u1' })
    expect(items.map((i) => (i.normalized as { applyUrl: string }).applyUrl)).toEqual(['https://www.example-careers.ae/jobs/123'])
    const forged = deps({
      getMessageContent: vi.fn(async () => ({ id: 'm1', internalDate: '0', headers: [{ name: 'From', value: 'googlealerts-noreply@google.com' }], html: HTML, text: null })) as never,
    })
    expect(await new GoogleAlertsAdapter(forged).fetch({}, { userId: 'u1' })).toEqual([])
  })

  it('accepts only Google Alerts feed URLs', () => {
    expect(googleAlertsConfigSchema.safeParse({ rssUrl: 'https://www.google.com/alerts/feeds/12345678901234567890/09876543210987654321' }).success).toBe(true)
    expect(googleAlertsConfigSchema.safeParse({ rssUrl: 'http://169.254.169.254/latest' }).success).toBe(false)
    expect(googleAlertsConfigSchema.safeParse({ rssUrl: 'https://evil.example/alerts/feeds/1/2' }).success).toBe(false)
  })
})
