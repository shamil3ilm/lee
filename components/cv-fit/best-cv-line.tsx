'use client'
import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FileCheck2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { chooseBestCvForApplicationAction, chooseBestCvForDiscoveryAction } from '@/app/(authed)/cv-fit-actions'
import type { BestCv } from '@/lib/cv-fit/types'
import { cn } from '@/lib/utils'

export type BestCvTarget = { kind: 'discovery'; id: string } | { kind: 'application'; id: string }

interface BestCvLineProps {
  bestCv: BestCv | null
  target: BestCvTarget
  /** The variant the application already uses (hides "Use this CV" when it is the best). */
  currentVariantId?: string | null
  /** Show the reasons under the line. */
  showReasons?: boolean
  className?: string
}

/**
 * "Best CV: Data Analyst · GCC (fit 78) · runner-up Payments · GCC (71)"
 * with one-click "Use this CV". Deterministic and stored per job
 * (lib/cv-fit); nothing changes until the user clicks.
 */
export function BestCvLine({ bestCv, target, currentVariantId = null, showReasons = true, className }: BestCvLineProps) {
  const router = useRouter()
  const [pending, start] = useTransition()
  if (!bestCv) {
    return (
      <p className={cn('text-xs text-muted-foreground', className)} data-testid="best-cv">
        No résumé variant to compare yet.{' '}
        <Link href="/settings/variants" className="font-medium text-primary underline-offset-2 hover:underline">
          Create your starter set
        </Link>
      </p>
    )
  }
  const { best, runnerUp } = bestCv
  const inUse = currentVariantId === best.variantId
  const use = (): void =>
    start(async () => {
      if (target.kind === 'discovery') {
        const r = await chooseBestCvForDiscoveryAction(target.id, best.variantId)
        if ('error' in r) toast.error(r.error)
        else router.push(`/applications/${r.applicationId}/prepare`)
        return
      }
      const r = await chooseBestCvForApplicationAction(target.id, best.variantId)
      if ('error' in r) toast.error(r.error)
      else {
        toast.success(`Using ${best.name}`)
        router.refresh()
      }
    })
  return (
    <div className={cn('space-y-1.5', className)} data-testid="best-cv">
      <p className="flex items-start gap-1.5 text-xs leading-snug">
        <FileCheck2 className="mt-px size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0">
          <span className="font-medium">Best CV:</span> {best.name} <span className="tabular-nums">(fit {best.fit})</span>
          {runnerUp ? (
            <span className="text-muted-foreground">
              {' '}
              · runner-up {runnerUp.name} <span className="tabular-nums">({runnerUp.fit})</span>
            </span>
          ) : null}
        </span>
      </p>
      {showReasons && best.reasons.length > 0 ? (
        <ul className="space-y-0.5 pl-5 text-[11px] leading-snug text-muted-foreground" aria-label="Why this CV">
          {best.reasons.slice(0, 4).map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : null}
      <div className="pl-5">
        {inUse ? (
          <span className="text-[11px] font-medium text-success">In use for this application</span>
        ) : (
          <Button size="sm" variant="outline" className="h-8" disabled={pending} onClick={use}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Use this CV
          </Button>
        )}
      </div>
    </div>
  )
}
