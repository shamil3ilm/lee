'use client'
import { useSharedLinkIds } from '@/components/profile/share-links'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Clock, Copy, Loader2, MessageSquare, RefreshCw, Sparkles } from 'lucide-react'
import type { Document } from '@/lib/db/queries/documents'
import { stepOfDraft, type FollowupStep } from '@/lib/followups/steps'
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
import { VoiceInputButton } from '@/components/voice-input-button'
import { StalenessBanner } from '@/components/staleness-banner'
import { FeedbackButtons } from '@/components/feedback-buttons'
import { UsageBadge } from '@/components/ai/usage-badge'
import type { AiUsage } from '@/lib/ai/usage-types'
import { logImplicitAction } from '@/lib/ui/implicit-signals'
import { relativeFromNow } from '@/lib/ui/date'

type OutreachKind =
  | 'linkedin_connection'
  | 'linkedin_message'
  | 'recruiter_reply'
  | 'followup_email'
type OutreachTone = 'formal' | 'friendly' | 'enthusiastic'
type TabValue = 'connection' | 'message' | 'recruiter' | 'followup'

interface OutreachCardProps {
  applicationId: string
  outreachDocs: Document[]
  // v4.2 — needed so the follow-up tab can show a hint when appliedAt is
  // missing (otherwise the server route would 400 with "set applied-at first").
  appliedAt?: string | null
  /** v18 — AI usage per document id (tokens · model · latency). */
  usage?: Record<string, AiUsage>
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

/** Two short notes, then stop (lib/followups/cadence.ts; marks editable in Settings › Notifications). */
const FOLLOWUP_BUTTONS: ReadonlyArray<{
  step: FollowupStep
  label: string
  hint: string
}> = [
  { step: 1, label: 'Check-in', hint: 'After 5 business days (3 for GCC agencies)' },
  { step: 2, label: 'Final note', hint: 'After 10 business days, then stop' },
]

const STEP_BADGE: Readonly<Record<FollowupStep, string>> = { 1: 'check-in', 2: 'final note' }

interface OutreachContent {
  body?: string
  subject?: string
  tone?: OutreachTone
  wordCount?: number
  notes?: string
  daysSince?: number
  followupStep?: number
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

function followupDocsByStep(docs: Document[]): Record<FollowupStep, Document | null> {
  // Latest doc per step. Docs are pre-sorted desc so first match per step
  // wins; drafts from the old 7/14/21/30 cadence map by their day.
  const out: Record<FollowupStep, Document | null> = { 1: null, 2: null }
  for (const d of docs) {
    if (KIND_TO_TAB[d.kind] !== 'followup') continue
    const step = stepOfDraft(readContent(d))
    if (step && !out[step]) out[step] = d
  }
  return out
}

/** Four tabs share the card width; compact until the card is 24rem wide. */
const TAB_TRIGGER = 'min-w-0 gap-1 px-1.5 text-xs @sm:px-3 @sm:text-sm'

export function OutreachCard({
  applicationId,
  outreachDocs,
  appliedAt,
  usage = {},
}: OutreachCardProps) {
  const router = useRouter()
  const linkIds = useSharedLinkIds()
  const [activeTab, setActiveTab] = useState<TabValue>('connection')
  const [tone, setTone] = useState<OutreachTone>('friendly')
  const [busyTab, setBusyTab] = useState<TabValue | null>(null)
  // For the follow-up tab we need per-step busy tracking so only the
  // clicked button spins.
  const [busyFollowup, setBusyFollowup] = useState<FollowupStep | null>(null)
  // Per-tab local edits so switching tabs preserves any in-progress tweaks.
  const [drafts, setDrafts] = useState<Partial<Record<TabValue, string>>>({})
  const [followupDrafts, setFollowupDrafts] = useState<
    Partial<Record<FollowupStep, string>>
  >({})

  const latestByTab = useMemo(
    () => ({
      connection: latestForTab(outreachDocs, 'connection'),
      message: latestForTab(outreachDocs, 'message'),
      recruiter: latestForTab(outreachDocs, 'recruiter'),
    }),
    [outreachDocs],
  )

  const followupsByStep = useMemo(() => followupDocsByStep(outreachDocs), [outreachDocs])

  async function generate(
    tab: Exclude<TabValue, 'followup'>,
    priorDocId?: string,
  ): Promise<void> {
    setBusyTab(tab)
    // v10 implicit-signal: if the user is regenerating on top of an existing
    // draft, log a 'regenerated' action against that draft's underlying call
    // (implicit thumbs-down). Best-effort — never blocks the regeneration.
    if (priorDocId) void logImplicitAction(priorDocId, 'regenerated')
    try {
      const res = await fetch(
        `/api/applications/${applicationId}/documents/generate-outreach`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: TAB_TO_KIND[tab], tone, linkIds }),
        },
      )
      const json = (await res.json().catch(() => ({}))) as {
        documentId?: string
        error?: string
        skipped?: boolean
        message?: string
        fixHint?: string
      }
      if (json.skipped) {
        // Signal-check refused — surface the hint, don't treat as failure.
        toast.warning(
          json.message
            ? `${json.message}${json.fixHint ? ` — ${json.fixHint}` : ''}`
            : 'Draft skipped.',
        )
      } else if (res.ok && json.documentId) {
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

  async function generateFollowup(
    step: FollowupStep,
    priorDocId?: string,
  ): Promise<void> {
    setBusyFollowup(step)
    if (priorDocId) void logImplicitAction(priorDocId, 'regenerated')
    try {
      const res = await fetch(
        `/api/applications/${applicationId}/documents/generate-followup`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tone, step, linkIds }),
        },
      )
      const json = (await res.json().catch(() => ({}))) as {
        documentId?: string
        error?: string
        skipped?: boolean
        message?: string
        fixHint?: string
      }
      if (json.skipped) {
        toast.warning(
          json.message
            ? `${json.message}${json.fixHint ? ` — ${json.fixHint}` : ''}`
            : 'Follow-up skipped.',
        )
      } else if (res.ok && json.documentId) {
        toast.success(step === 2 ? 'Final follow-up drafted' : 'Follow-up drafted')
        setFollowupDrafts((prev) => {
          const next = { ...prev }
          delete next[step]
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

  async function copyToClipboard(text: string, documentId?: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied to clipboard')
      // v10 implicit-signal: log a 'used' action against the underlying call
      // so analytics can distinguish drafts that got sent from drafts that
      // sat unused. Best-effort; never blocks the copy.
      if (documentId) void logImplicitAction(documentId, 'used')
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
        <StalenessBanner
          documentId={latest.id}
          onRegenerate={() => generate(tab)}
        />
        {content?.subject ? (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
            <span className="font-semibold text-muted-foreground">Subject:</span>{' '}
            <span className="font-medium">{content.subject}</span>
          </div>
        ) : null}
        <Textarea
          key={`${latest.id}-${tab}`}
          value={currentBody}
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
          <VoiceInputButton
            className="h-8 w-8"
            ariaLabel="Append voice note to draft"
            onTranscribed={(text) => {
              setDrafts((prev) => {
                const existing = prev[tab] ?? content?.body ?? ''
                const merged = existing ? `${existing} ${text}` : text
                return { ...prev, [tab]: merged }
              })
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              void generate(tab, latest.id)
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
              void copyToClipboard(currentBody, latest.id)
            }}
            disabled={currentBody.length === 0}
          >
            <Copy className="size-3.5" />
            Copy
          </Button>
        </div>
        <FeedbackButtons documentId={latest.id} className="pt-1" />
        <UsageBadge usage={usage[latest.id]} />
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
        <div className="grid grid-cols-2 gap-2">
          {FOLLOWUP_BUTTONS.map(({ step, label, hint }) => {
            const existing = followupsByStep[step]
            const busy = busyFollowup === step
            return (
              <Button
                key={step}
                type="button"
                variant={existing ? 'outline' : 'default'}
                size="sm"
                className="flex h-auto flex-col items-start gap-0.5 px-3 py-2 text-left"
                onClick={() => {
                  void generateFollowup(step)
                }}
                disabled={busy}
                title={hint}
              >
                <span className="flex w-full items-center gap-1 text-xs font-semibold">
                  {busy ? <Loader2 className="size-3 animate-spin" /> : null}
                  {label}
                </span>
                <span className="text-[10px] font-normal">
                  {existing ? `v${existing.version} drafted` : hint}
                </span>
              </Button>
            )
          })}
        </div>

        <div className="space-y-3">
          {FOLLOWUP_BUTTONS.map(({ step }) => {
            const doc = followupsByStep[step]
            if (!doc) return null
            const content = readContent(doc)
            const currentBody = followupDrafts[step] ?? content.body ?? ''
            const wordCount = currentBody.trim().length
              ? currentBody.trim().split(/\s+/).length
              : 0
            return (
              <div key={step} className="rounded-md border bg-muted/20 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <Badge variant="violet" className="text-[10px]">
                    {STEP_BADGE[step]}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    v{doc.version} · {relativeFromNow(doc.createdAt)}
                  </span>
                </div>
                <StalenessBanner
                  documentId={doc.id}
                  onRegenerate={() => generateFollowup(step)}
                  className="mb-2"
                />
                {content.subject ? (
                  <div className="mb-2 rounded border bg-background px-2 py-1 text-xs">
                    <span className="font-semibold text-muted-foreground">
                      Subject:
                    </span>{' '}
                    <span className="font-medium">{content.subject}</span>
                  </div>
                ) : null}
                <Textarea
                  key={`${doc.id}-followup-${step}`}
                  value={currentBody}
                  onChange={(e) =>
                    setFollowupDrafts((prev) => ({
                      ...prev,
                      [step]: e.currentTarget.value,
                    }))
                  }
                  className="min-h-[140px] font-mono text-xs"
                  aria-label={`${STEP_BADGE[step]} follow-up draft`}
                />
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{wordCount} words</span>
                  <div className="flex items-center gap-1">
                    <VoiceInputButton
                      className="h-7 w-7"
                      ariaLabel="Append voice note to follow-up"
                      onTranscribed={(text) => {
                        setFollowupDrafts((prev) => {
                          const existing = prev[step] ?? content.body ?? ''
                          const merged = existing ? `${existing} ${text}` : text
                          return { ...prev, [step]: merged }
                        })
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7"
                      onClick={() => {
                        void copyToClipboard(currentBody, doc.id)
                      }}
                      disabled={currentBody.length === 0}
                    >
                      <Copy className="size-3" />
                      Copy
                    </Button>
                  </div>
                </div>
                <FeedbackButtons documentId={doc.id} className="pt-2" />
                <UsageBadge usage={usage[doc.id]} />
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <Card className="@container">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-4 text-muted-foreground" />
          <CardTitle>Outreach</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as TabValue)}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="connection" className={TAB_TRIGGER}>Connection</TabsTrigger>
            <TabsTrigger value="message" className={TAB_TRIGGER}>Message</TabsTrigger>
            <TabsTrigger value="recruiter" className={TAB_TRIGGER}>Recruiter</TabsTrigger>
            <TabsTrigger value="followup" className={TAB_TRIGGER}>
              <Clock className="size-3" />
              Follow-up
            </TabsTrigger>
          </TabsList>

          <div className="mt-3 flex items-center gap-2">
            <span id="outreach-tone-label" className="text-xs font-medium text-muted-foreground">Tone</span>
            <Select value={tone} onValueChange={(v) => setTone(v as OutreachTone)}>
              <SelectTrigger className="h-8 w-[160px]" aria-labelledby="outreach-tone-label">
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
