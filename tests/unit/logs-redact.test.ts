import { describe, expect, it } from 'vitest'
import { MAX_CONTEXT_BYTES, redactText, sanitizeContext } from '@/lib/logs/redact'
import { categoryFor, messageFor, shouldPersist, stringKeysFor, toEventName } from '@/lib/logs/catalog'

const ALL = new Set(['err', 'note', 'list'])

describe('redactText: secrets', () => {
  const cases: Array<[string, string, RegExp]> = [
    ['Groq key', 'key gsk_abcDEF1234567890xyz failed', /gsk_/],
    ['Google API key', 'bad key AIzaSyA-1234567890abcdefghijklmnop', /AIza/],
    ['OpenAI / Anthropic key', 'rejected sk-proj-abc123DEF456ghi and sk-ant-api03-xyz987', /sk-(proj|ant)/],
    ['GitHub token', 'ghp_1234567890abcdefABCDEF1234567890abcd and github_pat_11ABCDEF_xyz', /ghp_|github_pat_/],
    ['JWT', 'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.sflKxwRJSMeKKF2QT4fwpMeJf36POk6y', /eyJ/],
    ['Bearer header', 'Bearer ya29.a0AfH6SMBx-secret-value', /ya29/],
    ['Authorization header', 'authorization: Basic dXNlcjpwYXNz', /dXNlcjpwYXNz/],
    ['Cookie header', 'cookie: session=abc123; other=def', /abc123|def/],
    ['key=value', 'GET /x?ok=1 refresh_token=1//0abcdef', /1\/\/0abcdef/],
    ['query string', 'fetch https://api.example.com/v1/jobs?api_key=zzz&x=1 failed', /zzz|x=1/],
    ['long opaque string', `hash ${'a1B2'.repeat(12)} end`, /(a1B2){10}/],
  ]
  for (const [name, input, leaked] of cases) {
    it(`redacts a ${name}`, () => {
      const out = redactText(input)
      expect(out).not.toMatch(leaked)
      expect(out).toMatch(/redacted/)
    })
  }

  it('keeps UUIDs (row ids) and ordinary text', () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e'
    expect(redactText(`source ${id}: 500 Internal`)).toBe(`source ${id}: 500 Internal`)
  })
})

describe('redactText: emails and size', () => {
  it('reduces email addresses to their domain', () => {
    expect(redactText('Gmail said 500 for jane.doe+jobs@example.co.uk today')).toBe(
      'Gmail said 500 for *@example.co.uk today',
    )
  })

  it('collapses whitespace and truncates', () => {
    const out = redactText(`a\n\n  b ${'x '.repeat(400)}`, 50)
    expect(out.length).toBe(50)
    expect(out.startsWith('a b x')).toBe(true)
    expect(out.endsWith('…')).toBe(true)
  })
})

describe('sanitizeContext', () => {
  it('keeps numbers and booleans, strings only under allowed keys', () => {
    const out = sanitizeContext({ checked: 3, ok: true, err: 'boom for a@b.com', note: 'x', other: 'drop me' }, new Set(['err']))
    expect(out).toEqual({ checked: 3, ok: true, err: 'boom for *@b.com' })
  })

  it('never stores secret or content keys, even when allowed', () => {
    const out = sanitizeContext(
      {
        accessToken: 'x',
        apiKey: 'x',
        authorization: 'x',
        cookie: 'x',
        prompt: 'write me a cover letter',
        body: 'hello',
        snippet: 'hi',
        subject: 'Offer',
        content: 'CV text',
        text: 'CV text',
        stack: 'at x',
        email: 'a@b.com',
        token: 'x',
        refresh_token: 'x',
        tokens: 12,
      },
      new Set(['accessToken', 'prompt', 'body', 'snippet', 'subject', 'content', 'text', 'stack', 'email', 'token']),
    )
    // Token *counts* are usage numbers, not secrets.
    expect(out).toEqual({ tokens: 12 })
  })

  it('keeps flat numeric maps and short string lists', () => {
    const out = sanitizeContext(
      { metrics: { a: 1, b: 'x', nested: { c: 1 } }, list: ['one', 'two@x.io', 3] },
      ALL,
    )
    expect(out).toEqual({ metrics: { a: 1 }, list: ['one', '*@x.io', 3] })
  })

  it('caps the context at 2 KB, dropping the largest values first', () => {
    const big: Record<string, unknown> = { small: 1 }
    for (let i = 0; i < 12; i++) big[`k${i}`] = 'lorem ipsum '.repeat(24)
    const out = sanitizeContext(big, new Set(Object.keys(big)))
    expect(new TextEncoder().encode(JSON.stringify(out)).length).toBeLessThanOrEqual(MAX_CONTEXT_BYTES)
    expect(out.small).toBe(1)
    expect(out.truncated).toBe(true)
  })

  it('drops invalid keys, non-finite numbers and functions', () => {
    const out = sanitizeContext({ 'bad key': 1, n: Number.NaN, f: () => 1, ok: 2 }, ALL)
    expect(out).toEqual({ ok: 2 })
  })
})

describe('event catalog', () => {
  it('normalizes event names to snake_case', () => {
    expect(toEventName('addSource failed')).toBe('add_source_failed')
    expect(toEventName('POST /api/latex/compile failed')).toBe('post_api_latex_compile_failed')
    expect(toEventName('scam.assess_failed')).toBe('scam_assess_failed')
    expect(toEventName('!!!')).toBe('event')
  })

  it('persists warn/error always, info only for allow-listed run events, never debug', () => {
    expect(shouldPersist('warn', 'anything_at_all')).toBe(true)
    expect(shouldPersist('error', 'anything_at_all')).toBe(true)
    for (const e of ['queue_drain', 'cron_schedule', 'source_polled', 'gmail_sync_done', 'weekly_digest_sent', 'usage_snapshot', 'latex_compile']) {
      expect(shouldPersist('info', e)).toBe(true)
    }
    expect(shouldPersist('info', 'voice_transcribe_ok')).toBe(false)
    expect(shouldPersist('info', 'weekly_digest_re_rendered_on_drift')).toBe(false)
    expect(shouldPersist('debug', 'queue_drain')).toBe(false)
  })

  it('infers categories from names', () => {
    expect(categoryFor('queue_job_failed')).toBe('job')
    expect(categoryFor('cron_drain_failed')).toBe('cron')
    expect(categoryFor('gmail_sync_thread_failed')).toBe('gmail')
    expect(categoryFor('push_to_calendar_failed')).toBe('calendar')
    expect(categoryFor('drive_api_error')).toBe('drive')
    expect(categoryFor('post_api_latex_compile_failed')).toBe('latex')
    expect(categoryFor('generate_cover_letter_failed')).toBe('ai')
    expect(categoryFor('add_source_failed')).toBe('source')
    expect(categoryFor('usage_neon_failed')).toBe('usage')
    expect(categoryFor('sign_in_event_token_refresh_failed')).toBe('auth')
    expect(categoryFor('update_expense_failed')).toBe('app')
  })

  it('builds short messages from sanitized context', () => {
    expect(messageFor('gmail_sync_done', { checked: 40, matched: 2 })).toBe('Gmail synced: 40 checked · 2 matched')
    expect(messageFor('update_expense_failed', { err: 'db down' })).toBe('Update expense failed: db down')
    expect(stringKeysFor('source_polled').has('source')).toBe(true)
    expect(stringKeysFor('update_expense_failed').has('source')).toBe(false)
  })
})
