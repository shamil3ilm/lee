'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Copy, Loader2, MessageSquare, RefreshCw, Sparkles } from 'lucide-react'
import type { Document } from '@/lib/db/queries/documents'
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

type OutreachKind = 'linkedin_connection' | 'linkedin_message' | 'recruiter_reply'
type OutreachTone = 'formal' | 'friendly' | 'enthusiastic'
type TabValue = 'connection' | 'message' | 'recruiter'

interface OutreachCardProps {
  applicationId: string
  outreachDocs: Document[]
}

const TAB_TO_KIND: Record<TabValue, OutreachKind> = {
  connection: 'linkedin_connection',
  message: 'linkedin_message',
  recruiter: 'recruiter_reply',
}

const KIND_TO_TAB: Record<string, TabValue> = {
  outreach_linkedin_connection: 'connection',
  outreach_linkedin_message: 'message',
  outreach_recruiter_reply: 'recruiter',
}

const TAB_LABEL: Record<TabValue, string> = {
  connection: 'Connection',
  message: 'Message',
  recruiter: 'Recruiter Reply',
}

interface OutreachContent {
  body?: string
  subject?: string
  tone?: OutreachTone
  wordCount?: number
  notes?: string
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

export function OutreachCard({ applicationId, outreachDocs }: OutreachCardProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabValue>('connection')
  const [tone, setTone] = useState<OutreachTone>('friendly')
  const [busyTab, setBusyTab] = useState<TabValue | null>(null)
  // Per-tab local edits so switching tabs preserves any in-progress tweaks.
  const [drafts, setDrafts] = useState<Partial<Record<TabValue, string>>>({})

  const latestByTab = useMemo(
    () => ({
      connection: latestForTab(outreachDocs, 'connection'),
      message: latestForTab(outreachDocs, 'message'),
      recruiter: latestForTab(outreachDocs, 'recruiter'),
    }),
    [outreachDocs],
  )

  async function generate(tab: TabValue): Promise<void> {
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
        // Clear local edit so the fresh server draft shows through defaultValue.
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

  async function copyToClipboard(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Could not copy to clipboard.')
    }
  }

  function renderTab(tab: TabValue): React.ReactElement {
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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="connection">Connection</TabsTrigger>
            <TabsTrigger value="message">Message</TabsTrigger>
            <TabsTrigger value="recruiter">Recruiter Reply</TabsTrigger>
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
        </Tabs>
      </CardContent>
    </Card>
  )
}
