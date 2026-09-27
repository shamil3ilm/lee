'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { refreshReputationAction } from '@/app/(authed)/companies/[id]/reputation-actions'

export function ReputationRefreshButton({ companyId }: { companyId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const onClick = (): void => {
    start(async () => {
      const r = await refreshReputationAction(companyId)
      if ('error' in r) toast.error(r.error)
      else toast.success(r.message ?? 'Done.')
      router.refresh()
    })
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} disabled={pending}>
      <RefreshCw className={pending ? 'animate-spin' : undefined} />
      {pending ? 'Refreshing…' : 'Refresh signals'}
    </Button>
  )
}
