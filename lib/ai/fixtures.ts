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
  InterviewPrepPack,
  MasterCV,
  OutreachDraft,
  OutreachKind,
  OutreachTone,
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
      draftOutreach?: (input: {
        master: MasterCV
        application: ApplicationWithJob
        kind: OutreachKind
        tone: OutreachTone
      }) => OutreachDraft
      generateInterviewPrepPack?: (input: {
        master: MasterCV
        application: ApplicationWithJob
        stageKind: string
        stageId?: string
      }) => InterviewPrepPack
      generateLatexCV?: (input: {
        master: MasterCV
        templateId: string
      }) => { source: string }
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

  async draftOutreach(input: {
    master: MasterCV
    application: ApplicationWithJob
    kind: OutreachKind
    tone: OutreachTone
  }): Promise<OutreachDraft> {
    if (this.fixtures.draftOutreach) return this.fixtures.draftOutreach(input)
    return pseudoOutreach(input)
  }

  async generateInterviewPrepPack(input: {
    master: MasterCV
    application: ApplicationWithJob
    stageKind: string
    stageId?: string
  }): Promise<InterviewPrepPack> {
    if (this.fixtures.generateInterviewPrepPack)
      return this.fixtures.generateInterviewPrepPack(input)
    return pseudoPrepPack(input)
  }

  async generateLatexCV(input: {
    master: MasterCV
    templateId: string
  }): Promise<{ source: string }> {
    if (this.fixtures.generateLatexCV) return this.fixtures.generateLatexCV(input)
    return {
      source: '\\documentclass{article}\n\\begin{document}\nTest\n\\end{document}\n',
    }
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

function pseudoOutreach(input: {
  master: MasterCV
  application: ApplicationWithJob
  kind: OutreachKind
  tone: OutreachTone
}): OutreachDraft {
  const { master, application, kind, tone } = input
  const company = application.job.company?.name ?? 'your team'
  const role = application.job.title
  const first = master.experience[0]
  const anchor = first ? `${first.role} at ${first.company}` : 'my current role'
  const bodies: Record<OutreachKind, { subject?: string; body: string }> = {
    linkedin_connection: {
      body: `Hi there — saw the ${role} opening at ${company}. Coming from ${anchor}, would like to connect and follow the team's work.`,
    },
    linkedin_message: {
      body: `Hi — thanks for connecting.\n\nI'm interested in the ${role} role at ${company}. In ${anchor} I worked on ${first?.bullets[0] ?? 'relevant systems'}, which lines up with what your team is doing.\n\nWould a 20-min call this week be possible, or would you prefer I go through the standard application flow?\n\nThanks,\n${master.basics.name}`,
    },
    recruiter_reply: {
      subject: `Re: ${role} at ${company}`,
      body: `Hi,\n\nThanks for reaching out about the ${role} role — yes, very interested. Recent context: ${anchor} where I ${first?.bullets[0] ?? 'shipped several relevant projects'}.\n\nA couple of questions before we schedule:\n1. What's the team's split between platform work and product enablement?\n2. Is there a comp range you can share for this level?\n\nI can jump on a 30-min call any afternoon this week — happy to hold a slot or grab time from a Calendly link.\n\nThanks,\n${master.basics.name}`,
    },
  }
  const draft = bodies[kind]
  return {
    kind,
    applicationId: application.id,
    subject: draft.subject,
    body: draft.body,
    tone,
    wordCount: draft.body.trim().split(/\s+/).length,
    notes: `pseudo-outreach ${kind} tone=${tone}`,
  }
}

function pseudoPrepPack(input: {
  master: MasterCV
  application: ApplicationWithJob
  stageKind: string
  stageId?: string
}): InterviewPrepPack {
  const { master, application, stageKind, stageId } = input
  const first = master.experience[0]
  const company = application.job.company?.name ?? 'the company'
  const cvBullet = first?.bullets[0] ?? 'shipped a relevant project'
  return {
    applicationId: application.id,
    stageId: stageId ?? null,
    stageKind,
    companyResearch: {
      summary: `${company} is hiring for ${application.job.title}. Pipeline context comes from the job description.`,
      industry: application.job.company?.techStack?.slice(0, 2) ?? [],
      notable_facts: [],
      tech_stack: application.job.company?.techStack ?? [],
      culture_signals:
        application.job.remoteType === 'remote' ? ['remote-friendly'] : [],
    },
    likelyQuestions: [
      {
        question: `Walk me through your work on ${cvBullet.slice(0, 60)}.`,
        category: 'behavioral',
        difficulty: 'medium',
        star_answer: {
          situation: `While ${first ? `at ${first.company}` : 'in a previous role'}, we needed to improve a critical system.`,
          task: 'Own the design and delivery within a quarter.',
          action: 'Shipped the change end-to-end with rollout guarded behind a flag.',
          result: 'Measurable reliability and velocity improvement for the team.',
          cv_bullet_ref: cvBullet,
        },
      },
      {
        question: 'How would you approach a system design for a rate limiter?',
        category: 'system_design',
        difficulty: 'medium',
        technical_notes:
          'Cover token bucket vs sliding window, in-memory vs distributed, and back-pressure semantics.',
      },
    ],
    talkingPoints: [
      `Direct experience with ${master.skills.primary.slice(0, 2).join(', ') || 'the core stack'}.`,
    ],
    redFlags: ['Ask about on-call rota and typical incident load.'],
    yourQuestions: [
      'What does success look like in the first 90 days?',
      'How is the team split between platform work and product enablement?',
    ],
  }
}
