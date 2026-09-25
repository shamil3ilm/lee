import { describe, it, expect } from 'vitest'
import {
  TEMPLATES,
  escapeLatex,
  fillCoverLetterTemplate,
  fillTemplate,
  getTemplate,
  splitName,
} from '@/lib/latex/templates'
import type { CoverLetter, MasterCV } from '@/lib/documents/types'

const master: MasterCV = {
  basics: {
    name: 'Ada Lovelace',
    headline: 'Backend Engineer',
    email: 'ada@example.com',
    phone: '+1-555-0100',
    location: 'London, UK',
    linkedin: 'https://linkedin.com/in/ada',
    github: 'https://github.com/ada',
  },
  summary: 'Builds & ships reliable systems.',
  experience: [
    {
      company: 'Analytical Engine Ltd',
      role: 'Principal Engineer',
      location: 'London',
      start: '2020-01',
      end: 'present',
      bullets: ['Wrote the first algorithm', '100% test coverage on gears'],
      tech: ['punchcards'],
    },
  ],
  projects: [
    {
      name: 'Note G',
      description: 'The first computer program.',
      tech: ['analytical engine'],
    },
  ],
  education: [
    {
      school: 'Home schooled',
      degree: 'Mathematics',
      start: '1836',
      end: '1843',
    },
  ],
  skills: { primary: ['analysis', 'poetry'], secondary: ['calculus'] },
}

const letter: CoverLetter = {
  applicationId: 'app-1',
  greeting: 'Dear Charles,',
  paragraphs: [
    'I am writing about the Analytical Engine role.',
    'My background in mathematics & poetry (100% match) makes me a strong fit.',
  ],
  closing: 'Kind regards,',
  senderName: 'Ada Lovelace',
}

describe('escapeLatex', () => {
  it('escapes special characters', () => {
    expect(escapeLatex('100%')).toBe('100\\%')
    expect(escapeLatex('a & b')).toBe('a \\& b')
    expect(escapeLatex('x_y')).toBe('x\\_y')
    expect(escapeLatex('$5')).toBe('\\$5')
    expect(escapeLatex('#tag')).toBe('\\#tag')
    // backslashes must be escaped first, else other rules would double-escape
    expect(escapeLatex('a\\b')).toBe('a\\textbackslash{}b')
  })
})

describe('splitName', () => {
  it('splits multi-word names on last token', () => {
    expect(splitName('Ada Lovelace')).toEqual({ first: 'Ada', last: 'Lovelace' })
    expect(splitName('Grace Brewster Hopper')).toEqual({
      first: 'Grace Brewster',
      last: 'Hopper',
    })
  })
  it('single-token or empty', () => {
    expect(splitName('Cher')).toEqual({ first: 'Cher', last: '' })
    expect(splitName('')).toEqual({ first: '', last: '' })
  })
})

describe('LaTeX templates', () => {
  it('exposes 9 CV templates and 5 cover-letter templates', () => {
    const cvs = TEMPLATES.filter((t) => t.kind === 'cv').map((t) => t.id).sort()
    const letters = TEMPLATES.filter((t) => t.kind === 'cover_letter')
      .map((t) => t.id)
      .sort()
    expect(cvs).toEqual(
      [
        'altacv-tw',
        'awesome-cv',
        'cv-academic-cv',
        'cv-deedy-resume',
        'cv-europass-style',
        'cv-friggeri',
        'cv-jake-gwinnett',
        'cv-simple',
        'moderncv-classic',
      ].sort(),
    )
    expect(letters).toEqual(
      [
        'letter-awesome-cv',
        'letter-classic',
        'letter-friendly',
        'letter-modern-professional',
        'letter-moderncv',
      ].sort(),
    )
  })

  it('every template has a category, kind, and non-empty packages list', () => {
    for (const t of TEMPLATES) {
      expect(t.kind).toMatch(/^(cv|cover_letter)$/)
      expect(t.category).toMatch(/^(minimalist|modern|classic|academic|creative)$/)
      expect(Array.isArray(t.packages)).toBe(true)
      expect(t.packages.length).toBeGreaterThan(0)
    }
  })

  it.each(
    TEMPLATES.filter((t) => t.kind === 'cv').map((t) => t.id),
  )(
    'CV template %s fills without leaving placeholders and includes \\documentclass',
    (id) => {
      const source = fillTemplate(id, master)
      expect(source).toMatch(/\\documentclass/)
      // No `{{placeholder}}` markers should remain.
      expect(source).not.toMatch(/\{\{[a-z_]+\}\}/)
      // At minimum first and last name appear somewhere (may be split by
      // per-template macros like \name{Ada}{Lovelace}).
      expect(source).toContain('Ada')
      expect(source).toContain('Lovelace')
      expect(source).toContain('Principal Engineer')
    },
  )

  it.each(
    TEMPLATES.filter((t) => t.kind === 'cover_letter').map((t) => t.id),
  )(
    'cover-letter template %s fills without leaving placeholders and includes \\documentclass',
    (id) => {
      const source = fillCoverLetterTemplate(id, master, letter)
      expect(source).toMatch(/\\documentclass/)
      expect(source).not.toMatch(/\{\{[a-z_]+\}\}/)
      expect(source).toContain('Ada Lovelace')
      expect(source).toContain('Dear Charles,')
      // The `%` in the second paragraph must be escaped so LaTeX doesn't
      // treat it as a comment.
      expect(source).toContain('100\\% match')
      expect(source).toContain('Kind regards,')
    },
  )

  it('escapes % in bullet content when filling', () => {
    const source = fillTemplate('awesome-cv', master)
    expect(source).toContain('100\\% test coverage on gears')
  })

  it('cover-letter template renders bracketed placeholders when no master CV', () => {
    const source = fillTemplate('letter-classic', null, {})
    expect(source).toContain('[Your Name]')
    expect(source).toContain('[Date]')
    expect(source).toContain('Dear Hiring Manager,')
  })

  it('unknown template id throws', () => {
    expect(() => fillTemplate('does-not-exist', master)).toThrow()
    expect(getTemplate('does-not-exist')).toBeNull()
  })

  it('CV template requires a master CV', () => {
    expect(() => fillTemplate('cv-simple', null)).toThrow(/requires a master CV/)
  })
})
