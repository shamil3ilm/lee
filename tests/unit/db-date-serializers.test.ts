import { describe, expect, it } from 'vitest'
import { DATE_TYPE_OIDS, installDateSerializers } from '@/lib/db/date-serializers'

// drizzle's postgres-js driver replaces the timestamp/date serializers with a
// pass-through, so a JS Date bound in raw sql`` reached postgres-js as an
// object and failed in production ("The "string" argument must be of type
// string … Received an instance of Date"). PGlite accepts Dates, so tests
// never saw it. installDateSerializers restores Date → ISO string.
function fakeClient() {
  const passThrough = (v: unknown) => v
  const serializers: Record<string, (v: unknown) => unknown> = {}
  for (const oid of DATE_TYPE_OIDS) serializers[oid] = passThrough
  return { options: { serializers } }
}

describe('installDateSerializers', () => {
  it('serializes Date params as ISO strings for every date/time type', () => {
    const client = fakeClient()
    installDateSerializers(client)
    const d = new Date('2026-07-16T08:24:52.687Z')
    for (const oid of DATE_TYPE_OIDS) {
      expect(client.options.serializers[oid]!(d)).toBe('2026-07-16T08:24:52.687Z')
    }
  })

  it('passes strings and other values through unchanged', () => {
    const client = fakeClient()
    installDateSerializers(client)
    const ser = client.options.serializers['1184']!
    expect(ser('2026-07-16')).toBe('2026-07-16')
    expect(ser(null)).toBe(null)
  })
})
