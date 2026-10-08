/**
 * drizzle's postgres-js driver swaps postgres-js's serializers for the
 * date/time types with a pass-through (drizzle formats its own column values
 * as strings). A JS Date bound directly in raw sql`` — e.g.
 * `created_at >= ${since}` — is inferred by postgres-js as timestamptz and
 * then reaches the wire as an object, failing with ERR_INVALID_ARG_TYPE.
 * PGlite accepts Dates, so only production (Neon) broke.
 *
 * Install after drizzle() has constructed the client: Dates become ISO
 * strings; everything else (drizzle's own strings, null) is unchanged.
 */
export const DATE_TYPE_OIDS = ['1184', '1082', '1083', '1114', '1182', '1185', '1115', '1231'] as const

interface SerializerHost {
  options: { serializers: Record<string, (value: unknown) => unknown> }
}

export function installDateSerializers(client: SerializerHost): void {
  for (const oid of DATE_TYPE_OIDS) {
    const previous = client.options.serializers[oid]
    client.options.serializers[oid] = (value: unknown) =>
      value instanceof Date ? value.toISOString() : previous ? previous(value) : value
  }
}
