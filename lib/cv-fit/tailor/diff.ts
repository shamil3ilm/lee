import type { RenderedResume, RenderedSection } from '@/lib/variants/render'
import type { DiffLine, DiffSection } from './types'

/**
 * Side-by-side before/after of two rendered résumés, section by section.
 * A line is "added" or "removed" when only one side has it, "moved" when
 * both have it at a different position among the shared lines. Pure.
 */

function linesOf(s: RenderedSection | undefined): string[] {
  if (!s) return []
  const out = [...s.lines]
  for (const e of s.entries) {
    out.push([e.title, e.subtitle].filter(Boolean).join(' — '))
    for (const b of e.bullets) out.push(`• ${b.text}`)
  }
  return out
}

function mark(lines: readonly string[], other: readonly string[], missing: DiffLine['state']): DiffLine[] {
  const otherSet = new Set(other)
  const sharedOther = other.filter((l) => lines.includes(l))
  let k = 0
  return lines.map((text) => {
    if (!otherSet.has(text)) return { text, state: missing }
    const state = sharedOther[k] === text ? 'same' : 'moved'
    k++
    return { text, state }
  })
}

export function diffResumes(before: RenderedResume, after: RenderedResume): DiffSection[] {
  const keys = [...new Set([...before.sections.map((s) => s.key), ...after.sections.map((s) => s.key)])]
  const head: DiffSection = {
    label: 'Headline',
    before: mark([before.headline], [after.headline], 'removed'),
    after: mark([after.headline], [before.headline], 'added'),
  }
  const sections = keys.map((key): DiffSection => {
    const b = before.sections.find((s) => s.key === key)
    const a = after.sections.find((s) => s.key === key)
    const bl = linesOf(b)
    const al = linesOf(a)
    return { label: (a ?? b)!.label, before: mark(bl, al, 'removed'), after: mark(al, bl, 'added') }
  })
  return [head, ...sections]
}

/** True when nothing differs. */
export function sameResume(diff: readonly DiffSection[]): boolean {
  return diff.every((s) => [...s.before, ...s.after].every((l) => l.state === 'same'))
}
