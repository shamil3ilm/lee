import type {
  AIProvider,
  CompanyMatchResult,
  JobMatchResult,
  ParsedJob,
  ParsedProfile,
} from './types'
import type { NormalizedCompany, NormalizedJob } from '@/lib/discovery/adapters/types'
import type { UserProfile } from '@/lib/db/queries/profile'
import type { ApplicationWithJob } from '@/lib/db/queries/applications'
import type {
  CoverLetter,
  CvProjects,
  GitHubRepo,
  MasterCV,
  TailoredCV,
} from '@/lib/documents/types'

export class FixtureAIProvider implements AIProvider {
  constructor(
    private readonly fixtures: {
      parseJob?: (text: string) => ParsedJob
      parseProfile?: (input: { cvText?: string; profileMd?: string }) => ParsedProfile
      scoreJob?: (job: NormalizedJob, profile: UserProfile) => JobMatchResult
      scoreCompany?: (
        company: NormalizedCompany,
        profile: UserProfile,
      ) => CompanyMatchResult
      tailorCV?: (input: { master: MasterCV; application: ApplicationWithJob }) => TailoredCV
      draftCoverLetter?: (input: {
        master: MasterCV
        application: ApplicationWithJob
      }) => CoverLetter
      distillGithubProjects?: (input: { repos: GitHubRepo[] }) => CvProjects
    } = {},
  ) {}

  async parseJob(text: string): Promise<ParsedJob> {
    return this.fixtures.parseJob?.(text) ?? {
      title: 'Test Engineer',
      company_name: 'Test Co',
      company_domain: 'test.co',
      location: 'Remote',
      remote_type: 'remote',
      employment_type: 'fulltime',
      salary_min: null,
      salary_max: null,
      salary_currency: null,
      seniority: 'senior',
      tech_stack: ['typescript'],
      responsibilities: [],
      requirements: [],
      benefits: {},
    }
  }

  async parseProfile(): Promise<ParsedProfile> {
    return this.fixtures.parseProfile?.({}) ?? {
      headline: 'Engineer', summary_md: null,
      skills: [], industries: [], role_types: [],
      seniority: 'senior', years_experience: 5, stack_weights: {},
    }
  }

  async scoreJob(job: NormalizedJob, profile: UserProfile): Promise<JobMatchResult> {
    if (this.fixtures.scoreJob) return this.fixtures.scoreJob(job, profile)
    return pseudoScoreJob(job, profile)
  }

  async scoreCompany(
    company: NormalizedCompany,
    profile: UserProfile,
  ): Promise<CompanyMatchResult> {
    if (this.fixtures.scoreCompany) return this.fixtures.scoreCompany(company, profile)
    return pseudoScoreCompany(company, profile)
  }

  async tailorCV(input: {
    master: MasterCV
    application: ApplicationWithJob
  }): Promise<TailoredCV> {
    if (this.fixtures.tailorCV) return this.fixtures.tailorCV(input)
    return pseudoTailor(input)
  }

  async draftCoverLetter(input: {
    master: MasterCV
    application: ApplicationWithJob
  }): Promise<CoverLetter> {
    if (this.fixtures.draftCoverLetter) return this.fixtures.draftCoverLetter(input)
    return pseudoCoverLetter(input)
  }

  async distillGithubProjects(input: { repos: GitHubRepo[] }): Promise<CvProjects> {
    if (this.fixtures.distillGithubProjects) return this.fixtures.distillGithubProjects(input)
    return pseudoDistill(input)
  }
}

/**
 * Deterministic pseudo-scoring: intersects profile industries/skills with the
 * job's tech stack + description. Not intelligent; just stable for tests.
 */
function pseudoScoreJob(job: NormalizedJob, profile: UserProfile): JobMatchResult {
  const industries = new Set(profile.industries.map((s) => s.toLowerCase()))
  const skills = new Set(profile.skills.map((s) => s.toLowerCase()))
  const stack = new Set(job.techStack.map((s) => s.toLowerCase()))
  const stackOverlap = [...skills].filter((s) => stack.has(s))
  const industryHits = [...industries].filter((i) =>
    (job.companyName + ' ' + (job.descriptionMd ?? '')).toLowerCase().includes(i),
  )
  const industryMatch: JobMatchResult['industry_match'] =
    industryHits.length > 0 ? 'strong' : industries.size === 0 ? 'weak' : 'weak'
  const score = Math.min(100, 40 + stackOverlap.length * 15 + industryHits.length * 15)
  return {
    match_score: score,
    strengths: stackOverlap.length ? [`shared stack: ${stackOverlap.join(', ')}`] : [],
    red_flags: [],
    reasoning: `pseudo-score: ${stackOverlap.length} stack overlap, ${industryHits.length} industry hits`,
    location_match: job.remoteType === 'remote' ? 'remote' : 'mismatch',
    seniority_match: 'match',
    stack_overlap: stackOverlap,
    stack_gaps: [],
    industry_match: industryMatch,
  }
}

function pseudoScoreCompany(
  company: NormalizedCompany,
  profile: UserProfile,
): CompanyMatchResult {
  const industries = new Set(profile.industries.map((s) => s.toLowerCase()))
  const compIndustries = (company.industry ?? []).map((s) => s.toLowerCase())
  const industryHit = compIndustries.some((i) => industries.has(i))
  const industryMatch: CompanyMatchResult['industry_match'] = industryHit ? 'strong' : 'weak'
  const score = Math.min(100, 50 + (industryHit ? 20 : 0))
  return {
    match_score: score,
    strengths: industryHit ? [`industry match: ${compIndustries.join(', ')}`] : [],
    red_flags: [],
    reasoning: `pseudo-score: industry ${industryHit ? 'match' : 'no match'}`,
    industry_match: industryMatch,
    size_match: 'match',
  }
}

// ---------------------------------------------------------------------------
// v2 stubs — return valid shapes so services can round-trip in tests.
// ---------------------------------------------------------------------------

function pseudoTailor(input: {
  master: MasterCV
  application: ApplicationWithJob
}): TailoredCV {
  const { master, application } = input
  const primary = master.skills.primary.slice(0, 7)
  return {
    ...master,
    _tailoring: {
      applicationId: application.id,
      reasoning: `pseudo-tailored for ${application.job.title}`,
      highlighted_skills: primary,
      reordered_experience_indices: master.experience.map((_, i) => i),
      summary_rewrite: false,
    },
  }
}

function pseudoCoverLetter(input: {
  master: MasterCV
  application: ApplicationWithJob
}): CoverLetter {
  const { master, application } = input
  const company = application.job.company?.name ?? 'your company'
  return {
    applicationId: application.id,
    greeting: 'Dear Hiring Manager,',
    paragraphs: [
      `I am writing to apply for the ${application.job.title} role at ${company}.`,
      `Recent work: ${master.experience[0]?.bullets[0] ?? 'various engineering projects'}.`,
      'I would welcome the chance to discuss how my background aligns with your team.',
    ],
    closing: `Sincerely,\n${master.basics.name}`,
    senderName: master.basics.name,
  }
}

function pseudoDistill(input: { repos: GitHubRepo[] }): CvProjects {
  return input.repos.slice(0, 3).map((r) => ({
    name: r.name,
    url: r.url,
    description: r.description ?? `${r.name} — open-source project.`,
    tech: r.primaryLanguage ? [r.primaryLanguage.toLowerCase()] : [],
    highlights: r.stargazers > 10 ? [`${r.stargazers} GitHub stars`] : undefined,
  }))
}
