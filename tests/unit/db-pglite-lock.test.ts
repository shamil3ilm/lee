import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { acquirePgliteLock, lockPathFor, PgliteLockedError } from '@/lib/db/pglite-lock'
import { lazyObject } from '@/lib/db/lazy'

const dirs: string[] = []
function tempDb(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'lee-lock-'))
  dirs.push(root)
  return path.join(root, 'pglite')
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('acquirePgliteLock', () => {
  it('writes the owner pid next to the directory and removes it on release', () => {
    const dir = tempDb()
    const release = acquirePgliteLock(dir, { pid: 4242, isAlive: () => true })
    expect(readFileSync(lockPathFor(dir), 'utf8')).toBe('4242')
    release()
    expect(existsSync(lockPathFor(dir))).toBe(false)
  })

  it('refuses a directory a live process holds', () => {
    const dir = tempDb()
    acquirePgliteLock(dir, { pid: 1001, isAlive: () => true })
    expect(() => acquirePgliteLock(dir, { pid: 2002, isAlive: () => true })).toThrow(PgliteLockedError)
    expect(() => acquirePgliteLock(dir, { pid: 2002, isAlive: () => true })).toThrow(/already open in process 1001/)
  })

  it('takes over a lock left by a dead process', () => {
    const dir = tempDb()
    writeFileSync(lockPathFor(dir), '1001')
    const release = acquirePgliteLock(dir, { pid: 2002, isAlive: (pid) => pid !== 1001 })
    expect(readFileSync(lockPathFor(dir), 'utf8')).toBe('2002')
    release()
  })

  it('is re-entrant for the same process and never removes another owner’s lock', () => {
    const dir = tempDb()
    const first = acquirePgliteLock(dir, { pid: 7, isAlive: () => true })
    const again = acquirePgliteLock(dir, { pid: 7, isAlive: () => true })
    again()
    writeFileSync(lockPathFor(dir), '8')
    first()
    expect(readFileSync(lockPathFor(dir), 'utf8')).toBe('8')
  })
})

describe('lazyObject', () => {
  class Base {
    readonly tag: string = 'base'
    hello(): string {
      return `hi from ${this.tag}`
    }
  }
  class Real extends Base {
    override readonly tag: string = 'real'
  }

  it('creates nothing for instanceof checks and creates once on first use', () => {
    let created = 0
    let real: Real | undefined
    const obj = lazyObject<Real>(Base.prototype, () => {
      if (!real) {
        created += 1
        real = new Real()
      }
      return real
    })
    expect(obj instanceof Base).toBe(true)
    expect(created).toBe(0)
    expect(obj.hello()).toBe('hi from real')
    expect(obj.tag).toBe('real')
    expect(created).toBe(1)
  })

  it('lets properties defined on the proxy (spies) win', () => {
    const obj = lazyObject<Real>(Base.prototype, () => new Real())
    Object.defineProperty(obj, 'hello', { value: () => 'spied', configurable: true, writable: true })
    expect(obj.hello()).toBe('spied')
  })
})
