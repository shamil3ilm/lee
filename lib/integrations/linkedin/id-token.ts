import { createPublicKey, createVerify, type JsonWebKey } from 'node:crypto'

/**
 * SERVER-ONLY. Verify LinkedIn's OIDC id_token (RS256) against its JWKS
 * (https://www.linkedin.com/oauth/openid/jwks, from
 * https://www.linkedin.com/oauth/.well-known/openid-configuration):
 * signature, issuer, audience (our client id), expiry and the nonce we sent.
 */

export interface IdTokenClaims {
  sub: string
  name?: string
  given_name?: string
  family_name?: string
  picture?: string
  email?: string
  email_verified?: boolean | string
  nonce?: string
}

export class IdTokenError extends Error {
  constructor(readonly code: 'malformed' | 'signature' | 'issuer' | 'audience' | 'expired' | 'nonce') {
    super(`id_token ${code}`)
    this.name = 'IdTokenError'
  }
}

interface Jwk extends JsonWebKey {
  kid?: string
}

function decodePart<T>(part: string): T {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as T
  } catch {
    throw new IdTokenError('malformed')
  }
}

export function verifyIdToken(
  token: string,
  opts: { keys: readonly Jwk[]; issuers: readonly string[]; audience: string; nonce: string | null; now?: Date },
): IdTokenClaims {
  const parts = token.split('.')
  if (parts.length !== 3) throw new IdTokenError('malformed')
  const [h, p, s] = parts as [string, string, string]
  const header = decodePart<{ alg?: string; kid?: string }>(h)
  if (header.alg !== 'RS256') throw new IdTokenError('signature')
  if (!header.kid) throw new IdTokenError('signature')
  const jwk = opts.keys.find((k) => k.kid === header.kid && k.kty === 'RSA')
  if (!jwk) throw new IdTokenError('signature')
  let valid = false
  try {
    const key = createPublicKey({ key: jwk, format: 'jwk' })
    valid = createVerify('RSA-SHA256').update(`${h}.${p}`).verify(key, Buffer.from(s, 'base64url'))
  } catch {
    valid = false
  }
  if (!valid) throw new IdTokenError('signature')
  const claims = decodePart<IdTokenClaims & { iss?: string; aud?: string | string[]; exp?: number }>(p)
  if (!claims.iss || !opts.issuers.includes(claims.iss)) throw new IdTokenError('issuer')
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!aud.includes(opts.audience)) throw new IdTokenError('audience')
  const nowSec = Math.floor((opts.now ?? new Date()).getTime() / 1000)
  if (typeof claims.exp !== 'number' || claims.exp + 60 < nowSec) throw new IdTokenError('expired')
  if (opts.nonce !== null && claims.nonce !== opts.nonce) throw new IdTokenError('nonce')
  if (typeof claims.sub !== 'string' || !claims.sub) throw new IdTokenError('malformed')
  return claims
}
