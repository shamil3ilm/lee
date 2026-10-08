import { LOCKED_OFF } from '@/lib/variants/presets'
import type { Region } from '@/lib/variants/types'
import type { PhotoAdvice } from './advice'

/**
 * What to offer next to the advice, under the variant's own region rules
 * (lib/variants/presets LOCKED_OFF: Remote / US / EU and India never show a
 * photo, whatever the advice says):
 *   switch_to_gcc_photo  advice Recommended, a photo is uploaded, but this
 *                        variant does not place it → "Use the photo version"
 *                        (a GCC variant with Photo on, created if needed)
 *   upload               advice Recommended, no photo uploaded yet → link to
 *                        Settings › Résumé with guidance
 *   turn_off             advice Avoid, but this variant places the photo
 *   none                 nothing to change
 */

export type PhotoActionKind = 'switch_to_gcc_photo' | 'upload' | 'turn_off' | 'none'

export interface PhotoAction {
  kind: PhotoActionKind
  note: string
}

export interface VariantPhotoState {
  region: Region
  /** The variant's Photo field (before the region lock). */
  photoOn: boolean
}

export const PHOTO_GUIDANCE = 'Use a recent, professional head-and-shoulders shot on a plain background, facing the camera.'

export function regionAllowsPhoto(region: Region): boolean {
  return !LOCKED_OFF[region].includes('photo')
}

export function photoAction(advice: PhotoAdvice, variant: VariantPhotoState | null, hasPhoto: boolean): PhotoAction {
  const places = variant !== null && variant.photoOn && regionAllowsPhoto(variant.region)
  if (advice.advice === 'recommended') {
    if (!hasPhoto) return { kind: 'upload', note: `Add a profile photo in Settings › Résumé. ${PHOTO_GUIDANCE}` }
    if (places) return { kind: 'none', note: 'This variant already shows your photo.' }
    const note =
      variant && !regionAllowsPhoto(variant.region)
        ? 'This variant never shows a photo (Remote / US / EU and India rules). Use a GCC variant with the photo on.'
        : 'Use a GCC variant with your photo on.'
    return { kind: 'switch_to_gcc_photo', note }
  }
  if (advice.advice === 'avoid' && places) {
    return { kind: 'turn_off', note: 'This variant shows your photo. Pick one without it for this job.' }
  }
  return { kind: 'none', note: '' }
}
