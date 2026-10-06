import { describe, expect, it } from 'vitest'
import { classifyLabError, friendlyLabError, providerLabel } from '@/lib/lab/friendly-error'
import { MissingKeyError, ProviderError, RateLimitedError } from '@/lib/lab/providers/errors'
import { errorFromResponse, type Endpoint } from '@/lib/lab/providers/openai-compatible'

const ep: Endpoint = { provider: 'google', baseUrl: 'https://example.test', apiKey: 'AIzaFAKEKEY0000000000000000' }

describe('classifyLabError', () => {
  it('maps typed provider errors to kinds', () => {
    expect(classifyLabError(new RateLimitedError('slow down'))).toBe('rate_limited')
    expect(classifyLabError(new MissingKeyError('Groq'))).toBe('missing_key')
    expect(classifyLabError(new ProviderError('x', { code: 'auth' }))).toBe('auth')
    expect(classifyLabError(new ProviderError('x', { code: 'timeout' }))).toBe('timeout')
    expect(classifyLabError(new ProviderError('x', { code: 'network' }))).toBe('network')
    expect(classifyLabError(new ProviderError('x', { status: 400, code: 'bad_request' }))).toBe('bad_request')
    expect(classifyLabError(new ProviderError('x', { status: 503 }))).toBe('unavailable')
    expect(classifyLabError(new Error('boom'))).toBe('error')
  })
})

describe('friendlyLabError', () => {
  it('never echoes the raw status line and names the provider by label', () => {
    const f = friendlyLabError('bad_request', 'google')
    expect(f.title).toBe('Request rejected')
    expect(f.message).toMatch(/^Google AI Studio could not run this request/)
    expect(f.message).not.toMatch(/\b400\b/)
  })

  it('keeps advice generic when the provider is hidden (blind runs)', () => {
    expect(friendlyLabError('auth', null).message).toMatch(/^The provider did not accept the API key/)
    expect(friendlyLabError(undefined).title).toBe('Model call failed')
  })

  it('falls back to the raw id for unknown providers', () => {
    expect(providerLabel('acme')).toBe('acme')
  })
})

describe('errorFromResponse', () => {
  it('treats a 400 "API key not valid" as a rejected key', async () => {
    const res = new Response(JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.' } }), {
      status: 400,
    })
    const err = await errorFromResponse(res, ep)
    expect(err.code).toBe('auth')
    expect(classifyLabError(err)).toBe('auth')
  })

  it('keeps other 400s as bad requests with the redacted message as detail', async () => {
    const res = new Response(JSON.stringify({ error: { message: 'max_tokens is too large' } }), { status: 400 })
    const err = await errorFromResponse(res, ep)
    expect(err.code).toBe('bad_request')
    expect(err.message).toBe('google returned 400: max_tokens is too large')
  })
})
