import { z } from 'zod'
import { VITAL_METRICS } from './metrics'
import { MAX_ROUTE_LENGTH, ROUTE_PATTERN_RE } from './route-pattern'
import {
  CONNECTION_TYPES,
  DEVICE_CLASSES,
  NAVIGATION_TYPES,
  type VitalsBeacon,
} from './beacon-fields'

export * from './beacon-fields'

/**
 * The body of a `POST /api/vitals` beacon: one page load's metrics, batched.
 * Validated server side only: this module imports zod, so browser code takes
 * the field lists from ./beacon-fields instead (keeps zod out of the bundle).
 */

/** Hard cap on a beacon body, checked before parsing. */
export const MAX_BEACON_BYTES = 4096
export const MAX_METRICS_PER_BEACON = 10

// 10 minutes: anything slower is a backgrounded tab or a clock glitch.
const MAX_MS = 600_000
const MAX_CLS = 100

const metricSchema = z
  .object({
    name: z.enum(VITAL_METRICS),
    value: z.number().min(0),
  })
  .refine((m) => m.value <= (m.name === 'CLS' ? MAX_CLS : MAX_MS), {
    message: 'value out of range',
  })

export const beaconSchema = z.object({
  route: z.string().max(MAX_ROUTE_LENGTH).regex(ROUTE_PATTERN_RE),
  navigationType: z.enum(NAVIGATION_TYPES),
  device: z.enum(DEVICE_CLASSES),
  connection: z.enum(CONNECTION_TYPES),
  metrics: z.array(metricSchema).min(1).max(MAX_METRICS_PER_BEACON),
})

// The parsed shape must stay identical to the zod-free interface.
type Parsed = z.infer<typeof beaconSchema>
const _sameShape: [Parsed] extends [VitalsBeacon] ? ([VitalsBeacon] extends [Parsed] ? true : never) : never = true
void _sameShape
