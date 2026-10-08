'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { refreshRadarAction } from '@/app/(authed)/radar/actions'
import { cn } from '@/lib/utils'

/** Radar › Refresh now: queues today's sources at most once an hour and runs what fits. */
export function RefreshRadarButton() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const refresh = (): void => {
    start(async () => {
      const r = await refreshRadarAction()
      if ('error' in r) toast.error(r.error)
      else {
        toast.success(r.message ?? 'Done.')
        router.refresh()
      }
    })
  }
  return (
    <Button type="button" variant="outline" onClick={refresh} disabled={pending}>
      <RefreshCw className={cn(pending && 'animate-spin')} />
      {pending ? 'Refreshing…' : 'Refresh now'}
    </Button>
  )
}
