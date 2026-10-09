import type { ApplicationFacts } from '@/lib/ai/prompts/application-facts'
import { loadSettings } from '@/lib/compare/service'
import * as profileQ from '@/lib/db/queries/profile'
import { parseDiscoveryPrefs } from '@/lib/discovery/relevance/discovery-prefs'
import { logger } from '@/lib/logger'
import { getResumeProfile } from '@/lib/resume/service'
import { applicationFacts, type FactsJob } from './application-facts'

/**
 * Load the private settings the region block reads and build it for one
 * posting. Best effort: a settings read that fails drops the block (the
 * draft is still useful without it); only the failure's kind is logged,
 * never the values.
 */
export async function loadApplicationFacts(userId: string, job: FactsJob): Promise<ApplicationFacts | null> {
  try {
    const [row, resume, settings] = await Promise.all([profileQ.get(userId), getResumeProfile(userId), loadSettings(userId)])
    const b = resume.profile.basics
    return applicationFacts(job, {
      prefs: parseDiscoveryPrefs(row?.discoveryPrefs),
      basics: { nationality: b.nationality, visaStatus: b.visaStatus, noticePeriod: b.noticePeriod },
      currentJob: settings.current,
      timezone: row?.timezone ?? null,
    })
  } catch (err) {
    logger.warn('application_facts_unavailable', { err: err instanceof Error ? err.name : 'unknown' })
    return null
  }
}
