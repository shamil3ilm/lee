'use client'
import { useState, useTransition } from 'react'
import { Link2, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { saveProfileLinksAction } from '@/app/(authed)/settings/profile/import-actions'
import { LINK_KIND_LABELS, LINK_KINDS, MAX_LINKS, type LinkKind, type ProfileLink } from '@/lib/profile/links'

const selectCls =
  'h-9 rounded-md border border-input bg-card px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}

/**
 * Labelled links on the profile. Cover letters and outreach suggest the
 * relevant ones per job (e.g. a payments case study for a payments role);
 * the user ticks which to include.
 */
export function ProfileLinksCard({ initial }: { initial: ProfileLink[] }) {
  const [links, setLinks] = useState<ProfileLink[]>(initial)
  const [pending, start] = useTransition()

  const update = (id: string, patch: Partial<ProfileLink>): void =>
    setLinks((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  const add = (): void => setLinks((ls) => [...ls, { id: newId(), label: '', url: 'https://', kind: 'portfolio' }])
  const remove = (id: string): void => setLinks((ls) => ls.filter((l) => l.id !== id))
  const save = (): void =>
    start(async () => {
      const r = await saveProfileLinksAction(links.filter((l) => l.label.trim() || l.url.trim() !== 'https://'))
      if ('error' in r) toast.error(r.error)
      else toast.success('Links saved')
    })

  return (
    <Card id="profile-links">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="size-4 text-muted-foreground" aria-hidden="true" />
          Links
        </CardTitle>
        <CardDescription>
          Portfolio, case studies, GitHub, LinkedIn, résumé page. Drafts suggest the ones that fit each job; you choose.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {links.length === 0 ? <p className="text-sm text-muted-foreground">No links yet.</p> : null}
        {links.map((l, i) => (
          <div key={l.id} className="grid gap-2 sm:grid-cols-[10rem_1fr_1.4fr_auto] sm:items-center">
            <select
              aria-label={`Link ${i + 1} kind`}
              value={l.kind}
              onChange={(e) => update(l.id, { kind: e.target.value as LinkKind })}
              className={selectCls}
            >
              {LINK_KINDS.map((k) => (
                <option key={k} value={k}>
                  {LINK_KIND_LABELS[k]}
                </option>
              ))}
            </select>
            <Input aria-label={`Link ${i + 1} label`} value={l.label} placeholder="Label, e.g. Case study: payment approvals" onChange={(e) => update(l.id, { label: e.target.value })} />
            <Input aria-label={`Link ${i + 1} URL`} value={l.url} type="url" onChange={(e) => update(l.id, { url: e.target.value })} />
            <Button type="button" size="sm" variant="ghost" className="h-9 w-9 justify-self-end p-0" onClick={() => remove(l.id)} aria-label={`Remove link ${i + 1}`}>
              <X className="size-4" />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap justify-between gap-2">
          <Button type="button" size="sm" variant="outline" onClick={add} disabled={links.length >= MAX_LINKS}>
            <Plus className="size-3.5" />
            Add link
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={pending}>
            {pending ? 'Saving…' : 'Save links'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
