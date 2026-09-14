import type { AIProvider, ParsedJob, ParsedProfile } from './types'

export class FixtureAIProvider implements AIProvider {
  constructor(
    private readonly fixtures: {
      parseJob?: (text: string) => ParsedJob
      parseProfile?: (input: { cvText?: string; profileMd?: string }) => ParsedProfile
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
}
