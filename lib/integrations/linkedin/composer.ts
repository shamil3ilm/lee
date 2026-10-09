import { and, desc, eq, isNotNull } from 'drizzle-orm'
import { getAIProviderForUser } from '@/lib/ai'
import type { LinkedInPostKind } from '@/lib/ai/prompts/linkedin'
import { db } from '@/lib/db/client'
import * as connQ from '@/lib/db/queries/integrationConnections'
import * as linkedinQ from '@/lib/db/queries/linkedin'
import { radarEntries, radarItems } from '@/lib/db/schema'
import { logger } from '@/lib/logger'
import { getResumeProfile } from '@/lib/resume/service'
import type { ResumeProfile } from '@/lib/resume/types'
import { acceptedFamilies } from '@/lib/variants/service'
import { linkedinAppConfig } from '../config'
import { IntegrationHttpError } from '../http'
import { consumeRateLimit, RATE_RULES } from '../rate-limit'
import { checkPostFacts, postLockMessage, profileFactText } from './facts'
import { LINKEDIN_SHARE_SCOPE } from './oauth'
import { buildPostPayload, createPost, MAX_POST_CHARS } from './share'

/**
 * SERVER-ONLY. The LinkedIn post composer (v16 §4.3, now with Share on
 * LinkedIn): pick a source → an AI draft built from that source's facts
 * only, fact-locked → the user edits and previews → Post, only on their
 * click. lee never schedules, auto-posts, likes, comments or connects.
 */

export interface ComposerSource {
  kind: LinkedInPostKind
  id: string
  label: string
  facts: string[]
  link: string | null
}

/** Interview-ready highlights only: a public post makes claims the user must defend. */
function achievementSources(profile: ResumeProfile): ComposerSource[] {
  const out: ComposerSource[] = []
  for (const w of profile.work) {
    for (const h of w.highlights.filter((x) => x.interviewReady)) {
      out.push({ kind: 'achievement', id: `w:${h.id}`, label: `${w.position} at ${w.name}: ${h.text.slice(0, 80)}`, facts: [`${w.position} at ${w.name}`, h.text], link: null })
    }
  }
  for (const p of profile.projects.filter((x) => x.interviewReady)) {
    for (const h of p.highlights.filter((x) => x.interviewReady)) {
      out.push({ kind: 'achievement', id: `p:${h.id}`, label: `${p.name}: ${h.text.slice(0, 80)}`, facts: [`Project ${p.name}${p.description ? `: ${p.description}` : ''}`, h.text], link: p.url || null })
    }
  }
  return out.slice(0, 40)
}

function caseStudySources(profile: ResumeProfile): ComposerSource[] {
  return profile.portfolio.caseStudies.map((c) => {
    const work = profile.work.find((w) => w.id === c.workId)
    const h = work?.highlights.find((x) => x.id === c.highlightId)
    return {
      kind: 'case_study' as const,
      id: `c:${c.id}`,
      label: c.title,
      facts: [c.title, work ? `${work.position} at ${work.name}` : '', h?.text ?? ''].filter(Boolean),
      link: c.url,
    }
  })
}

async function radarSources(userId: string): Promise<ComposerSource[]> {
  const entries = await db
    .select({ id: radarEntries.id, name: radarEntries.name })
    .from(radarEntries)
    .where(and(eq(radarEntries.userId, userId), isNotNull(radarEntries.savedAt)))
    .orderBy(desc(radarEntries.savedAt))
    .limit(10)
  const out: ComposerSource[] = []
  for (const e of entries) {
    const [item] = await db
      .select({ title: radarItems.title, url: radarItems.url, excerpt: radarItems.excerpt })
      .from(radarItems)
      .where(and(eq(radarItems.userId, userId), eq(radarItems.entryId, e.id)))
      .orderBy(desc(radarItems.publishedAt))
      .limit(1)
    out.push({
      kind: 'radar',
      id: `r:${e.id}`,
      label: e.name,
      facts: [e.name, item?.title ?? '', item?.excerpt?.slice(0, 300) ?? ''].filter(Boolean),
      link: item?.url?.startsWith('https://') ? item.url : null,
    })
  }
  return out
}

async function openToWorkSource(userId: string, profile: ResumeProfile): Promise<ComposerSource> {
  const families = (await acceptedFamilies(userId)).map((f) => f.label)
  const skills = profile.skills.flatMap((g) => g.skills.filter((s) => s.interviewReady).map((s) => s.name)).slice(0, 8)
  const latest = profile.work[0]
  return {
    kind: 'open_to_work',
    id: 'open',
    label: 'Open to work announcement',
    facts: [
      families.length > 0 ? `Looking for ${families.join(', ')} roles` : profile.basics.label ? `Looking for ${profile.basics.label} roles` : 'Looking for new roles',
      latest ? `Most recently ${latest.position} at ${latest.name}` : '',
      skills.length > 0 ? `Strengths: ${skills.join(', ')}` : '',
      profile.basics.location.city ? `Based in ${profile.basics.location.city}` : '',
    ].filter(Boolean),
    link: profile.basics.url || null,
  }
}

export async function listComposerSources(userId: string): Promise<ComposerSource[]> {
  const { profile } = await getResumeProfile(userId)
  return [...achievementSources(profile), ...caseStudySources(profile), ...(await radarSources(userId)), await openToWorkSource(userId, profile)]
}

async function findSource(userId: string, id: string): Promise<ComposerSource | null> {
  return (await listComposerSources(userId)).find((s) => s.id === id) ?? null
}

export type DraftResult = { ok: true; text: string; aiUsed: boolean } | { ok: false; error: string }

/** An AI draft from the source's facts; a draft that fails the fact lock is replaced by a plain template. */
export async function draftPost(userId: string, sourceId: string, now: Date = new Date()): Promise<DraftResult> {
  if (!(await consumeRateLimit(userId, 'linkedin_draft', RATE_RULES.linkedin_draft, now))) return { ok: false, error: 'Too many drafts this hour.' }
  const source = await findSource(userId, sourceId)
  if (!source) return { ok: false, error: 'That source is no longer available.' }
  const facts = source.facts.join('\n') + (source.link ? `\n${source.link}` : '')
  const template = [source.facts.join('\n'), source.link ?? ''].filter(Boolean).join('\n\n')
  try {
    const ai = await getAIProviderForUser(userId)
    const { text } = await ai.draftLinkedInPost({ kind: source.kind, facts: source.facts, link: source.link }, { userId })
    const trimmed = text.trim().slice(0, MAX_POST_CHARS)
    if (trimmed && checkPostFacts(trimmed, facts).ok) return { ok: true, text: trimmed, aiUsed: true }
    logger.warn('linkedin_draft_fact_lock', { userId })
    return { ok: true, text: template, aiUsed: false }
  } catch (e) {
    logger.warn('linkedin_draft_failed', { userId, err: e instanceof Error ? e.name : 'unknown' })
    return { ok: true, text: template, aiUsed: false }
  }
}

export const POST_SOURCE_KINDS = ['achievement', 'case_study', 'radar', 'open_to_work', 'custom'] as const
export type PostSourceKind = (typeof POST_SOURCE_KINDS)[number]

export type PostResult = { ok: true; url: string | null } | { ok: false; error: string }

/**
 * Publish the user's (edited) text — called only by the composer's Post
 * button. The text is fact-locked against the whole master profile plus the
 * chosen source, so an edit can reword but not invent numbers or links.
 */
export async function publishPost(
  userId: string,
  input: { text: string; sourceId: string | null; sourceKind: PostSourceKind },
  now: Date = new Date(),
): Promise<PostResult> {
  const text = input.text.trim()
  if (!text) return { ok: false, error: 'Write something first.' }
  if (text.length > MAX_POST_CHARS) return { ok: false, error: `LinkedIn posts are at most ${MAX_POST_CHARS} characters.` }
  const cfg = linkedinAppConfig()
  if (!cfg.ok) return { ok: false, error: 'LinkedIn is not configured on this deployment yet.' }
  const conn = await connQ.get(userId, 'linkedin')
  if (!conn) return { ok: false, error: 'Connect LinkedIn first.' }
  if (!conn.scopes.includes(LINKEDIN_SHARE_SCOPE)) return { ok: false, error: 'Reconnect LinkedIn with posting turned on.' }
  if (conn.accessExpiresAt && conn.accessExpiresAt.getTime() <= now.getTime()) return { ok: false, error: 'Your LinkedIn connection expired. Reconnect LinkedIn.' }
  const { profile } = await getResumeProfile(userId)
  const source = input.sourceId ? await findSource(userId, input.sourceId) : null
  const facts = [profileFactText(profile), ...(source?.facts ?? []), source?.link ?? ''].join('\n')
  const lock = checkPostFacts(text, facts)
  if (!lock.ok) return { ok: false, error: postLockMessage(lock) }
  if (!(await consumeRateLimit(userId, 'linkedin_post', RATE_RULES.linkedin_post, now))) return { ok: false, error: 'Daily post limit reached.' }
  const tokens = await connQ.getTokens(userId, 'linkedin')
  if (!tokens) return { ok: false, error: 'Reconnect LinkedIn.' }
  try {
    const { urn, url } = await createPost(cfg.config, tokens.access, buildPostPayload(conn.accountId, text))
    await linkedinQ.addPost(userId, { sourceKind: input.sourceKind, text, postUrn: urn, url })
    logger.info('linkedin_posted', { userId, kind: input.sourceKind })
    return { ok: true, url }
  } catch (e) {
    const status = e instanceof IntegrationHttpError ? e.status : null
    logger.warn('linkedin_post_failed', { userId, status })
    if (status === 401) return { ok: false, error: 'LinkedIn rejected the token. Reconnect LinkedIn.' }
    if (status === 403) return { ok: false, error: 'LinkedIn did not allow this post (check the Share on LinkedIn product and posting permission).' }
    if (status === 429) return { ok: false, error: 'LinkedIn rate limit reached. Try again tomorrow.' }
    return { ok: false, error: 'Could not post to LinkedIn. Nothing was published.' }
  }
}
