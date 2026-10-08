/** Client-safe photo advice vocabulary (the rules live in ./advice.ts). */
export type PhotoVerdict = 'recommended' | 'optional' | 'avoid'

export const PHOTO_LABELS: Readonly<Record<PhotoVerdict, string>> = {
  recommended: 'Recommended',
  optional: 'Optional',
  avoid: 'Avoid',
}
