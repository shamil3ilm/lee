import type { AIProvider } from '@/lib/ai/types'

/**
 * Stand-in provider when the user has no AI key: every call fails, which
 * the import pipeline already handles (scoring is skipped and retried on a
 * later discovery run; extraction falls back to links only).
 */
export function unavailableAi(reason: string): AIProvider {
  return new Proxy({} as AIProvider, {
    // Not a thenable: `await unavailableAi(…)` must not hang.
    get: (_target, prop) =>
      prop === 'then'
        ? undefined
        : async () => {
            throw new Error(reason)
          },
  })
}
