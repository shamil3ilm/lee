'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUserId } from '@/lib/auth/require-session'
import * as connQ from '@/lib/db/queries/integrationConnections'
import type { IntegrationProvider } from '@/lib/integrations/config'
import { disconnectGitHub, startGitHubConnect, testGitHub } from '@/lib/integrations/github/service'
import { disconnectLinkedIn, startLinkedInConnect } from '@/lib/integrations/linkedin/service'
import { stateCookieName, stateCookieOptions } from '@/lib/integrations/oauth-state'
import { logger } from '@/lib/logger'

/**
 * Connect / Disconnect / Test for GitHub and LinkedIn (Settings ›
 * Integrations). Server actions, so Next's origin check makes them
 * CSRF-safe; each is scoped to the signed-in user and rate-limited in
 * lib/integrations/rate-limit.ts. "Connect" sets the state cookie and
 * returns the provider URL the browser then opens.
 */

export type ConnectResult = { ok: true; url: string } | { ok: false; error: string }
export type SimpleResult = { ok: true; message: string } | { ok: false; error: string }

async function setStateCookie(provider: IntegrationProvider, state: string): Promise<void> {
  const store = await cookies()
  store.set(stateCookieName(provider), state, stateCookieOptions(provider))
}

export async function connectGitHubAction(): Promise<ConnectResult> {
  const userId = await requireUserId()
  try {
    const r = await startGitHubConnect(userId)
    if (!r.ok) return r
    await setStateCookie('github', r.state)
    return { ok: true, url: r.url }
  } catch (err) {
    logger.error('github_connect_start_failed', { userId, err: err instanceof Error ? err.name : 'unknown' })
    return { ok: false, error: 'Could not start Connect GitHub.' }
  }
}

export async function disconnectGitHubAction(): Promise<SimpleResult> {
  const userId = await requireUserId()
  try {
    const r = await disconnectGitHub(userId)
    if (!r.ok) return { ok: false, error: r.error ?? 'Could not disconnect.' }
    revalidatePath('/settings/integrations')
    return {
      ok: true,
      message: r.revoked
        ? 'GitHub disconnected and the authorization revoked.'
        : 'GitHub disconnected here. GitHub could not confirm the revocation; you can also remove lee in GitHub › Settings › Applications.',
    }
  } catch (err) {
    logger.error('github_disconnect_failed', { userId, err: err instanceof Error ? err.name : 'unknown' })
    return { ok: false, error: 'Could not disconnect GitHub.' }
  }
}

export async function testGitHubAction(): Promise<SimpleResult> {
  const userId = await requireUserId()
  try {
    const r = await testGitHub(userId)
    return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.message }
  } catch (err) {
    logger.error('github_test_failed', { userId, err: err instanceof Error ? err.name : 'unknown' })
    return { ok: false, error: 'Could not test the connection.' }
  }
}

export async function setFollowStarredAction(on: boolean): Promise<SimpleResult> {
  const userId = await requireUserId()
  const parsed = z.boolean().safeParse(on)
  if (!parsed.success) return { ok: false, error: 'Invalid setting.' }
  await connQ.updateMeta(userId, 'github', { settings: { followStarred: parsed.data } })
  revalidatePath('/settings/integrations')
  return { ok: true, message: parsed.data ? 'Starred repos will be suggested for Radar.' : 'Starred repos are no longer suggested.' }
}

export async function connectLinkedInAction(posting: boolean): Promise<ConnectResult> {
  const userId = await requireUserId()
  const parsed = z.boolean().safeParse(posting)
  if (!parsed.success) return { ok: false, error: 'Invalid setting.' }
  try {
    const r = await startLinkedInConnect(userId, { posting: parsed.data })
    if (!r.ok) return r
    await setStateCookie('linkedin', r.state)
    return { ok: true, url: r.url }
  } catch (err) {
    logger.error('linkedin_connect_start_failed', { userId, err: err instanceof Error ? err.name : 'unknown' })
    return { ok: false, error: 'Could not start Connect LinkedIn.' }
  }
}

export async function disconnectLinkedInAction(): Promise<SimpleResult> {
  const userId = await requireUserId()
  try {
    const r = await disconnectLinkedIn(userId)
    if (!r.ok) return { ok: false, error: r.error ?? 'Could not disconnect.' }
    revalidatePath('/settings/integrations')
    return { ok: true, message: 'LinkedIn disconnected: the token was deleted from lee.' }
  } catch (err) {
    logger.error('linkedin_disconnect_failed', { userId, err: err instanceof Error ? err.name : 'unknown' })
    return { ok: false, error: 'Could not disconnect LinkedIn.' }
  }
}
