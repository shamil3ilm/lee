import { describe, it, expect } from 'vitest'
import { isOpenRouterFree, parseModelList } from '@/lib/lab/providers/models'

describe('parseModelList', () => {
  it('groq: reads context_window, drops inactive and non-chat models, recommended first', () => {
    const models = parseModelList('groq', {
      object: 'list',
      data: [
        { id: 'whisper-large-v3', context_window: 448, active: true },
        { id: 'zeta-model', context_window: 8192, active: true },
        { id: 'openai/gpt-oss-20b', context_window: 131072, active: true },
        { id: 'old-model', active: false },
      ],
    })
    expect(models.map((m) => m.id)).toEqual(['openai/gpt-oss-20b', 'zeta-model'])
    expect(models[0]).toMatchObject({ contextLength: 131072, recommended: true, free: true })
  })

  it('openrouter: marks :free and zero-priced models free, uses name as label', () => {
    const models = parseModelList('openrouter', {
      data: [
        { id: 'a/paid', name: 'Paid', context_length: 1000, pricing: { prompt: '0.000001', completion: '0.000002' } },
        { id: 'b/zero', name: 'Zero', context_length: 2000, pricing: { prompt: '0', completion: '0' } },
        { id: 'c/model:free', name: 'Free', pricing: { prompt: '0.1', completion: '0.1' } },
      ],
    })
    const byId = Object.fromEntries(models.map((m) => [m.id, m]))
    expect(byId['a/paid']?.free).toBe(false)
    expect(byId['b/zero']?.free).toBe(true)
    expect(byId['c/model:free']?.free).toBe(true)
    expect(byId['b/zero']?.label).toBe('Zero')
    // free before paid
    expect(models.at(-1)?.id).toBe('a/paid')
  })

  it('google: strips the models/ prefix and drops embedding/imagen models', () => {
    const models = parseModelList('google', {
      object: 'list',
      data: [
        { id: 'models/gemini-2.5-flash', object: 'model' },
        { id: 'models/text-embedding-004' },
        { id: 'models/imagen-3.0-generate-002' },
      ],
    })
    expect(models.map((m) => m.id)).toEqual(['gemini-2.5-flash'])
    expect(models[0]?.recommended).toBe(true)
  })

  it('huggingface: reads context length from providers[]', () => {
    const models = parseModelList('huggingface', {
      data: [{ id: 'org/m', providers: [{ provider: 'x', context_length: 32768 }] }],
    })
    expect(models[0]).toMatchObject({ id: 'org/m', contextLength: 32768 })
    expect(models[0]?.free).toBeUndefined()
  })

  it('cerebras: plain OpenAI list', () => {
    const models = parseModelList('cerebras', { object: 'list', data: [{ id: 'gpt-oss-120b', owned_by: 'Cerebras' }] })
    expect(models).toEqual([{ id: 'gpt-oss-120b', label: 'gpt-oss-120b', free: true, contextLength: undefined, recommended: true }])
  })

  it('tolerates garbage and duplicates', () => {
    expect(parseModelList('groq', null)).toEqual([])
    expect(parseModelList('groq', { data: [{ id: 1 }, {}, null] })).toEqual([])
    expect(parseModelList('cerebras', { data: [{ id: 'a' }, { id: 'a' }] })).toHaveLength(1)
  })
})

describe('isOpenRouterFree', () => {
  it('handles numeric and missing pricing', () => {
    expect(isOpenRouterFree({ id: 'x', pricing: { prompt: 0, completion: 0 } })).toBe(true)
    expect(isOpenRouterFree({ id: 'x' })).toBe(false)
  })
})
