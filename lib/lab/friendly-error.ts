import { PROVIDERS } from './providers/catalog'
import { MissingKeyError, ProviderError, RateLimitedError } from './providers/errors'
import type { ErrorKind } from './views'

/**
 * Model Lab: provider failures as words people can act on. The raw
 * (already redacted) provider message, e.g. "google returned 400: …", is
 * kept for a "Details" disclosure and the server log; the headline and the
 * advice come from the error kind. Client-safe (no I/O).
 */

export interface FriendlyLabError {
  /** Short headline, e.g. "Request rejected". */
  title: string
  /** One or two sentences on what happened and what to try. */
  message: string
}

/** Display name for a provider id ("google" → "Google AI Studio"). */
export function providerLabel(provider: string | null | undefined): string {
  if (!provider) return 'The provider'
  return PROVIDERS.find((p) => p.id === provider)?.label ?? provider
}

/** Error kind for any thrown value from a provider call. */
export function classifyLabError(e: unknown): ErrorKind {
  if (e instanceof RateLimitedError) return 'rate_limited'
  if (e instanceof MissingKeyError) return 'missing_key'
  if (!(e instanceof ProviderError)) return 'error'
  if (e.code === 'auth') return 'auth'
  if (e.code === 'timeout') return 'timeout'
  if (e.code === 'network') return 'network'
  if (e.code === 'bad_request') return 'bad_request'
  if (e.status !== undefined && e.status >= 500) return 'unavailable'
  return 'error'
}

/** Friendly headline + advice for an Arena / model-list failure. */
export function friendlyLabError(
  kind: ErrorKind | undefined,
  provider?: string | null,
): FriendlyLabError {
  const name = providerLabel(provider)
  switch (kind) {
    case 'rate_limited':
      return {
        title: 'Rate limited',
        message: `${name} hit its free-tier limit. Wait a minute and try again, or pick another model.`,
      }
    case 'missing_key':
      return { title: 'No API key', message: `Add a ${name} key in Settings › AI to use this model.` }
    case 'auth':
      return {
        title: 'Key rejected',
        message: `${name} did not accept the API key. Check or replace it in Settings › AI.`,
      }
    case 'timeout':
      return { title: 'Timed out', message: `${name} took too long to answer. Try again or use a smaller prompt.` }
    case 'network':
      return { title: 'Could not connect', message: `${name} could not be reached. Check your connection and try again.` }
    case 'unavailable':
      return { title: 'Provider unavailable', message: `${name} is having problems right now. Try again later.` }
    case 'bad_request':
      return {
        title: 'Request rejected',
        message: `${name} could not run this request. The model may not support these settings or the prompt is too long. Try another model or a shorter prompt.`,
      }
    default:
      return { title: 'Model call failed', message: `${name} returned an error. Try again or pick another model.` }
  }
}
