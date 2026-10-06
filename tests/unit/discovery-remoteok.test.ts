import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RemoteOkAdapter } from '@/lib/discovery/adapters/remoteok'
import { getAdapter } from '@/lib/discovery/adapters'

const fixture = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/discovery/remoteok.json'), 'utf8'),
)

describe('RemoteOkAdapter', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('skips the metadata element and normalizes jobs', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(fixture), { status: 200 }),
    ) as typeof globalThis.fetch

    const items = await new RemoteOkAdapter().fetch({})
    // fixture has 1 metadata + 3 jobs => expect 3
    expect(items.length).toBe(3)
    const first = items[0]!.normalized as {
      title: string
      companyName: string
      applyUrl: string
      remoteType: string
      techStack: string[]
    }
    expect(first.title).toBe('Senior Backend Engineer')
    expect(first.companyName).toBe('Acme')
    expect(first.remoteType).toBe('remote')
    expect(first.techStack).toContain('go')
  })

  it('propagates HTTP errors', async () => {
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 500 })) as typeof globalThis.fetch
    await expect(new RemoteOkAdapter().fetch({})).rejects.toThrow(/remoteok 500/)
  })

  describe('international text', () => {
    const intl = readFileSync(join(__dirname, '../fixtures/discovery/remoteok-intl.json'))
    const doubled = readFileSync(join(__dirname, '../fixtures/discovery/remoteok-intl-double-encoded.json'))
    const serve = (body: BodyInit, contentType = 'application/json') => {
      globalThis.fetch = vi.fn(async () =>
        new Response(body, { status: 200, headers: { 'content-type': contentType } }),
      ) as typeof globalThis.fetch
    }
    const norm = (items: Awaited<ReturnType<RemoteOkAdapter['fetch']>>) =>
      items.map((i) => i.normalized as { title: string; companyName: string; location: string; descriptionMd: string; techStack: string[] })

    const EXPECTED = [
      { title: 'Ingénieur Backend Senior', companyName: 'Société Générale Tech', location: 'دبي، الإمارات' },
      { title: 'Senior Software Engineer', companyName: 'Zürich Fintech AG', location: 'Zürich, Schweiz' },
      { title: 'مهندس برمجيات', companyName: 'شركة الرياض', location: 'الرياض' },
    ]

    it('keeps correctly encoded Arabic and accented text intact', async () => {
      serve(intl)
      const jobs = norm(await new RemoteOkAdapter().fetch({}))
      expect(jobs).toMatchObject(EXPECTED)
      expect(jobs[0]!.techStack).toEqual(['go', 'élixir'])
    })

    it('repairs double-encoded strings at the source', async () => {
      serve(doubled)
      const jobs = norm(await new RemoteOkAdapter().fetch({}))
      expect(jobs).toMatchObject(EXPECTED)
      expect(jobs[0]!.descriptionMd).toBe('Équipe à Dubaï — café offert. Nous cherchons un·e ingénieur·e.')
      expect(jobs[1]!.descriptionMd).toBe('Über uns: we ship “payments” in São Paulo too.')
      expect(jobs[2]!.descriptionMd).toBe('نبحث عن مهندس خلفية.')
      for (const j of jobs) expect(`${j.title} ${j.companyName} ${j.location} ${j.descriptionMd}`).not.toMatch(/[ÃØÙ]./)
    })

    it('honours a declared non-UTF-8 charset', async () => {
      // "Zürich" in ISO-8859-1: ü is the single byte 0xFC.
      const json = '[{"legal":"x"},{"id":"9","position":"Ingénieur","company":"Zürich AG","location":"Zürich"}]'
      const latin1 = Uint8Array.from(json, (c) => c.charCodeAt(0))
      serve(latin1, 'application/json; charset=ISO-8859-1')
      expect(norm(await new RemoteOkAdapter().fetch({}))).toMatchObject([
        { title: 'Ingénieur', companyName: 'Zürich AG', location: 'Zürich' },
      ])
    })

    it('falls back to Windows-1252 when undeclared bytes are not UTF-8', async () => {
      const json = '[{"legal":"x"},{"id":"9","position":"Café Lead","company":"Résumé Co","location":"São Paulo"}]'
      serve(Uint8Array.from(json, (c) => c.charCodeAt(0)))
      expect(norm(await new RemoteOkAdapter().fetch({}))).toMatchObject([
        { title: 'Café Lead', companyName: 'Résumé Co', location: 'São Paulo' },
      ])
    })

    it('still leaves the gate-time repair helper working as a fallback', async () => {
      const { normalizeForMatch } = await import('@/lib/discovery/relevance/text')
      expect(normalizeForMatch('Ø¯Ø¨ÙŠ')).toBe(normalizeForMatch('دبي'))
    })
  })

  it('registry returns adapter', () => {
    expect(getAdapter('remoteok')).toBeInstanceOf(RemoteOkAdapter)
  })
})
