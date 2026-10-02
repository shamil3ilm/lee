import { describe, expect, it } from 'vitest'
import { parseInline, parseMarkdownLite } from '@/lib/ui/markdown-lite'

describe('parseInline', () => {
  it('splits bold and code out of plain text', () => {
    expect(parseInline('Hire a **Senior Engineer** with `Go`.')).toEqual([
      { type: 'text', text: 'Hire a ' },
      { type: 'strong', text: 'Senior Engineer' },
      { type: 'text', text: ' with ' },
      { type: 'code', text: 'Go' },
      { type: 'text', text: '.' },
    ])
  })

  it('leaves unmatched markers as text', () => {
    expect(parseInline('5 * 3 and a **dangling')).toEqual([{ type: 'text', text: '5 * 3 and a **dangling' }])
  })
})

describe('parseMarkdownLite', () => {
  it('parses headings, paragraphs and lists', () => {
    const blocks = parseMarkdownLite(
      '## About the role\nWe are hiring.\nRemote OK.\n\n## Requirements\n- 6+ years\n- Postgres\n\n1. Apply\n2. Interview',
    )
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'heading', 'list', 'list'])
    expect(blocks[0]).toEqual({ type: 'heading', level: 2, inline: [{ type: 'text', text: 'About the role' }] })
    expect(blocks[1]).toMatchObject({ type: 'paragraph', lines: [[{ text: 'We are hiring.' }], [{ text: 'Remote OK.' }]] })
    expect(blocks[3]).toMatchObject({ type: 'list', ordered: false })
    expect(blocks[4]).toMatchObject({ type: 'list', ordered: true })
  })

  it('joins an indented continuation line onto the previous item', () => {
    const [list] = parseMarkdownLite('- Deep experience with\n  Kafka and AWS')
    expect(list).toEqual({
      type: 'list',
      ordered: false,
      items: [[{ type: 'text', text: 'Deep experience with' }, { type: 'text', text: ' Kafka and AWS' }]],
    })
  })

  it('splits a list when the list kind changes', () => {
    expect(parseMarkdownLite('- a\n1. b').map((b) => b.type)).toEqual(['list', 'list'])
  })

  it('handles CRLF and empty input', () => {
    expect(parseMarkdownLite('')).toEqual([])
    expect(parseMarkdownLite('# T\r\nbody')).toHaveLength(2)
  })
})
