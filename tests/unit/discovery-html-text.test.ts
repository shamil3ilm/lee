import { describe, expect, it } from 'vitest'
import { decodeEntities, enrichSome, htmlToText, workModeOf } from '@/lib/discovery/adapters/html-text'

describe('htmlToText', () => {
  it('turns markup into plain lines with list bullets', () => {
    const html = '<h2>About</h2><p>Build <b>payments</b> APIs.</p><ul><li>PHP &amp; Laravel</li><li>MySQL</li></ul>'
    expect(htmlToText(html)).toBe('About\nBuild payments APIs.\n\n- PHP & Laravel\n- MySQL')
  })

  it('decodes entity-escaped HTML (Greenhouse, SuccessFactors)', () => {
    const escaped = '&lt;div class=&quot;content&quot;&gt;&lt;p&gt;Riyadh team &amp;amp; Dubai&lt;/p&gt;&lt;p&gt;Arabic &amp;#39;a plus&amp;#39;&lt;/p&gt;&lt;/div&gt;'
    expect(htmlToText(escaped)).toBe("Riyadh team & Dubai\nArabic 'a plus'")
  })

  it('drops scripts and styles, keeps Arabic text, and caps length', () => {
    expect(htmlToText('<style>p{}</style><p>مطور خلفية في الرياض</p><script>x()</script>')).toBe('مطور خلفية في الرياض')
    expect(htmlToText(`<p>${'a'.repeat(50)}</p>`, 10)).toHaveLength(10)
    expect(htmlToText(null)).toBe('')
  })

  it('decodes numeric and named entities', () => {
    expect(decodeEntities('&#8211; &#x2014; &nbsp;&rsquo;')).toBe('– —  ’'.replace(' ', ' '))
    expect(decodeEntities('&unknown; &#0;')).toBe('&unknown; &#0;')
  })
})

describe('workModeOf', () => {
  it.each([
    ['Remote', 'remote'],
    ['Dubai (Hybrid)', 'hybrid'],
    ['On-site', 'onsite'],
    ['Riyadh Office', 'unknown'],
    [null, 'unknown'],
  ] as const)('%s → %s', (text, mode) => {
    expect(workModeOf(text)).toBe(mode)
  })
})

describe('enrichSome', () => {
  it('enriches at most `max` items and keeps failures as they were', async () => {
    const seen: number[] = []
    const out = await enrichSome([1, 2, 3, 4], 3, 2, async (n) => {
      seen.push(n)
      if (n === 2) throw new Error('detail down')
      return n * 10
    })
    expect(out).toEqual([10, 2, 30, 4])
    expect(seen.sort()).toEqual([1, 2, 3])
  })

  it('handles an empty list', async () => {
    expect(await enrichSome([], 5, 3, async (n: number) => n)).toEqual([])
  })
})
