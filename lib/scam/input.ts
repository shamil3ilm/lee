import type { NormalizedJob } from '@/lib/discovery/adapters/types'
import type { ScamInput } from './types'

/** Build the rules input from a job discovery's normalized payload. */
export function inputFromNormalizedJob(n: Partial<NormalizedJob>, sourceName?: string | null): ScamInput {
  return {
    title: n.title ?? null,
    company: n.companyName ?? null,
    description: n.descriptionMd ?? null,
    applyUrl: n.applyUrl ?? null,
    companyDomain: n.companyDomain ?? n.companyWebsite ?? null,
    salary: n.salary ?? null,
    location: n.location ?? null,
    source: sourceName ?? null,
  }
}

export interface JobLike {
  title: string
  sourceUrl: string
  descriptionMd: string | null
  location: string | null
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency: string | null
}

export interface CompanyLike {
  name: string
  domain: string | null
  website: string | null
}

/** Build the rules input from a saved job (+ its company). */
export function inputFromJob(job: JobLike, company: CompanyLike | null): ScamInput {
  return {
    title: job.title,
    company: company?.name ?? null,
    description: job.descriptionMd,
    applyUrl: job.sourceUrl,
    companyDomain: company?.domain ?? company?.website ?? null,
    salary: { min: job.salaryMin, max: job.salaryMax, currency: job.salaryCurrency },
    location: job.location,
    source: null,
  }
}
