import { describe, expect, it } from 'vitest'
import { classifyHiringPost } from '@/lib/linkedin-posts/classify'
import { HELD_OUT_POSTS, LABELLED_POSTS } from '@/tests/fixtures/linkedin-posts/posts'

/**
 * Precision gate on 40 synthetic posts (24 hiring, 16 not; the tuning set).
 * Documented metrics (docs/job-sources.md): precision 1.00, recall 1.00 on
 * this set; held-out first blind run 0.75 / 0.60. The gate is precision
 * ≥ 0.90 and recall ≥ 0.80 so tuning that trades recall for fewer false
 * positives stays allowed.
 */
function metrics() {
  let tp = 0
  let fp = 0
  let fn = 0
  const misses: string[] = []
  for (const p of LABELLED_POSTS) {
    const v = classifyHiringPost(p.text)
    if (v.hiring && p.hiring) tp += 1
    else if (v.hiring) {
      fp += 1
      misses.push(`FP ${p.id} ${v.score} ${v.reasons.join(', ')}`)
    } else if (p.hiring) {
      fn += 1
      misses.push(`FN ${p.id} ${v.score} ${v.reasons.join(', ')} / ${v.negatives.join(', ')}`)
    }
  }
  return { tp, fp, fn, precision: tp / Math.max(1, tp + fp), recall: tp / Math.max(1, tp + fn), misses }
}

describe('classifyHiringPost', () => {
  it('has 40 labelled synthetic posts', () => {
    expect(LABELLED_POSTS).toHaveLength(40)
    expect(LABELLED_POSTS.filter((p) => p.hiring)).toHaveLength(24)
  })

  it('keeps precision ≥ 90% (and recall ≥ 80%) on the labelled set', () => {
    const m = metrics()
    expect(m.misses).toEqual([])
    expect(m.precision).toBeGreaterThanOrEqual(0.9)
    expect(m.recall).toBeGreaterThanOrEqual(0.8)
  })

  it('reports held-out precision / recall (not tuned on; printed for docs)', () => {
    let tp = 0
    let fp = 0
    let fn = 0
    for (const p of HELD_OUT_POSTS) {
      const h = classifyHiringPost(p.text).hiring
      if (h && p.hiring) tp += 1
      else if (h) fp += 1
      else if (p.hiring) fn += 1
    }
    console.info(`held-out: tp=${tp} fp=${fp} fn=${fn} precision=${(tp / Math.max(1, tp + fp)).toFixed(2)} recall=${(tp / Math.max(1, tp + fn)).toFixed(2)}`)
    expect(tp + fp + fn).toBeGreaterThan(0)
  })

  it('explains a hiring verdict with reasons', () => {
    const v = classifyHiringPost("We're hiring a Laravel Developer in Dubai. Send your CV to jobs@acme.example")
    expect(v.hiring).toBe(true)
    expect(v.reasons).toContain('“We’re hiring”')
    expect(v.reasons).toContain('Asks for your CV')
    expect(v.negatives).toEqual([])
  })

  it('never calls a job seeker’s post hiring, even with hiring words', () => {
    const v = classifyHiringPost("#opentowork I'm looking for a new role. We're hiring? No, I am! Send your CV tips welcome.")
    expect(v.hiring).toBe(false)
    expect(v.negatives).toContain('Open to work')
  })

  it('needs a clear hiring phrase: supporting signals alone are not enough', () => {
    const v = classifyHiringPost('Laravel developer, 3 years experience, Dubai, DM me, apply now #jobs')
    expect(v.hiring).toBe(false)
  })

  it('reads Arabic hiring posts', () => {
    expect(classifyHiringPost('مطلوب مهندس برمجيات في الدوحة. أرسل سيرتك الذاتية').hiring).toBe(true)
    expect(classifyHiringPost('أبحث عن وظيفة مطور في الرياض').hiring).toBe(false)
  })

  it('handles empty and huge input', () => {
    expect(classifyHiringPost('').hiring).toBe(false)
    expect(classifyHiringPost(`We're hiring a PHP developer in Kuwait. ${'x '.repeat(50_000)}`).hiring).toBe(true)
  })
})
