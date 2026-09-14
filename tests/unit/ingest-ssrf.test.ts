import { describe, it, expect } from 'vitest'
import { assertSafeUrl } from '@/lib/ingest/ssrf'

describe('assertSafeUrl', () => {
  it('accepts https://example.com', () => expect(() => assertSafeUrl('https://example.com')).not.toThrow())
  it('rejects http://', () => expect(() => assertSafeUrl('http://example.com')).toThrow())
  it('rejects file://', () => expect(() => assertSafeUrl('file:///etc/passwd')).toThrow())
  it('rejects localhost', () => expect(() => assertSafeUrl('https://localhost/x')).toThrow())
  it('rejects 127.0.0.1', () => expect(() => assertSafeUrl('https://127.0.0.1')).toThrow())
  it('rejects RFC1918 10.x', () => expect(() => assertSafeUrl('https://10.0.0.1')).toThrow())
  it('rejects RFC1918 192.168.x', () => expect(() => assertSafeUrl('https://192.168.1.1')).toThrow())
  it('rejects link-local 169.254.x', () => expect(() => assertSafeUrl('https://169.254.169.254')).toThrow())
})
