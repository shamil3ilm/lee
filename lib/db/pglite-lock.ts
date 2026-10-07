import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * One process per PGlite data directory.
 *
 * PGlite is an embedded, single-connection Postgres: two processes that open
 * the same directory each run their own Postgres over the same files. The
 * second one either PANICs during startup ("could not locate a valid
 * checkpoint record" → `RuntimeError: Aborted()`) or, worse, runs crash
 * recovery over files the first one is still writing. `next dev` forks
 * short-lived worker processes (the static-paths worker for every dynamic
 * route) that load the app's modules, so this is not hypothetical:
 * docs/performance.md "PGlite: one process per directory".
 *
 * A sibling `<dir>.lock` file holds the owner's pid. Opening a directory owned
 * by another live process fails loudly instead; a lock left by a dead process
 * is taken over. In-memory databases need no lock.
 */

export class PgliteLockedError extends Error {
  constructor(dir: string, ownerPid: number) {
    super(
      `PGlite data directory ${dir} is already open in process ${ownerPid}. ` +
        'PGlite allows one process per directory: stop that process (dev server, seed, migrate) first.',
    )
    this.name = 'PgliteLockedError'
  }
}

export interface LockDeps {
  pid: number
  isAlive: (pid: number) => boolean
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    // EPERM: it exists but belongs to someone else.
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

const DEFAULT_DEPS: LockDeps = { pid: process.pid, isAlive: isProcessAlive }

export function lockPathFor(dir: string): string {
  return `${path.resolve(dir)}.lock`
}

function readOwner(file: string): number | null {
  try {
    const pid = Number(readFileSync(file, 'utf8').trim())
    return Number.isInteger(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

/**
 * Take the directory's lock for this process; returns the release function.
 * Throws PgliteLockedError when another live process holds it.
 */
export function acquirePgliteLock(dir: string, deps: LockDeps = DEFAULT_DEPS): () => void {
  const file = lockPathFor(dir)
  try {
    writeFileSync(file, String(deps.pid), { flag: 'wx' })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
    const owner = readOwner(file)
    if (owner !== null && owner !== deps.pid && deps.isAlive(owner)) throw new PgliteLockedError(path.resolve(dir), owner)
    // Stale (dead owner, unreadable) or already ours: take it over.
    writeFileSync(file, String(deps.pid))
  }
  let released = false
  return () => {
    if (released) return
    released = true
    if (readOwner(file) === deps.pid) rmSync(file, { force: true })
  }
}
