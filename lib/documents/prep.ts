import * as applicationsQ from '@/lib/db/queries/applications'
import * as documentsQ from '@/lib/db/queries/documents'
import { getMasterCV } from './master'
import { interviewPrepPackSchema } from './types'
import { ApplicationNotFoundError, MasterCVNotFoundError } from './errors'
import type { AIProvider } from '@/lib/ai/types'
import type { Document } from '@/lib/db/queries/documents'

/**
 * Generates an interview prep pack for a specific application + stage kind
 * (recruiter_screen | tech_screen | system_design | behavioral | take_home).
 * Persists as a versioned `documents` row so a candidate can iterate as the
 * loop progresses.
 */
export async function generateInterviewPrepPack(input: {
  userId: string
  applicationId: string
  stageKind: string
  stageId?: string
  ai: AIProvider
}): Promise<Document> {
  const master = await getMasterCV(input.userId)
  if (!master) throw new MasterCVNotFoundError()

  const application = await applicationsQ.getById(input.userId, input.applicationId)
  if (!application) throw new ApplicationNotFoundError(input.applicationId)

  const pack = await input.ai.generateInterviewPrepPack({
    master,
    application,
    stageKind: input.stageKind,
    stageId: input.stageId,
  })
  const validated = interviewPrepPackSchema.parse(pack)

  const version = await documentsQ.nextVersion(
    input.userId,
    input.applicationId,
    'interview_prep_pack',
  )
  const company = application.job.company?.name ?? 'unknown'
  const title = `Interview Prep - ${input.stageKind} for ${application.job.title} @ ${company}`.slice(
    0,
    200,
  )

  return documentsQ.create(input.userId, {
    applicationId: input.applicationId,
    kind: 'interview_prep_pack',
    version,
    title,
    content: validated,
  })
}
