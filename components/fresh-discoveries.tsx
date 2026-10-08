'use client'
import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Sparkles, ArrowRight, Check, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { saveDiscovery, dismissDiscovery } from '@/app/(authed)/discoveries/actions'
import { RiskBadge } from '@/components/scam/risk-badge'
import type { RiskView } from '@/lib/scam/view'
import type { MatchDetail } from '@/lib/discovery/match/types'
import { MatchBadge } from '@/components/discovery/match-badge'

export interface FreshDiscoveryItem {
  id: string
  title: string
  companyName: string
  matchScore: number | null
  fitScore?: number | null
  fitDetail?: MatchDetail | null
  /** v17 §1 — Scam Shield assessment (quarantined rows never reach this card). */
  risk?: RiskView | null
}

interface FreshDiscoveriesProps {
  items: FreshDiscoveryItem[]
}

export function FreshDiscoveries({ items }: FreshDiscoveriesProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-muted-foreground" />
          <CardTitle>Fresh discoveries</CardTitle>
          <Badge variant="secondary">{items.length}</Badge>
        </div>
        <Link
          href="/discoveries"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          See all
          <ArrowRight className="size-3" />
        </Link>
      </CardHeader>
      <CardContent className="pt-0">
        {items.length === 0 ? (
          <EmptyBlock />
        ) : (
          <ul className="divide-y">
            {items.map((it) => (
              <FreshRow key={it.id} item={it} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function FreshRow({ item }: { item: FreshDiscoveryItem }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleSave = (): void => {
    startTransition(async () => {
      const result = await saveDiscovery(item.id)
      if ('success' in result) toast.success('Saved to pipeline')
      else if ('conflict' in result) {
        toast(result.message)
        router.refresh()
      } else toast.error(result.error)
    })
  }
  const handleDismiss = (): void => {
    startTransition(async () => {
      const result = await dismissDiscovery(item.id)
      if ('success' in result) toast.success('Dismissed')
      else if ('error' in result) toast.error(result.error)
      else toast(result.message)
    })
  }

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 py-2 text-sm">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium">{item.companyName}</span>
          {item.risk ? <RiskBadge risk={item.risk} className="shrink-0" /> : null}
        </div>
        <div className="line-clamp-2 text-xs text-muted-foreground">{item.title}</div>
      </div>
      <MatchBadge match={item.fitScore ?? null} ai={item.matchScore} detail={item.fitDetail ?? null} />
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={handleSave}
          disabled={isPending}
          aria-label="Save"
          title="Save"
        >
          <Check className="size-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={handleDismiss}
          disabled={isPending}
          aria-label="Dismiss"
          title="Dismiss"
        >
          <X className="size-4" />
        </Button>
      </div>
    </li>
  )
}

function EmptyBlock(): React.ReactElement {
  return (
    <div className="flex items-center gap-2 p-1 text-sm text-muted-foreground">
      <span>No new discoveries in the last 24 hours.</span>
      <Link
        href="/settings/sources"
        className="font-medium text-primary underline-offset-2 hover:underline"
      >
        Add sources
      </Link>
    </div>
  )
}
