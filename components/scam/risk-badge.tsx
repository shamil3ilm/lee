'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react'
import { Badge, badgeVariants, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { setScamVerdict } from '@/app/(authed)/scam/actions'
import { GROUP_LABEL, LEVEL_LABEL, type RiskVerdict, type RiskView } from '@/lib/scam/view'
import type { RiskLevel } from '@/lib/scam/types'
import { cn } from '@/lib/utils'
import { ReportItPanel } from './report-it-panel'

const VARIANT: Record<RiskLevel, BadgeProps['variant']> = {
  safe: 'success',
  caution: 'warning',
  likely_scam: 'danger',
}

const DOT: Record<RiskLevel, string> = {
  safe: 'bg-success',
  caution: 'bg-warning',
  likely_scam: 'bg-danger',
}

const ICON: Record<RiskLevel, typeof ShieldCheck> = {
  safe: ShieldCheck,
  caution: ShieldQuestion,
  likely_scam: ShieldAlert,
}

interface RiskBadgeProps {
  risk: RiskView
  className?: string
}

/**
 * v17 §1 — Scam Shield badge (Safe / Caution / Likely scam). Clicking it
 * opens the "Why?" dialog with every signal and its verbatim evidence, the
 * user's verdict actions, and the "Report it" panel.
 */
export function RiskBadge({ risk, className }: RiskBadgeProps) {
  const confirmed = risk.verdict === 'confirmed_scam'
  const level: RiskLevel = confirmed ? 'likely_scam' : risk.level
  const label = confirmed ? 'Confirmed scam' : LEVEL_LABEL[level]
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(badgeVariants({ variant: VARIANT[level] }), 'cursor-pointer gap-1.5', className)}
          aria-label={`Scam Shield: ${label}. Why?`}
          title="Scam Shield — why?"
        >
          <span className={cn('size-1.5 rounded-full', DOT[level])} aria-hidden="true" />
          {label}
          {risk.verdict === 'not_scam' || (risk.allowListed && risk.level === 'likely_scam') ? (
            <span className="opacity-70">· allowed</span>
          ) : null}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <RiskDetails risk={risk} />
      </DialogContent>
    </Dialog>
  )
}

function RiskDetails({ risk }: { risk: RiskView }) {
  const Icon = ICON[risk.level]
  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Icon className="size-5" aria-hidden="true" />
          Scam Shield: {LEVEL_LABEL[risk.level]}
          <span className="text-sm font-normal text-muted-foreground">({risk.score}/100)</span>
        </DialogTitle>
        <DialogDescription>
          Rule-based check ({risk.rulesVersion}). It only suggests — you decide, and nothing is
          deleted.
        </DialogDescription>
      </DialogHeader>

      <VerdictNote risk={risk} />

      {risk.signals.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          No warning signs found. Still never pay to apply or share OTPs and ID documents before an
          offer.
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Warning signs">
          {risk.signals.map((s) => (
            <li key={s.id} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{s.label}</span>
                <Badge variant="neutral">{GROUP_LABEL[s.group]}</Badge>
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">+{s.weight}</span>
              </div>
              <ul className="mt-2 space-y-1">
                {s.evidence.map((e) => (
                  <li key={e} className="text-xs text-muted-foreground">
                    <q className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">{e}</q>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <VerdictActions risk={risk} />
      {risk.level !== 'safe' || risk.verdict === 'confirmed_scam' ? <ReportItPanel board={risk.board} /> : null}
    </div>
  )
}

function VerdictNote({ risk }: { risk: RiskView }) {
  if (risk.verdict === 'not_scam') {
    return <p className="text-sm text-success">You marked this as not a scam.</p>
  }
  if (risk.verdict === 'confirmed_scam') {
    return <p className="text-sm text-danger">You confirmed this is a scam. It stays quarantined.</p>
  }
  if (risk.allowListed && risk.level === 'likely_scam') {
    return (
      <p className="text-sm text-muted-foreground">
        Not quarantined: this company or domain is on your allow-list (Settings › Scam Shield).
      </p>
    )
  }
  if (risk.quarantined) {
    return (
      <p className="text-sm text-muted-foreground">
        Quarantined: hidden from your inbox until you decide. Find it under the Quarantined filter.
      </p>
    )
  }
  return null
}

function VerdictActions({ risk }: { risk: RiskView }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const decide = (verdict: RiskVerdict | null): void => {
    startTransition(async () => {
      const result = await setScamVerdict(risk.targetType, risk.targetId, verdict)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      if (verdict === 'not_scam') toast.success('Marked as not a scam — company/domain allow-listed')
      else if (verdict === 'confirmed_scam') toast.success('Confirmed as scam — kept in quarantine')
      else toast.success('Decision cleared')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
      <Button
        size="sm"
        variant="outline"
        disabled={isPending || risk.verdict === 'not_scam'}
        onClick={() => decide('not_scam')}
      >
        <ShieldCheck className="size-4" />
        Not a scam
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={isPending || risk.verdict === 'confirmed_scam'}
        onClick={() => decide('confirmed_scam')}
      >
        <ShieldAlert className="size-4" />
        Confirmed scam
      </Button>
      {risk.verdict ? (
        <Button size="sm" variant="ghost" disabled={isPending} onClick={() => decide(null)}>
          Clear decision
        </Button>
      ) : null}
    </div>
  )
}
