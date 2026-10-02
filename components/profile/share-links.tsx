'use client'
import { createContext, useContext, useState } from 'react'
import Link from 'next/link'
import { Link2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { LinkSuggestion } from '@/lib/profile/links'

interface SharedLinksState {
  suggestions: LinkSuggestion[]
  selected: readonly string[]
  toggle: (id: string) => void
}

const SharedLinksContext = createContext<SharedLinksState>({ suggestions: [], selected: [], toggle: () => {} })

/** Ids of the profile links ticked for this application's drafts. */
export function useSharedLinkIds(): readonly string[] {
  return useContext(SharedLinksContext).selected
}

interface ShareLinksProps {
  suggestions: LinkSuggestion[]
  children: React.ReactNode
}

/**
 * Selection state for "Links to include" on one application: suggested links
 * (matching case study, GitHub, portfolio) start ticked; the cover-letter and
 * outreach drafts anywhere inside send whatever stays ticked. Render
 * <ShareLinksCard /> where the checklist should appear.
 */
export function ShareLinksProvider({ suggestions, children }: ShareLinksProps) {
  const [selected, setSelected] = useState<string[]>(() => suggestions.filter((s) => s.suggested).map((s) => s.link.id))
  const toggle = (id: string): void =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  return <SharedLinksContext.Provider value={{ suggestions, selected, toggle }}>{children}</SharedLinksContext.Provider>
}

/** The "Links to include in drafts" checklist (nothing when there are no links). */
export function ShareLinksCard() {
  const { suggestions, selected, toggle } = useContext(SharedLinksContext)
  if (suggestions.length === 0) return null
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="size-4 text-muted-foreground" aria-hidden="true" />
          Links to include in drafts
        </CardTitle>
        <CardDescription>
          Suggested for this job; untick any you don’t want. Edit links in{' '}
          <Link href="/settings/profile#profile-links" className="underline underline-offset-2">Settings › Profile</Link>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {suggestions.map(({ link, reason }) => (
          <label key={link.id} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(link.id)}
              onChange={() => toggle(link.id)}
              className="mt-0.5 size-4 rounded border-input"
            />
            <span className="min-w-0">
              <span className="font-medium">{link.label}</span>
              {reason ? <span className="block text-xs text-muted-foreground">{reason}</span> : null}
            </span>
          </label>
        ))}
      </CardContent>
    </Card>
  )
}
