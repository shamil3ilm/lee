import * as applicationsQ from '@/lib/db/queries/applications'
import * as documentsQ from '@/lib/db/queries/documents'
import { getMasterCV } from './master'
import { outreachDraftSchema, type OutreachKind, type OutreachTone } from './types'
import { ApplicationNotFoundError, MasterCVNotFoundError } from './errors'
import type { AIProvider } from '@/lib/ai/types'
import type { Document, DocumentKind } from '@/lib/db/queries/documents'

const KIND_LABELS: Record<OutreachKind, string> = {
  linkedin_connection: 'LinkedIn Connection',
  linkedin_message: 'LinkedIn Message',
  recruiter_reply: 'Recruiter Reply',
}

function toDocumentKind(kind: OutreachKind): DocumentKind {
  switch (kind) {
    case 'linkedin_connection':
      return 'outreach_linkedin_connection'
    case 'linkedin_message':
      return 'outreach_linkedin_message'
    case 'recruiter_reply':
      return 'outreach_recruiter_reply'
  }
}

/**
 * Generates an outreach draft (LinkedIn connection / message / recruiter reply)
 * grounded in the master CV + application context. Persists as a new
 * `documents` row with a kind-specific `outreach_*` value so the library
 * filter chips can group them.
 */
export async function generateOutreachDraft(input: {
  userId: string
  applicationId: string
  kind: OutreachKind
  tone: OutreachTone
  ai: AIProvider
}): Promise<Document> {
  const master = await getMasterCV(input.userId)
  if (!master) throw new MasterCVNotFoundError()

  const application = await applicationsQ.getById(input.userId, input.applicationId)
  if (!application) throw new ApplicationNotFoundError(input.applicationId)

  const draft = await input.ai.draftOutreach({
    master,
    application,
    kind: input.kind,
    tone: input.tone,
  })
  const validated = outreachDraftSchema.parse(draft)

  const documentKind = toDocumentKind(input.kind)
  const version = await documentsQ.nextVersion(input.userId, input.applicationId, documentKind)
  const company = application.job.company?.name ?? 'unknown'
  const title = `${KIND_LABELS[input.kind]} - ${application.job.title} @ ${company}`.slice(0, 200)

  return documentsQ.create(input.userId, {
    applicationId: input.applicationId,
    kind: documentKind,
    version,
    title,
    content: validated,
  })
}
