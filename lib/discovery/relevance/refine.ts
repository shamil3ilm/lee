import type { AIProvider } from '@/lib/ai'
import { checkRoleSuggestionSignal } from '@/lib/ai/signal'
import type { UserProfile } from '@/lib/db/queries/profile'
import type { MasterCV } from '@/lib/documents/types'
import { resolveRoleFamily, ROLE_FAMILIES, roleFamilyLabel } from './roles'
import { profileDigest, type RoleSuggestion, type SuggestionResult } from './suggest'

export type RefineResult =
  | { ok: true; suggestions: RoleSuggestion[] }
  | { ok: false; code: string; message: string; fixHint?: string }

const MAX_AI_SUGGESTIONS = 4

/**
 * Optional AI pass over the deterministic suggestions: asks the user's
 * provider for up to four more families, grounded in the profile + master
 * CV digest. Gated by the `suggest_roles` signal check; every returned
 * family must be a known id that is neither targeted nor already suggested.
 */
export async function refineSuggestionsWithAI(args: {
  userId: string
  ai: AIProvider
  profile: UserProfile | null
  masterCv: MasterCV | null
  base: SuggestionResult
}): Promise<RefineResult> {
  const digest = profileDigest({ profile: args.profile, masterCv: args.masterCv })
  const signal = checkRoleSuggestionSignal(digest)
  if (!signal.ok) return signal
  const targeted = (args.profile?.roleTypes ?? [])
    .map((r) => resolveRoleFamily(r))
    .filter((f): f is string => f !== null)
  const exclude = [...new Set([...targeted, ...args.base.suggestions.map((s) => s.family)])]
  const dismissed = new Set(args.profile?.dismissedRoleSuggestions ?? [])
  const known = new Set(ROLE_FAMILIES.map((f) => f.id))
  const result = await args.ai.suggestRoles(
    { digest, families: ROLE_FAMILIES.map((f) => ({ id: f.id, label: f.label })), exclude },
    { userId: args.userId },
  )
  const seen = new Set<string>()
  const suggestions: RoleSuggestion[] = []
  for (const s of result.suggestions) {
    const id = `ai_${s.family}`
    if (!known.has(s.family) || exclude.includes(s.family) || dismissed.has(id) || seen.has(s.family)) continue
    seen.add(s.family)
    suggestions.push({
      id,
      family: s.family,
      label: roleFamilyLabel(s.family),
      reasons: [s.reason.trim() || 'Suggested by AI from your profile and master CV'],
      priority: 'possible',
      source: 'ai',
    })
    if (suggestions.length >= MAX_AI_SUGGESTIONS) break
  }
  return { ok: true, suggestions }
}
