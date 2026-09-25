'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Clock, Copy, Loader2, MessageSquare, RefreshCw, Sparkles } from 'lucide-react'
import type { Document } from '@/lib/db/queries/documents'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { relativeFromNow } from '@/lib/ui/date'

type OutreachKind =
  | 'linkedin_connection'
  | 'linkedin_message'
  | 'recruiter_reply'
  | 'followup_email'
type OutreachTone = 'formal' | 'friendly' | 'enthusiastic'
type TabValue = 'connection' | 'message' | 'recruiter' | 'followup'
type FollowupInterval = 7 | 14 | 21 | 30

interface OutreachCardProps {
  applicationId: string
  outreachDocs: Document[]
  // v4.2 — needed so the follow-up tab can show a hint when appliedAt is
  // missing (otherwise the server route would 400 with "set applied-at first").
  appliedAt?: string | null
}

const TAB_TO_KIND: Record<Exclude<TabValue, 'followup'>, OutreachKind> = {
  connection: 'linkedin_connection',
  message: 'linkedin_message',
  recruiter: 'recruiter_reply',
}

const KIND_TO_TAB: Record<string, TabValue> = {
  outreach_linkedin_connection: 'connection',
  outreach_linkedin_message: 'message',
  outreach_recruiter_reply: 'recruiter',
  outreach_followup_email: 'followup',
}

const TAB_LABEL: Record<TabValue, string> = {
  connection: 'Connection',
  message: 'Message',
  recruiter: 'Recruiter Reply',
  followup: 'Follow-up',
}

const FOLLOWUP_INTERVALS: ReadonlyArray<{
  days: FollowupInterval
  label: string
  hint: string
}> = [
  { days: 7, label: '7-day check-in', hint: 'Gentle nudge' },
  { days: 14, label: '14-day value-add', hint: 'Share a relevant artefact' },
  { days: 21, label: '21-day reiteration', hint: 'Ask about timeline' },
  { days: 30, label: '30-day close-loop', hint: 'Ask for a decision' },
]

interface OutreachContent {
  body?: string
  subject?: string
  tone?: OutreachTone
  wordCount?: number
  notes?: string
  daysSince?: number
}

function readContent(doc: Document): OutreachContent {
  const c = doc.content
  if (typeof c !== 'object' || c === null) return {}
  return c as OutreachContent
}

function latestForTab(docs: Document[], tab: TabValue): Document | null {
  // Docs come sorted desc by createdAt from the query; first match wins.
  for (const d of docs) {
    if (KIND_TO_TAB[d.kind] === tab) return d
  }
  return null
}

function followupDocsByInterval(docs: Document[]): Record<FollowupInterval, Document | null> {
  // Latest doc per interval bucket. Docs are pre-sorted desc so first match
  // per bucket wins.
  const out: Record<FollowupInterval, Document | null> = {
    7: null,
    14: null,
    21: null,
    30: null,
  }
  for (const d of docs) {
    if (KIND_TO_TAB[d.kind] !== 'followup') continue
    const content = readContent(d)
    const bucket = content.daysSince
    if (bucket === 7 || bucket === 14 || bucket === 21 || bucket === 30) {
      if (!out[bucket]) out[bucket] = d
    }
  }
  return out
}

export function OutreachCard({
  applicationId,
  outreachDocs,
  appliedAt,
}: OutreachCardProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabValue>('connection')
  const [tone, setTone] = useState<OutreachTone>('friendly')
  const [busyTab, setBusyTab] = useState<TabValue | null>(null)
  // For the follow-up tab we need per-interval busy tracking so only the
  // clicked button spins.
  const [busyFollowup, setBusyFollowup] = useState<FollowupInterval | null>(null)
  // Per-tab local edits so switching tabs preserves any in-progress tweaks.
  const [drafts, setDrafts] = useState<Partial<Record<TabValue, string>>>({})
  const [followupDrafts, setFollowupDrafts] = useState<
    Partial<Record<FollowupInterval, string>>
  >({})

  const latestByTab = useMemo(
    () => ({
      connection: latestForTab(outreachDocs, 'connection'),
      message: latestForTab(outreachDocs, 'message'),
      recruiter: latestForTab(outreachDocs, 'recruiter'),
    }),
    [outreachDocs],
  )

  const followupsByInterval = useMemo(
    () => followupDocsByInterval(outreachDocs),
    [outreachDocs],
  )

  async function generate(tab: Exclude<TabValue, 'followup'>): Promise<void> {
    setBusyTab(tab)
    try {
      const res = await fetch(
        `/api/applications/${applicationId}/documents/generate-outreach`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: TAB_TO_KIND[tab], tone }),
        },
      )
      const json = (await res.json().catch(() => ({}))) as {
        documentId?: string
        error?: string
      }
      if (res.ok && json.documentId) {
        toast.success(`${TAB_LABEL[tab]} drafted`)
        setDrafts((prev) => {
          const next = { ...prev }
          delete next[tab]
          return next
        })
        router.refresh()
      } else {
        toast.error(json.error ?? 'Could not draft outreach.')
      }
    } catch {
      toast.error('Network error — could not draft outreach.')
    } finally {
      setBusyTab(null)
    }
  }

  async function generateFollowup(days: FollowupInterval): Promise<void> {
    setBusyFollowup(days)
    try {
      const res = await fetch(
        `/api/applications/${applicationId}/documents/generate-followup`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tone, daysSince: days }),
        },
      )
      const json = (await res.json().catch(() => ({}))) as {
        documentId?: string
        error?: string
      }
      if (res.ok && json.documentId) {
        toast.success(`Day ${days} follow-up drafted`)
        setFollowupDrafts((prev) => {
          const next = { ...prev }
          delete next[days]
          return next
        })
        router.refresh()
      } else {
        toast.error(json.error ?? 'Could not draft follow-up.')
      }
    } catch {
      toast.error('Network error — could not draft follow-up.')
    } finally {
      setBusyFollowup(null)
    }
  }

  async function copyToClipboard(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Could not copy to clipboard.')
    }
  }

  function renderTab(tab: Exclude<TabValue, 'followup'>): React.ReactElement {
    const latest = latestByTab[tab]
    const content = latest ? readContent(latest) : null
    // Local edit wins over server content when the user has typed.
    const currentBody = drafts[tab] ?? content?.body ?? ''
    const wordCount = currentBody.trim().length
      ? currentBody.trim().split(/\s+/).length
      : 0
    const charCount = currentBody.length
    const busy = busyTab === tab

    if (!latest) {
      return (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
          <Sparkles className="size-5" />
          <span>No {TAB_LABEL[tab].toLowerCase()} drafted yet.</span>
          <Button
            type="button"
            size="sm"
            className="mt-2"
            onClick={() => {
              void generate(tab)
            }}
            disabled={busy}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {busy ? 'Drafting…' : 'Draft'}
          </Button>
        </div>
      )
    }

    return (
      <div className="space-y-2">
        {content?.subject ? (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
            <span className="font-semibold text-muted-foreground">Subject:</span>{' '}
            <span className="font-medium">{content.subject}</span>
          </div>
        ) : null}
        <Textarea
          key={`${latest.id}-${tab}`}
          defaultValue={content?.body ?? ''}
          onChange={(e) =>
            setDrafts((prev) => ({ ...prev, [tab]: e.currentTarget.value }))
          }
          className="min-h-[200px] font-mono text-xs"
          aria-label={`${TAB_LABEL[tab]} draft`}
        />
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {wordCount} words · {charCount} chars
          </span>
          <span>
            v{latest.version} · {relativeFromNow(latest.createdAt)}
          </span>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              void generate(tab)
            }}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Re-draft
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void copyToClipboard(currentBody)
            }}
            disabled={currentBody.length === 0}
          >
            <Copy className="size-3.5" />
            Copy
          </Button>
        </div>
      </div>
    )
  }

  function renderFollowupTab(): React.ReactElement {
    // Without an applied-at date the server route will 400. Show a hint that
    // links back to the same detail page so the user can backfill via the
    // status picker (which sets appliedAt on transition to 'applied').
    if (!appliedAt) {
      return (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
          <Clock className="size-5" />
          <span>
            Set the applied-at date on this application to enable follow-ups.
          </span>
          <Button asChild size="sm" variant="outline" className="mt-2">
            <Link href={`/applications/${applicationId}`}>Open application</Link>
          </Button>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FOLLOWUP_INTERVALS.map(({ days, label, hint }) => {
            const existing = followupsByInterval[days]
            const busy = busyFollowup === days
            return (
              <Button
                key={days}
                type="button"
                variant={existing ? 'outline' : 'default'}
                size="sm"
                className="flex h-auto flex-col items-start gap-0.5 px-3 py-2 text-left"
                onClick={() => {
                  void generateFollowup(days)
                }}
                disabled={busy}
                title={hint}
              >
                <span className="flex w-full items-center gap-1 text-xs font-semibold">
                  {busy ? <Loader2 className="size-3 animate-spin" /> : null}
                  {label}
                </span>
                <span className="text-[10px] font-normal opacity-70">
                  {existing ? `v${existing.version} drafted` : hint}
                </span>
              </Button>
            )
          })}
        </div>

        <div className="space-y-3">
          {FOLLOWUP_INTERVALS.map(({ days }) => {
            const doc = followupsByInterval[days]
            if (!doc) return null
            const content = readContent(doc)
            const currentBody = followupDrafts[days] ?? content.body ?? ''
            const wordCount = currentBody.trim().length
              ? currentBody.trim().split(/\s+/).length
              : 0
            return (
              <div key={days} className="rounded-md border bg-muted/20 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <Badge variant="violet" className="text-[10px]">
                    day {days}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    v{doc.version} · {relativeFromNow(doc.createdAt)}
                  </span>
                </div>
                {content.subject ? (
                  <div className="mb-2 rounded border bg-background px-2 py-1 text-xs">
                    <span className="font-semibold text-muted-foreground">
                      Subject:
                    </span>{' '}
                    <span className="font-medium">{content.subject}</span>
                  </div>
                ) : null}
                <Textarea
                  key={`${doc.id}-followup-${days}`}
                  defaultValue={content.body ?? ''}
                  onChange={(e) =>
                    setFollowupDrafts((prev) => ({
                      ...prev,
                      [days]: e.currentTarget.value,
                    }))
                  }
                  className="min-h-[140px] font-mono text-xs"
                  aria-label={`Day ${days} follow-up draft`}
                />
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{wordCount} words</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7"
                    onClick={() => {
                      void copyToClipboard(currentBody)
                    }}
                    disabled={currentBody.length === 0}
                  >
                    <Copy className="size-3" />
                    Copy
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Outreach</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as TabValue)}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="connection">Connection</TabsTrigger>
            <TabsTrigger value="message">Message</TabsTrigger>
            <TabsTrigger value="recruiter">Recruiter</TabsTrigger>
            <TabsTrigger value="followup" className="gap-1">
              <Clock className="size-3" />
              Follow-up
            </TabsTrigger>
          </TabsList>

          <div className="mt-3 flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">Tone</label>
            <Select value={tone} onValueChange={(v) => setTone(v as OutreachTone)}>
              <SelectTrigger className="h-8 w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="formal">Formal</SelectItem>
                <SelectItem value="friendly">Friendly</SelectItem>
                <SelectItem value="enthusiastic">Enthusiastic</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <TabsContent value="connection" className="mt-3">
            {renderTab('connection')}
          </TabsContent>
          <TabsContent value="message" className="mt-3">
            {renderTab('message')}
          </TabsContent>
          <TabsContent value="recruiter" className="mt-3">
            {renderTab('recruiter')}
          </TabsContent>
          <TabsContent value="followup" className="mt-3">
            {renderFollowupTab()}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
