import { describe, expect, it } from 'vitest'
import { canonicalize, familyOf, findSkillsInText, SKILL_COUNT } from '@/lib/cv-score/synonyms'
import { contentStems, digitRuns, stem } from '@/lib/cv-score/text'
import { parseCvDate, parseDateRange, resolveEnd } from '@/lib/cv-score/dates'
import { latexToText } from '@/lib/cv-score/latex-text'
import { fillTemplate } from '@/lib/latex/templates'
import { makeMasterCV } from '@/tests/eval/factories'

describe('synonyms', () => {
  it('has a broad vocabulary (~60+ entries)', () => {
    expect(SKILL_COUNT).toBeGreaterThanOrEqual(60)
  })

  it.each([
    ['Postgres', 'postgresql'],
    ['PostgreSQL', 'postgresql'],
    ['JS', 'javascript'],
    ['ts', 'typescript'],
    ['k8s', 'kubernetes'],
    ['Node', 'node.js'],
    ['NodeJS', 'node.js'],
    ['React.js', 'react'],
    ['golang', 'go'],
    ['Amazon Web Services', 'aws'],
    ['CI-CD', 'ci/cd'],
    ['continuous integration', 'ci/cd'],
    ['  Kafka. ', 'kafka'],
  ])('canonicalize(%s) → %s', (raw, canon) => {
    expect(canonicalize(raw)).toBe(canon)
  })

  it('keeps unknown terms as their normalised spelling', () => {
    expect(canonicalize('  Stripe API ')).toBe('stripe api')
  })

  it('groups siblings into families', () => {
    expect(familyOf('postgresql')).toBe('sql')
    expect(familyOf('mysql')).toBe('sql')
    expect(familyOf('aws')).toBe(familyOf('gcp'))
  })

  it('finds skills in free text with token boundaries', () => {
    const found = findSkillsInText('Built JavaScript apps and Java services with C++ and CI/CD on k8s.')
    expect([...found.keys()].sort()).toEqual(['c++', 'ci/cd', 'java', 'javascript', 'kubernetes'])
  })

  it('does not read English "go to" / "go live" as the Go language', () => {
    expect(findSkillsInText('Our go-to engineer; helped the product go live.').has('go')).toBe(false)
    expect(findSkillsInText('Wrote services in Go and Rust.').has('go')).toBe(true)
    expect(findSkillsInText('i like to go home').has('go')).toBe(false)
  })

  it('counts repeated mentions', () => {
    expect(findSkillsInText('Kafka, kafka and Apache Kafka').get('kafka')).toBe(3)
  })
})

describe('text helpers', () => {
  it('stems plurals and verb forms together', () => {
    expect(stem('services')).toBe(stem('service'))
    expect(stem('designed')).toBe(stem('design'))
    expect(stem('engineers')).toBe(stem('engineer'))
    expect(stem('payments')).toBe('payment')
  })

  it('drops stopwords and numbers from content stems', () => {
    expect([...contentStems('Design and build the payment ledger in 2024')]).toEqual(['design', 'payment', 'ledger'])
  })

  it('extracts digit runs', () => {
    expect(digitRuns('Cut $200M costs by 3.5% in 12 weeks')).toEqual(['200', '3.5', '12'])
  })
})

describe('dates', () => {
  it.each([
    ['Jan 2020', false, '2020-01'],
    ['September 2019', false, '2019-09'],
    ["Sept '21", false, '2021-09'],
    ['03/2018', false, '2018-03'],
    ['2019-7', false, '2019-07'],
    ['2017', false, '2017-01'],
    ['2017', true, '2017-12'],
    ['Present', true, 'present'],
    ['nonsense', false, undefined],
  ] as const)('parseCvDate(%s, end=%s) → %s', (raw, isEnd, expected) => {
    expect(parseCvDate(raw, isEnd)).toBe(expected)
  })

  it('parses ranges inside a line', () => {
    expect(parseDateRange('Senior Engineer, Acme | Jan 2020 – Present')).toMatchObject({
      start: '2020-01',
      end: 'present',
    })
    expect(parseDateRange('2017 - 2019')).toMatchObject({ start: '2017-01', end: '2019-12' })
    expect(parseDateRange('no dates here')).toBeNull()
  })

  it('resolves present against a reference date', () => {
    expect(resolveEnd('present', new Date('2026-09-25T00:00:00Z'))).toBe('2026-09')
    expect(resolveEnd('2020-01', new Date())).toBe('2020-01')
  })
})

describe('latexToText', () => {
  it('strips commands, keeps sections, items and macro arguments', () => {
    const src = String.raw`\documentclass{article}
\usepackage{geometry}
\newcommand{\entry}[4]{#1 #2}
\begin{document}
\textbf{Jane Doe} \\ jane@example.com % a comment
\section*{Experience}
\entry{Staff Engineer}{Acme}{London}{2020 -- Present}
\begin{itemize}
  \item Cut costs by 40\% with \emph{caching}
  \item Latency p99 \textless{} 200ms
\end{itemize}
\end{document}`
    const text = latexToText(src)
    expect(text).toContain('Jane Doe')
    expect(text).toContain('jane@example.com')
    expect(text).not.toContain('a comment')
    expect(text).not.toContain('geometry')
    expect(text).toContain('Experience')
    expect(text).toContain('Staff Engineer | Acme | London | 2020 – Present')
    expect(text).toContain('• Cut costs by 40% with caching')
    expect(text).toContain('• Latency p99 < 200ms')
  })

  it('reads moderncv identity macros from the preamble', () => {
    const text = latexToText(fillTemplate('moderncv-classic', makeMasterCV()))
    expect(text).toContain('shamil@example.com')
    expect(text).toContain('Shamil Test')
  })
})
