import { applySettingsFrom } from '@/lib/apply/settings'
import type { ApplicationWithJob } from '@/lib/db/queries/applications'
import * as profileQ from '@/lib/db/queries/profile'
import { businessDaysBetween, cadenceFor, isGccAgencyPosting, stepDue, type CadenceMarks, type FollowupStep } from './cadence'

/**
 * Which follow-up a draft for this application is, right now: business days
 * since applying and the step (the one due, or the check-in when none is due
 * yet). A step the caller picked explicitly wins.
 */
export interface FollowupPlan {
  daysSince: number
  step: FollowupStep
  marks: CadenceMarks
}

export async function followupPlan(
  userId: string,
  application: Pick<ApplicationWithJob, 'appliedAt' | 'job'>,
  opts: { step?: FollowupStep; now?: Date } = {},
): Promise<FollowupPlan | null> {
  if (!application.appliedAt) return null
  const now = opts.now ?? new Date()
  const settings = applySettingsFrom(await profileQ.get(userId))
  const marks = cadenceFor(
    settings,
    isGccAgencyPosting({
      title: application.job.title,
      location: application.job.location,
      companyName: application.job.company?.name ?? null,
      descriptionMd: application.job.descriptionMd,
    }),
  )
  const daysSince = businessDaysBetween(application.appliedAt, now)
  return { daysSince, step: opts.step ?? stepDue(daysSince, marks) ?? 1, marks }
}
