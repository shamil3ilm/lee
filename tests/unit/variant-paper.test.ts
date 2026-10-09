import { describe, expect, it } from 'vitest'
import { variantToLatex } from '@/lib/variants/latex'
import { buildRecipe } from '@/lib/variants/presets'
import { renderVariant } from '@/lib/variants/render'
import { paperFor, parseRecipe, REGION_PAPER, REGIONS, TEMPLATES, type PaperSize, type Recipe, type Region } from '@/lib/variants/types'
import { syntheticProfile } from '@/tests/fixtures/resume/profile'

const p = syntheticProfile()

function recipe(region: Region, template: Recipe['template'], paper: PaperSize | null = null): Recipe {
  return { ...buildRecipe(p, { region, roleFamily: null }), template, paper }
}

function tex(r: Recipe): string {
  return variantToLatex(renderVariant(p, r, { hasPhoto: false }), r.lengthTarget)
}

describe('variant paper size', () => {
  it('defaults by region: A4 for GCC and India, US Letter for Remote / US', () => {
    expect(REGION_PAPER).toEqual({ gcc: 'a4', india: 'a4', remote: 'letter' })
  })

  it('new recipes follow the region (paper = null) and old stored recipes parse without it', () => {
    expect(buildRecipe(p, { region: 'gcc', roleFamily: null }).paper).toBeNull()
    expect(parseRecipe({ region: 'india' }).paper).toBeNull()
    expect(paperFor(parseRecipe({ region: 'india' }))).toBe('a4')
    expect(paperFor(parseRecipe({ region: 'remote' }))).toBe('letter')
    expect(paperFor(parseRecipe({ region: 'remote', paper: 'a4' }))).toBe('a4')
  })

  it.each(TEMPLATES.flatMap((t) => REGIONS.map((r) => [t, r] as const)))(
    '%s · %s uses the region default in \\documentclass',
    (template, region) => {
      const want = REGION_PAPER[region] === 'a4' ? 'a4paper' : 'letterpaper'
      const head = tex(recipe(region, template)).split('\n').find((l) => l.startsWith('\\documentclass'))
      expect(head).toContain(want)
      expect(head).not.toContain(want === 'a4paper' ? 'letterpaper' : 'a4paper')
    },
  )

  it('a per-variant choice overrides the region default for every template', () => {
    for (const template of TEMPLATES) {
      expect(tex(recipe('gcc', template, 'letter'))).toMatch(/\\documentclass\[[^\]]*letterpaper/)
      expect(tex(recipe('remote', template, 'a4'))).toMatch(/\\documentclass\[[^\]]*a4paper/)
    }
  })

  it('carries the paper on the rendered résumé', () => {
    expect(renderVariant(p, recipe('india', 'classic'), {}).paper).toBe('a4')
    expect(renderVariant(p, recipe('india', 'classic', 'letter'), {}).paper).toBe('letter')
  })
})
