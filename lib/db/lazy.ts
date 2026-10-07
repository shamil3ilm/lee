/**
 * A stand-in for an object that is only created on first use.
 *
 * The proxy's own prototype is `prototype` (e.g. drizzle's `PgDatabase`), so
 * `instanceof` and drizzle's `is()` checks — the Auth.js adapter runs one
 * when its module loads — pass without creating anything. Any property read
 * creates the real object once (`load`) and forwards to it; methods are bound
 * to it. Properties defined on the proxy itself (a test's `vi.spyOn`) win
 * over the real object's.
 */
export function lazyObject<T extends object>(prototype: object, load: () => T): T {
  const target = Object.create(prototype) as T
  return new Proxy(target, {
    get(t, prop) {
      if (Object.prototype.hasOwnProperty.call(t, prop)) return Reflect.get(t, prop)
      const real = load()
      const value: unknown = Reflect.get(real, prop, real)
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(real) : value
    },
    has(t, prop) {
      return Object.prototype.hasOwnProperty.call(t, prop) || prop in load()
    },
  })
}
