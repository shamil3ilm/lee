import * as appsQ from '@/lib/db/queries/applications'
import type { ApplicationWithJob } from '@/lib/db/queries/applications'
import * as prepsQ from '@/lib/db/queries/applicationPreps'
import * as variantsQ from '@/lib/db/queries/resumeVariants'
import { confirmVariant } from '@/lib/apply/prepare'
import { getResumeProfile } from '@/lib/resume/service'
import { getProfilePhoto } from '@/lib/resume/photo-store'
import { buildRecipe } from '@/lib/variants/presets'
import { chooseVariantForApplication, VariantError } from '@/lib/variants/service'
import { recipeSchema } from '@/lib/variants/types'
import { fitsFor, fitContext } from '../context'
import { applicationJob, loadVariantsForFit } from '../service'
import { photoAdvice, type PhotoAdvice } from './advice'
import { photoAction, type PhotoAction } from './variant'

/**
 * Photo advice for an application (Prepare step 1, the variant picker) and
 * "Use the photo version": switch to a GCC variant that places the photo —
 * the best-fitting one the user has, else a copy of their best GCC variant
 * with Photo on (named "… · Photo"), else a fresh GCC preset with Photo on.
 * Remote / US / EU and India variants never get a photo (region locks).
 */

export interface PhotoView {
  advice: PhotoAdvice
  action: PhotoAction
  hasPhoto: boolean
}

export function photoJobOf(app: Pick<ApplicationWithJob, 'job'>): Parameters<typeof photoAdvice>[0] {
  return {
    title: app.job.title,
    location: app.job.location,
    remoteType: app.job.remoteType,
    companyName: app.job.company?.name ?? null,
    descriptionMd: app.job.descriptionMd,
    applyUrl: app.job.sourceUrl,
  }
}

export async function photoViewForApplication(userId: string, app: ApplicationWithJob): Promise<PhotoView> {
  const [photo, variants] = await Promise.all([getProfilePhoto(userId), loadVariantsForFit(userId)])
  const advice = photoAdvice(photoJobOf(app))
  const chosen = variants.find((v) => v.id === app.resumeVariantId)
  const state = chosen ? { region: chosen.region, photoOn: chosen.recipe.fields.photo } : null
  return { advice, action: photoAction(advice, state, photo !== null), hasPhoto: photo !== null }
}

export interface PhotoSwitch {
  variantId: string
  name: string
  created: boolean
}

export async function switchToPhotoVersion(userId: string, applicationId: string, now: Date = new Date()): Promise<PhotoSwitch> {
  const [app, photo, variants, { profile }] = await Promise.all([
    appsQ.getById(userId, applicationId),
    getProfilePhoto(userId),
    loadVariantsForFit(userId),
    getResumeProfile(userId),
  ])
  if (!app) throw new VariantError('Application not found.')
  if (!photo) throw new VariantError('Upload a profile photo in Settings › Résumé first.')
  const gcc = variants.filter((v) => v.region === 'gcc')
  const ranked = fitsFor(fitContext(profile, gcc, now), applicationJob(app))
  const withPhoto = ranked.find((f) => gcc.find((v) => v.id === f.variantId)?.recipe.fields.photo)
  let target: PhotoSwitch
  if (withPhoto) {
    target = { variantId: withPhoto.variantId, name: withPhoto.name, created: false }
  } else {
    const best = gcc.find((v) => v.id === ranked[0]?.variantId)
    const recipe = best ? best.recipe : buildRecipe(profile, { region: 'gcc', roleFamily: null })
    const name = `${best?.name ?? 'GCC · General'} · Photo`.slice(0, 120)
    const row = await variantsQ.create(userId, {
      name,
      region: 'gcc',
      roleFamily: recipe.roleFamily,
      recipe: recipeSchema.parse({ ...recipe, fields: { ...recipe.fields, photo: true } }),
    })
    target = { variantId: row.id, name, created: true }
  }
  if (await prepsQ.get(userId, applicationId)) await confirmVariant(userId, applicationId, target.variantId)
  else await chooseVariantForApplication(userId, applicationId, target.variantId)
  return target
}
