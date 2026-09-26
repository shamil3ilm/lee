import type { VitalMetric } from './metrics'

/**
 * Field values of a vitals beacon, free of zod so the browser reporter can
 * import them. The schema that validates them is in ./beacon.ts.
 */

export const DEVICE_CLASSES = ['mobile', 'tablet', 'desktop'] as const
export type DeviceClass = (typeof DEVICE_CLASSES)[number]

// navigator.connection.effectiveType, plus 'unknown' where the API is absent
// (Safari, Firefox).
export const CONNECTION_TYPES = ['slow-2g', '2g', '3g', '4g', 'unknown'] as const
export type ConnectionType = (typeof CONNECTION_TYPES)[number]

// web-vitals' navigationType values as Next reports them.
export const NAVIGATION_TYPES = [
  'navigate',
  'reload',
  'back-forward',
  'back-forward-cache',
  'prerender',
  'restore',
] as const
export type NavigationType = (typeof NAVIGATION_TYPES)[number]

export interface BeaconMetric {
  name: VitalMetric
  value: number
}

export interface VitalsBeacon {
  route: string
  navigationType: NavigationType
  device: DeviceClass
  connection: ConnectionType
  metrics: BeaconMetric[]
}
