import * as applicationsQ from '@/lib/db/queries/applications'
import * as documentsQ from '@/lib/db/queries/documents'
import { getMasterCV } from './master'
import { coverLetterSchema } from './types'
import { ApplicationNotFoundError, MasterCVNotFoundError } from './errors'
import type { AIProvider } from '@/lib/ai/types'
import type { Document } from '@/lib/db/queries/documents'

export async function generateCoverLetter(input: {
  userId: string
  applicationId: string
  ai: AIProvider
}): Promise<Document> {
  const master = await getMasterCV(input.userId)
  if (!master) throw new MasterCVNotFoundError()

  const application = await applicationsQ.getById(input.userId, input.applicationId)
  if (!application) throw new ApplicationNotFoundError(input.applicationId)

  const letter = await input.ai.draftCoverLetter({ master, application })
  const validated = coverLetterSchema.parse(letter)

  const version = await documentsQ.nextVersion(input.userId, input.applicationId, 'cover_letter')
  const company = application.job.company?.name ?? 'unknown'
  const title = `Cover Letter — ${application.job.title} @ ${company}`.slice(0, 200)

  return documentsQ.create(input.userId, {
    applicationId: input.applicationId,
    kind: 'cover_letter',
    version,
    title,
    content: validated,
  })
}
