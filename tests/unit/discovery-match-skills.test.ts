import { describe, expect, it } from 'vitest'
import { canonicalSkill, skillsInText, withImplied } from '@/lib/discovery/match/lexicon'
import { extractRequirements } from '@/lib/discovery/match/requirements'
import { creditFor, skillsComponent, SKILLS_MAX } from '@/lib/discovery/match/skills'
import { matchJob, matchProfile } from './discovery-match-helpers'

const weightOf = (job: Parameters<typeof extractRequirements>[0], c: string): string | undefined =>
  extractRequirements(job).find((r) => r.canonical === c)?.weight

describe('match lexicon', () => {
  it('canonicalises free-form skill names, including discovery-only extras', () => {
    expect(canonicalSkill('Postgres')).toBe('postgresql')
    expect(canonicalSkill('Laravel 10')).toBe('laravel')
    expect(canonicalSkill('Version control (Git)')).toBe('git')
    expect(canonicalSkill('Underwater basket weaving')).toBeNull()
  })

  it('finds skills and concepts in posting text', () => {
    const s = skillsInText('Strong PHP framework experience (Laravel), MySQL, message queues and Kubernetes.')
    expect([...s]).toEqual(expect.arrayContaining(['php', 'laravel', 'mysql', 'kubernetes', 'php framework', 'message queue']))
  })

  it('never treats process words or the payments domain as a missing skill', () => {
    expect(skillsInText('Agile team building payments with TDD').size).toBe(0)
  })

  it('expands implied skills (Laravel → PHP, Next.js → React → JavaScript)', () => {
    expect([...withImplied(['laravel', 'next.js'])]).toEqual(expect.arrayContaining(['php', 'react', 'javascript']))
  })
})

describe('extractRequirements', () => {
  const structured = [
    'About us: we run Kubernetes clusters for Gulf banks.',
    '## Requirements',
    '- 2+ years of PHP and Laravel',
    '- MySQL',
    '- Redis is a plus',
    '## Nice to have',
    '- Vue.js',
  ].join('\n')

  it('weights title, tech stack and the requirements section as required', () => {
    const job = matchJob({ title: 'Laravel Developer', techStack: ['Docker'], descriptionMd: structured })
    expect(weightOf(job, 'laravel')).toBe('required')
    expect(weightOf(job, 'docker')).toBe('required')
    expect(weightOf(job, 'mysql')).toBe('required')
  })

  it('reads "nice to have" sections and inline "a plus" as nice, other sections as mentioned', () => {
    const job = matchJob({ descriptionMd: structured })
    expect(weightOf(job, 'vue')).toBe('nice')
    expect(weightOf(job, 'redis')).toBe('nice')
    expect(weightOf(job, 'kubernetes')).toBe('mentioned')
  })

  it('reads an unstructured description as required, except inline nice-to-haves', () => {
    const job = matchJob({ descriptionMd: 'We need a PHP developer with MySQL. Kafka experience preferred.' })
    expect(weightOf(job, 'php')).toBe('required')
    expect(weightOf(job, 'kafka')).toBe('nice')
  })

  it('keeps the strongest weight for a skill named twice', () => {
    const job = matchJob({ title: 'Vue Developer', descriptionMd: '## Nice to have\n- Vue 3' })
    expect(weightOf(job, 'vue')).toBe('required')
  })
})

describe('data / analysis vocabulary', () => {
  it('finds BI, data and business-analysis skills', () => {
    const s = skillsInText(
      'SQL, Excel and Power BI dashboards; pandas; ETL with dbt; data modelling; BRD and user stories; UAT; process mapping (BPMN); statistics',
    )
    expect([...s]).toEqual(
      expect.arrayContaining(['sql', 'excel', 'power bi', 'dashboards', 'pandas', 'etl', 'dbt', 'data modelling', 'brd', 'user stories', 'uat', 'process mapping', 'statistics']),
    )
  })

  it('marks a missing required BI tool as "Power BI (required)" and credits a sibling by half', () => {
    const job = matchJob({ title: 'Data Analyst', descriptionMd: '## Requirements\n- SQL\n- Power BI' })
    const r = skillsComponent(job, matchProfile({ skills: withImplied(['mysql']) }))
    expect(r.missing).toEqual(['Power BI (required)'])
    expect(creditFor('power bi', withImplied(['tableau']))).toEqual({ credit: 0.5, via: 'Tableau ≈ Power BI' })
    expect(creditFor('bi tool', withImplied(['looker'])).credit).toBe(1)
  })
})

describe('creditFor', () => {
  const mine = withImplied(['laravel', 'mysql'])
  it('gives full credit for the skill or a concept it satisfies (Laravel ↔ PHP framework)', () => {
    expect(creditFor('laravel', mine)).toEqual({ credit: 1, via: 'Laravel' })
    expect(creditFor('php framework', mine)).toEqual({ credit: 1, via: 'Laravel ≈ PHP framework' })
    expect(creditFor('relational database', mine).credit).toBe(1)
  })

  it('gives half credit for a close sibling and none across broad families', () => {
    expect(creditFor('postgresql', mine)).toEqual({ credit: 0.5, via: 'MySQL ≈ PostgreSQL' })
    expect(creditFor('symfony', mine)).toEqual({ credit: 0.5, via: 'Laravel ≈ Symfony' })
    expect(creditFor('ruby', mine).credit).toBe(0)
    expect(creditFor('kubernetes', withImplied(['docker'])).credit).toBe(0)
  })
})

describe('skillsComponent', () => {
  it('scores a full GCC Laravel stack match at the maximum', () => {
    const job = matchJob({
      title: 'Laravel Developer',
      location: 'Riyadh, Saudi Arabia',
      descriptionMd: '## Requirements\n- PHP, Laravel\n- MySQL\n- REST APIs and Git',
    })
    const r = skillsComponent(job, matchProfile())
    expect(r.component.points).toBe(SKILLS_MAX)
    expect(r.missing).toEqual([])
    expect(r.component.label).toMatch(/^Skills: 5 of 5 \(/)
  })

  it('lists missing required skills and weights nice-to-haves lightly', () => {
    const job = matchJob({
      title: 'Backend Engineer',
      descriptionMd: '## Requirements\n- Laravel\n- Kubernetes\n## Nice to have\n- Elasticsearch',
    })
    const r = skillsComponent(job, matchProfile())
    expect(r.missing).toEqual(['Kubernetes (required)'])
    // (2·1 + 2·0 + 0.5·0) / 4.5 × 40 = 17.8 → 18
    expect(r.component.points).toBe(18)
  })

  it('is neutral when the posting names no recognisable skill', () => {
    const r = skillsComponent(matchJob({ descriptionMd: 'Join our Doha office.' }), matchProfile())
    expect(r.component.points).toBe(SKILLS_MAX / 2)
    expect(r.component.label).toContain('neutral')
  })

  it('counts nothing from a profile with no ready skills', () => {
    const r = skillsComponent(matchJob({ title: 'PHP Developer' }), matchProfile({ skills: new Set() }))
    expect(r.component.points).toBe(0)
    expect(r.missing).toEqual(['PHP (required)'])
  })
})
