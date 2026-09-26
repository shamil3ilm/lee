'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronRight,
  Download,
  HelpCircle,
  Lightbulb,
  Loader2,
  Sparkles,
} from 'lucide-react'
import type { Document } from '@/lib/db/queries/documents'
import type { InterviewStage } from '@/lib/db/queries/stages'
import type {
  CompanyResearch,
  InterviewPrepPack,
  LikelyQuestion,
} from '@/lib/documents/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FeedbackButtons } from '@/components/feedback-buttons'
import { UsageBadge } from '@/components/ai/usage-badge'
import type { AiUsage } from '@/lib/ai/usage-types'
import { logImplicitAction } from '@/lib/ui/implicit-signals'
import { relativeFromNow } from '@/lib/ui/date'

interface PrepPackCardProps {
  applicationId: string
  stages: InterviewStage[]
  prepDocs: Document[]
  /** v18 — AI usage per document id (tokens · model · latency). */
  usage?: Record<string, AiUsage>
}

const STAGE_KIND_LABELS: Record<string, string> = {
  phone_screen: 'Phone screen',
  recruiter_screen: 'Recruiter screen',
  technical: 'Technical',
  tech_screen: 'Tech screen',
  system_design: 'System design',
  behavioral: 'Behavioral',
  take_home: 'Take home',
  onsite: 'Onsite',
  onsite_loop: 'Onsite loop',
  live_coding: 'Live coding',
  final: 'Final',
  other: 'Other',
}

const QUESTION_CATEGORY_LABELS: Record<LikelyQuestion['category'], string> = {
  technical: 'Technical',
  behavioral: 'Behavioral',
  system_design: 'System design',
  take_home: 'Take home',
  culture: 'Culture',
  salary: 'Salary',
}

const QUESTION_CATEGORY_ORDER: ReadonlyArray<LikelyQuestion['category']> = [
  'technical',
  'system_design',
  'behavioral',
  'take_home',
  'culture',
  'salary',
]

const DIFFICULTY_BADGE: Record<LikelyQuestion['difficulty'], 'success' | 'info' | 'danger'> = {
  easy: 'success',
  medium: 'info',
  hard: 'danger',
}

function readPack(doc: Document): InterviewPrepPack | null {
  const c = doc.content
  if (typeof c !== 'object' || c === null) return null
  // Trusts backend Zod validation on write; UI just narrows the shape.
  return c as InterviewPrepPack
}

function latestPackForStage(
  packs: Array<{ doc: Document; pack: InterviewPrepPack }>,
  stage: InterviewStage,
): { doc: Document; pack: InterviewPrepPack } | null {
  // Prefer a pack whose stageId matches exactly, else fall back to a pack of
  // the same stageKind that has no stageId (a "general" pack).
  for (const entry of packs) {
    if (entry.pack.stageId === stage.id) return entry
  }
  for (const entry of packs) {
    if (!entry.pack.stageId && entry.pack.stageKind === stage.kind) return entry
  }
  return null
}

export function PrepPackCard({
  applicationId,
  stages,
  prepDocs,
  usage = {},
}: PrepPackCardProps) {
  const router = useRouter()
  const [busyStageId, setBusyStageId] = useState<string | null>(null)
  const [expandedDocIds, setExpandedDocIds] = useState<Set<string>>(new Set())

  const packEntries = useMemo(() => {
    const list: Array<{ doc: Document; pack: InterviewPrepPack }> = []
    for (const doc of prepDocs) {
      const pack = readPack(doc)
      if (pack) list.push({ doc, pack })
    }
    return list
  }, [prepDocs])

  async function generate(stage: InterviewStage, priorDocId?: string): Promise<void> {
    setBusyStageId(stage.id)
    if (priorDocId) void logImplicitAction(priorDocId, 'regenerated')
    try {
      const res = await fetch(
        `/api/applications/${applicationId}/documents/generate-prep-pack`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stageKind: stage.kind, stageId: stage.id }),
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
            : 'Prep pack skipped.',
        )
      } else if (res.ok && json.documentId) {
        toast.success('Prep pack generated')
        // Auto-expand the new one.
        setExpandedDocIds((prev) => new Set(prev).add(json.documentId!))
        router.refresh()
      } else {
        toast.error(json.error ?? 'Could not generate prep pack.')
      }
    } catch {
      toast.error('Network error — could not generate prep pack.')
    } finally {
      setBusyStageId(null)
    }
  }

  function toggleExpand(docId: string): void {
    setExpandedDocIds((prev) => {
      const next = new Set(prev)
      if (next.has(docId)) next.delete(docId)
      else next.add(docId)
      return next
    })
  }

  if (stages.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Interview prep</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
            <span>Add an interview stage first.</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Interview prep</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {stages.map((stage) => {
          const label = STAGE_KIND_LABELS[stage.kind] ?? stage.kind
          const entry = latestPackForStage(packEntries, stage)
          const busy = busyStageId === stage.id
          return (
            <div key={stage.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="violet" className="text-[10px]">
                      {label}
                    </Badge>
                    <span className="truncate text-sm font-medium">
                      {stage.title ?? label}
                    </span>
                  </div>
                  {entry ? (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      v{entry.doc.version} · {relativeFromNow(entry.doc.createdAt)}
                    </div>
                  ) : null}
                </div>
                {entry ? (
                  <div className="flex items-center gap-1">
                    <Button
                      asChild
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Download PDF"
                    >
                      <Link
                        href={`/api/documents/${entry.doc.id}/pdf`}
                        target="_blank"
                      >
                        <Download className="size-4" />
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleExpand(entry.doc.id)}
                    >
                      {expandedDocIds.has(entry.doc.id) ? (
                        <ChevronDown className="size-3.5" />
                      ) : (
                        <ChevronRight className="size-3.5" />
                      )}
                      {expandedDocIds.has(entry.doc.id) ? 'Collapse' : 'View'}
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void generate(stage)
                    }}
                    disabled={busy}
                  >
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    {busy ? 'Generating…' : 'Generate prep pack'}
                  </Button>
                )}
              </div>

              {entry && expandedDocIds.has(entry.doc.id) ? (
                <div className="mt-3 space-y-4 border-t pt-3">
                  <CompanyResearchSection research={entry.pack.companyResearch} />
                  <LikelyQuestionsSection questions={entry.pack.likelyQuestions} />
                  <YourQuestionsSection questions={entry.pack.yourQuestions} />
                  <TalkingAndFlagsSection
                    talkingPoints={entry.pack.talkingPoints}
                    redFlags={entry.pack.redFlags}
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex min-w-0 flex-col gap-1">
                      <FeedbackButtons documentId={entry.doc.id} caption={null} />
                      <UsageBadge usage={usage[entry.doc.id]} />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        void generate(stage, entry.doc.id)
                      }}
                      disabled={busy}
                    >
                      {busy ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="size-3.5" />
                      )}
                      Re-generate
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

function SectionHeading({
  icon: Icon,
  label,
}: {
  icon: typeof Building2
  label: string
}): React.ReactElement {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      <Icon className="size-3.5" />
      {label}
    </div>
  )
}

function ChipRow({ items }: { items: string[] }): React.ReactElement | null {
  if (!items.length) return null
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((it, i) => (
        <Badge key={`${it}-${i}`} variant="secondary" className="text-[10px]">
          {it}
        </Badge>
      ))}
    </div>
  )
}

function BulletList({ items }: { items: string[] }): React.ReactElement | null {
  if (!items.length) return null
  return (
    <ul className="list-inside list-disc space-y-1 text-xs text-foreground/90">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  )
}

function CompanyResearchSection({
  research,
}: {
  research: CompanyResearch
}): React.ReactElement {
  return (
    <details className="group rounded-md border bg-muted/20 p-3 open:pb-3" open>
      <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground marker:content-none">
        <Building2 className="size-3.5" />
        Company research
      </summary>
      <div className="mt-3 space-y-3">
        {research.summary ? (
          <p className="text-xs leading-relaxed text-foreground/90">{research.summary}</p>
        ) : null}
        {research.industry.length ? (
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Industry
            </div>
            <ChipRow items={research.industry} />
          </div>
        ) : null}
        {research.notable_facts.length ? (
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Notable facts
            </div>
            <BulletList items={research.notable_facts} />
          </div>
        ) : null}
        {research.tech_stack.length ? (
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Tech stack
            </div>
            <ChipRow items={research.tech_stack} />
          </div>
        ) : null}
        {research.culture_signals.length ? (
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Culture signals
            </div>
            <BulletList items={research.culture_signals} />
          </div>
        ) : null}
      </div>
    </details>
  )
}

function LikelyQuestionsSection({
  questions,
}: {
  questions: LikelyQuestion[]
}): React.ReactElement | null {
  if (!questions.length) return null
  const grouped = new Map<LikelyQuestion['category'], LikelyQuestion[]>()
  for (const q of questions) {
    const list = grouped.get(q.category) ?? []
    list.push(q)
    grouped.set(q.category, list)
  }
  // Present categories in a stable order.
  const orderedCategories = QUESTION_CATEGORY_ORDER.filter((c) => grouped.has(c))
  return (
    <div className="space-y-3">
      <SectionHeading icon={HelpCircle} label="Likely questions" />
      {orderedCategories.map((cat) => (
        <div key={cat} className="space-y-1.5">
          <div className="text-[11px] font-semibold text-foreground/80">
            {QUESTION_CATEGORY_LABELS[cat]}
          </div>
          <ul className="space-y-1.5">
            {(grouped.get(cat) ?? []).map((q, i) => (
              <li key={`${cat}-${i}`} className="rounded-md border bg-background p-2">
                <details className="group">
                  <summary className="flex cursor-pointer items-start gap-1.5 text-xs marker:content-none">
                    <ChevronRight className="mt-0.5 size-3 shrink-0 transition-transform group-open:rotate-90" />
                    <span className="flex-1 font-medium">{q.question}</span>
                    <Badge
                      variant={DIFFICULTY_BADGE[q.difficulty]}
                      className="text-[9px]"
                    >
                      {q.difficulty}
                    </Badge>
                  </summary>
                  <div className="mt-2 space-y-2 pl-4.5 text-[11px] text-foreground/85">
                    {q.star_answer ? (
                      <div className="space-y-1">
                        <StarLine label="Situation" text={q.star_answer.situation} />
                        <StarLine label="Task" text={q.star_answer.task} />
                        <StarLine label="Action" text={q.star_answer.action} />
                        <StarLine label="Result" text={q.star_answer.result} />
                        {q.star_answer.cv_bullet_ref ? (
                          <div className="text-[10px] italic text-muted-foreground">
                            ← {q.star_answer.cv_bullet_ref}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {q.technical_notes ? (
                      <p className="whitespace-pre-wrap leading-relaxed">
                        {q.technical_notes}
                      </p>
                    ) : null}
                    {!q.star_answer && !q.technical_notes ? (
                      <p className="italic text-muted-foreground">
                        No suggested answer.
                      </p>
                    ) : null}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function StarLine({ label, text }: { label: string; text: string }): React.ReactElement {
  return (
    <div>
      <span className="font-semibold text-muted-foreground">{label}: </span>
      <span>{text}</span>
    </div>
  )
}

function YourQuestionsSection({
  questions,
}: {
  questions: string[]
}): React.ReactElement | null {
  if (!questions.length) return null
  return (
    <div className="space-y-1.5">
      <SectionHeading icon={HelpCircle} label="Questions to ask them" />
      <BulletList items={questions} />
    </div>
  )
}

function TalkingAndFlagsSection({
  talkingPoints,
  redFlags,
}: {
  talkingPoints: string[]
  redFlags: string[]
}): React.ReactElement | null {
  if (!talkingPoints.length && !redFlags.length) return null
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {talkingPoints.length ? (
        <div className="space-y-1.5">
          <SectionHeading icon={Lightbulb} label="Talking points" />
          <BulletList items={talkingPoints} />
        </div>
      ) : null}
      {redFlags.length ? (
        <div className="space-y-1.5">
          <SectionHeading icon={AlertTriangle} label="Red flags to probe" />
          <BulletList items={redFlags} />
        </div>
      ) : null}
    </div>
  )
}
