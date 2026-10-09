import { describe, expect, it } from 'vitest'
import { applyReadinessIntentions, mergeIntentions, pendingIntentions, readinessFlags } from '@/lib/import/intentions'
import { batchItemCounts, removeBatchItems, restoreUpdatedItems } from '@/lib/import/provenance'
import {
  cleanSelection,
  initialSelection,
  invertSection,
  pickedItems,
  readinessOf,
  sectionState,
  setItem,
  setReadiness,
  setSection,
} from '@/lib/import/selection'
import { portfolioSnippets, profileJsonUrl } from '@/lib/import/snippet'
import type { ImportItem } from '@/lib/import/types'
import { parseResumeProfile } from '@/lib/resume/types'

function item(key: string, over: Partial<ImportItem> = {}): ImportItem {
  const section = key.split(':')[0] as ImportItem['section']
  return { key, section, label: key, detail: '', status: 'new', diff: [], hasReadiness: section === 'skills' || section === 'projects', isPublic: true, json: null, ...over }
}

const ITEMS: ImportItem[] = [
  item('skills:0', { label: 'Go', json: { path: 'skills', value: 'Go' } }),
  item('skills:1', { label: 'Kafka', json: { path: 'skills', value: 'Kafka' } }),
  item('skills:2', { label: 'PHP', status: 'duplicate', hasReadiness: false, json: { path: 'skills', value: 'PHP' } }),
  item('projects:0', { label: 'Ledger', json: { path: 'projects', value: { name: 'Ledger' } } }),
  item('work:0', { label: 'Engineer · PayFlow', status: 'update', hasReadiness: false, diff: [{ field: 'endDate', label: 'End', mine: '', imported: '2024-01' }], json: { path: 'work', value: { name: 'PayFlow' } } }),
  item('evidence:experience:0', { isPublic: false, hasReadiness: true }),
]

describe('import selection model', () => {
  it('ticks new items only; nothing is "mine" by default', () => {
    const sel = initialSelection(ITEMS)
    expect(sel.picked).toEqual(['skills:0', 'skills:1', 'projects:0', 'evidence:experience:0'])
    expect(sel.mine).toEqual([])
    expect(readinessOf(sel, 'skills:0')).toBe('learning')
  })

  it('the section checkbox is tri-state and controls its items', () => {
    let sel = initialSelection(ITEMS)
    expect(sectionState(ITEMS, sel, 'skills')).toBe('some') // PHP (duplicate) unticked
    sel = setSection(ITEMS, sel, 'skills', true)
    expect(sectionState(ITEMS, sel, 'skills')).toBe('all')
    sel = setSection(ITEMS, sel, 'skills', false)
    expect(sectionState(ITEMS, sel, 'skills')).toBe('none')
    expect(sel.picked).toEqual(['projects:0', 'evidence:experience:0'])
    expect(sectionState(ITEMS, sel, 'work')).toBe('none')
    expect(sectionState(ITEMS, sel, 'languages')).toBe('none')
  })

  it('chips: all, none and invert', () => {
    const sel = invertSection(ITEMS, initialSelection(ITEMS), 'skills')
    expect(pickedItems(ITEMS, sel).filter((i) => i.section === 'skills').map((i) => i.label)).toEqual(['PHP'])
  })

  it('readiness is kept only for ticked items', () => {
    let sel = setReadiness(initialSelection(ITEMS), 'skills:1', 'mine')
    expect(readinessOf(sel, 'skills:1')).toBe('mine')
    sel = setItem(sel, 'skills:1', false)
    expect(sel.mine).toEqual([])
    sel = setItem(sel, 'skills:1', true)
    expect(readinessOf(sel, 'skills:1')).toBe('learning')
  })

  it('an update is "keep mine" until ticked ("take imported")', () => {
    const sel = initialSelection(ITEMS)
    expect(sel.picked).not.toContain('work:0')
    expect(setItem(sel, 'work:0', true).picked).toContain('work:0')
  })

  it('the server keeps only known keys, and "mine" only for items with readiness', () => {
    const sel = cleanSelection(ITEMS, { picked: ['skills:0', 'work:0', 'bogus:9'], mine: ['skills:0', 'work:0'] })
    expect(sel).toEqual({ picked: ['skills:0', 'work:0'], mine: ['skills:0'] })
    expect(cleanSelection(ITEMS, { picked: 'x' })).toBeNull()
  })
})

describe('portfolio suggestions', () => {
  it('renders ticked public items as JSON Resume snippets per section', () => {
    const picked = pickedItems(ITEMS, setItem(initialSelection(ITEMS), 'work:0', true))
    const snippets = portfolioSnippets(picked, 'From LinkedIn')
    expect(snippets.map((s) => s.section)).toEqual(['work', 'projects', 'skills'])
    expect(JSON.parse(snippets.find((s) => s.section === 'skills')!.json)).toEqual({ skills: [{ name: 'From LinkedIn', keywords: ['Go', 'Kafka'] }] })
    expect(snippets.some((s) => s.json.includes('evidence'))).toBe(false)
  })

  it('basics merge into one snippet', () => {
    const items = [item('basics:headline', { json: { path: 'basics.label', value: 'Backend engineer' } }), item('basics:summary', { json: { path: 'basics.summary', value: 'Builds ledgers.' } })]
    expect(JSON.parse(portfolioSnippets(items, 'x')[0]!.json)).toEqual({ basics: { label: 'Backend engineer', summary: 'Builds ledgers.' } })
  })

  it('links to profile.json only for a configured repo', () => {
    expect(profileJsonUrl({ repo: 'example/portfolio', branch: 'main', path: 'data/profile.json' })).toBe('https://github.com/example/portfolio/blob/main/data/profile.json')
    expect(profileJsonUrl({ repo: '', branch: 'main', path: 'profile.json' })).toBeNull()
    expect(profileJsonUrl(null)).toBeNull()
  })
})

const profile = () =>
  parseResumeProfile({
    work: [{ id: 'w1', name: 'PayFlow', position: 'Engineer', highlights: [{ id: 'h1', text: 'Built payouts.', depth: 'own' }] }],
    projects: [
      { id: 'p1', name: 'Ledger', depth: 'own' },
      { id: 'p2', name: 'Toolkit', source: 'linkedin', importedAt: '2026-10-09T08:00:00.000Z', depth: 'learning' },
    ],
    skills: [
      { id: 'g1', name: 'Core', skills: [{ id: 's1', name: 'Go', depth: 'own' }] },
      { id: 'g2', name: 'From LinkedIn', skills: [{ id: 's2', name: 'Kafka', source: 'linkedin', importedAt: '2026-10-09T08:00:00.000Z', depth: 'learning' }] },
    ],
  })

describe('readiness intentions', () => {
  it('maps "mine" to own + ready and the default to learning, not ready', () => {
    expect(readinessFlags(true)).toEqual({ depth: 'own', interviewReady: true, domainReady: true })
    expect(readinessFlags(false)).toEqual({ depth: 'learning', interviewReady: false, domainReady: false })
  })

  it('applies to items when they arrive, by name; the rest stay pending', () => {
    const intentions = mergeIntentions(
      [{ section: 'skills', name: 'go', mine: true }],
      [{ section: 'skills', name: 'Go', mine: false }, { section: 'work', name: 'PayFlow | Engineer', mine: false }, { section: 'projects', name: 'Not yet', mine: true }],
    )
    expect(intentions).toHaveLength(3) // the later "Go" wins
    const r = applyReadinessIntentions(profile(), intentions)
    expect(r.profile.skills[0]!.skills[0]).toMatchObject({ name: 'Go', depth: 'learning', interviewReady: false })
    expect(r.profile.work[0]!.highlights[0]).toMatchObject({ interviewReady: false })
    expect(r.applied).toHaveLength(2)
    expect(pendingIntentions(profile(), intentions)).toEqual([{ section: 'projects', name: 'Not yet', mine: true }])
  })
})

describe('provenance', () => {
  const batch = { source: 'linkedin', importedAt: '2026-10-09T08:00:00.000Z' }
  it('counts and removes exactly what a batch added; an emptied group goes too', () => {
    expect(batchItemCounts(profile(), batch)).toEqual({ projects: 1, skills: 1 })
    const next = removeBatchItems(profile(), batch)
    expect(next.projects.map((p) => p.id)).toEqual(['p1'])
    expect(next.skills.map((g) => g.name)).toEqual(['Core'])
    expect(removeBatchItems(profile(), { ...batch, importedAt: '2026-10-08T08:00:00.000Z' })).toEqual(profile())
  })

  it('restores items an update replaced, if still there', () => {
    const p = profile()
    const before = { ...p.work[0]!, position: 'Junior Engineer' }
    expect(restoreUpdatedItems(p, [{ section: 'work', id: 'w1', before }, { section: 'work', id: 'gone', before }]).profile.work[0]!.position).toBe('Junior Engineer')
  })
})
