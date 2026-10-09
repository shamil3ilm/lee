import { createSign } from 'node:crypto'

/**
 * SERVER-ONLY. The GitHub App's own JWT (RS256), used only to mint
 * short-lived installation tokens. Per
 * https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app
 * `iat` is 60 s in the past (clock drift), `exp` at most 10 minutes ahead,
 * `iss` the App ID.
 */

function part(v: unknown): string {
  return Buffer.from(JSON.stringify(v)).toString('base64url')
}

export function createAppJwt(appId: string, privateKeyPem: string, now: Date = new Date()): string {
  const iat = Math.floor(now.getTime() / 1000) - 60
  const unsigned = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({ iat, exp: iat + 9 * 60, iss: appId })}`
  const signature = createSign('RSA-SHA256').update(unsigned).sign(privateKeyPem).toString('base64url')
  return `${unsigned}.${signature}`
}
