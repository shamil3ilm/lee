'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Loader2, MailCheck, PenLine } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LocalTime } from '@/components/local-time'
import { completeFollowupAction } from '@/app/(authed)/shortlist/actions'

export interface DueFollowupItem {
  applicationId: string
  jobTitle: string
  companyName: string | null
  dueAt: string
}

/**
 * Follow-ups due from "Mark applied". "Draft follow-up" writes a polite
 * email with the existing outreach prompt for the user to copy or send
 * themselves; lee never sends it. A Gmail-matched reply removes the row.
 */
export function DueFollowups({ items }: { items: DueFollowupItem[] }) {
  if (items.length === 0) return null
  return (
    <Card data-testid="due-followups">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2">
          <MailCheck className="size-4 text-muted-foreground" aria-hidden="true" />
          Due follow-ups
        </CardTitle>
        <Badge variant="secondary">{items.length}</Badge>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-y">
          {items.map((it) => (
            <Row key={it.applicationId} item={it} />
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function Row({ item }: { item: DueFollowupItem }) {
  const router = useRouter()
  const [drafting, setDrafting] = useState(false)
  const [docId, setDocId] = useState<string | null>(null)
  const [closing, startClose] = useTransition()

  async function draft(): Promise<void> {
    setDrafting(true)
    try {
      const res = await fetch(`/api/applications/${item.applicationId}/documents/generate-followup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = (await res.json().catch(() => ({}))) as { documentId?: string; error?: string; skipped?: boolean; message?: string; fixHint?: string }
      if (json.skipped) toast.warning([json.message, json.fixHint].filter(Boolean).join(' ') || 'Follow-up skipped.')
      else if (res.ok && json.documentId) {
        setDocId(json.documentId)
        toast.success('Follow-up drafted. Copy it and send it yourself.')
      } else toast.error(json.error ?? 'Could not draft the follow-up.')
    } catch {
      toast.error('Could not draft the follow-up.')
    } finally {
      setDrafting(false)
    }
  }

  const done = (): void =>
    startClose(async () => {
      const r = await completeFollowupAction(item.applicationId)
      if ('error' in r) toast.error(r.error)
      router.refresh()
    })

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2 text-sm">
      <Link href={`/applications/${item.applicationId}`} className="min-w-0 flex-1 basis-48 hover:underline">
        <div className="truncate font-medium">{item.companyName ?? 'Unknown company'}</div>
        <div className="truncate text-xs text-muted-foreground">
          {item.jobTitle} · due <LocalTime date={item.dueAt} format="date" />
        </div>
      </Link>
      <div className="flex items-center gap-2">
        {docId ? (
          <Button asChild size="sm" variant="outline">
            <Link href={`/documents/${docId}`}>Open draft</Link>
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => void draft()} disabled={drafting}>
            {drafting ? <Loader2 className="size-4 animate-spin" /> : <PenLine className="size-4" />}
            Draft follow-up
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={done} disabled={closing} aria-label={`Mark the follow-up for ${item.companyName ?? item.jobTitle} done`}>
          {closing ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Done
        </Button>
      </div>
    </li>
  )
}
