import { describe, it, expect } from 'vitest'
import {
  TEMPLATES,
  escapeLatex,
  fillTemplate,
  getTemplate,
  splitName,
} from '@/lib/latex/templates'
import type { MasterCV } from '@/lib/documents/types'

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
  it('exposes 3 templates', () => {
    expect(TEMPLATES.map((t) => t.id).sort()).toEqual(
      ['altacv-tw', 'awesome-cv', 'moderncv-classic'].sort(),
    )
  })

  it.each(TEMPLATES.map((t) => t.id))(
    'template %s fills without leaving placeholders and includes \\documentclass',
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

  it('escapes % in bullet content when filling', () => {
    const source = fillTemplate('awesome-cv', master)
    expect(source).toContain('100\\% test coverage on gears')
  })

  it('unknown template id throws', () => {
    expect(() => fillTemplate('does-not-exist', master)).toThrow()
    expect(getTemplate('does-not-exist')).toBeNull()
  })
})
