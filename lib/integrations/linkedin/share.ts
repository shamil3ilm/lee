import type { LinkedInAppConfig } from '../config'
import { IntegrationHttpError, integrationFetch } from '../http'

/**
 * Share on LinkedIn through the Posts API (it replaces ugcPosts), per
 * https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
 *   POST /rest/posts, headers `Linkedin-Version: YYYYMM` and
 *   `X-Restli-Protocol-Version: 2.0.0`; 201 with the post URN in
 *   `x-restli-id`. Scope `w_member_social`. Text-only member posts.
 * Called ONLY from the composer's explicit "Post" click — never on a
 * schedule, never to like, comment or connect (API Terms §3.1.26).
 */

/** Versions are supported for about a year; 202510 sunsets Oct 15, 2026. */
export const LINKEDIN_API_VERSION = '202609'
/** LinkedIn's commentary limit. */
export const MAX_POST_CHARS = 3000

export interface PostPayload {
  author: string
  commentary: string
  visibility: 'PUBLIC'
  distribution: { feedDistribution: 'MAIN_FEED'; targetEntities: []; thirdPartyDistributionChannels: [] }
  lifecycleState: 'PUBLISHED'
  isReshareDisabledByAuthor: false
}

/**
 * "little" text format: these characters are markup and must be escaped
 * to show literally (…/shares/little-text-format).
 */
export function escapeLittleText(text: string): string {
  return text.replace(/[\\|{}@[\]()<>#*_~]/g, (c) => `\\${c}`)
}

export function buildPostPayload(memberSub: string, text: string): PostPayload {
  return {
    author: `urn:li:person:${memberSub}`,
    commentary: escapeLittleText(text),
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  }
}

export function postUrl(urn: string): string {
  return `https://www.linkedin.com/feed/update/${urn}/`
}

export async function createPost(cfg: LinkedInAppConfig, accessToken: string, payload: PostPayload): Promise<{ urn: string | null; url: string | null }> {
  const res = await integrationFetch(`${cfg.apiBase}/rest/posts`, {
    bases: [cfg.apiBase],
    label: 'linkedin-post',
    init: {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
        'linkedin-version': LINKEDIN_API_VERSION,
        'x-restli-protocol-version': '2.0.0',
      },
      body: JSON.stringify(payload),
    },
  })
  if (res.status !== 201 && !res.ok) throw new IntegrationHttpError('linkedin-post', res.status)
  const urn = res.headers.get('x-restli-id')
  const safe = urn && /^urn:li:(share|ugcPost):[0-9]+$/.test(urn) ? urn : null
  return { urn: safe, url: safe ? postUrl(safe) : null }
}
