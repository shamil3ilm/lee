/**
 * Work-history lock: a tailored CV keeps every job's position, employer and
 * dates exactly as held. Background checks and GCC visa / attestation
 * paperwork compare titles and dates with the employer's letter, so
 * tailoring may change the headline, the order and the wording of bullets,
 * never these facts (spec §5.3). The number lock (./fact-lock.ts) guards
 * highlights; this guards the job lines.
 */

export interface WorkFact {
  employer: string
  position: string
  start: string
  end: string
}

function same(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

function sameFact(a: WorkFact, b: WorkFact): boolean {
  return same(a.employer, b.employer) && a.position.trim() === b.position.trim() && a.start.trim() === b.start.trim() && a.end.trim() === b.end.trim()
}

export interface WorkFactCheck {
  ok: boolean
  /** "PayCo: position “Senior Backend Engineer” ≠ “Backend Engineer”". */
  problems: string[]
}

/**
 * Every tailored job must be one of the master's jobs with the same
 * employer, position and dates (case-insensitive employer, exact position
 * and dates). A job the master doesn't have is a problem too. Leaving a job
 * out is allowed (variants select).
 */
export function checkWorkFacts(tailored: readonly WorkFact[], master: readonly WorkFact[]): WorkFactCheck {
  const problems: string[] = []
  const unused = [...master]
  for (const t of tailored) {
    const exact = unused.findIndex((m) => sameFact(m, t))
    if (exact >= 0) {
      unused.splice(exact, 1)
      continue
    }
    const byEmployer = unused.find((m) => same(m.employer, t.employer))
    if (!byEmployer) {
      problems.push(`${t.employer}: not an employer on your profile`)
      continue
    }
    if (t.position.trim() !== byEmployer.position.trim()) problems.push(`${t.employer}: position “${t.position}” ≠ “${byEmployer.position}”`)
    if (t.start.trim() !== byEmployer.start.trim() || t.end.trim() !== byEmployer.end.trim()) {
      problems.push(`${t.employer}: dates ${t.start}–${t.end} ≠ ${byEmployer.start}–${byEmployer.end}`)
    }
  }
  return { ok: problems.length === 0, problems }
}

export interface LockedWork<T> {
  items: T[]
  /** Jobs whose position or dates were put back to the master's. */
  restored: number
}

/**
 * Put each tailored job's position, employer spelling and dates back to the
 * master's (matched by employer, in order). Jobs with no master employer
 * are left for the caller's own employer check. Immutable.
 */
export function lockWorkFacts<T>(
  tailored: readonly T[],
  master: readonly T[],
  read: (x: T) => WorkFact,
  write: (x: T, f: WorkFact) => T,
): LockedWork<T> {
  const unused = master.map((m) => ({ m, f: read(m) }))
  let restored = 0
  const items = tailored.map((t) => {
    const f = read(t)
    const at = unused.findIndex((u) => sameFact(u.f, f))
    const idx = at >= 0 ? at : unused.findIndex((u) => same(u.f.employer, f.employer))
    if (idx < 0) return t
    const mf = unused.splice(idx, 1)[0]!.f
    if (sameFact(mf, f) && mf.employer === f.employer) return t
    if (!sameFact(mf, f)) restored++
    return write(t, mf)
  })
  return { items, restored }
}
