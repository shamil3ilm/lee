'use client'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Play, RotateCcw } from 'lucide-react'
import { retryJobAction, runJobsNowAction } from '@/app/(authed)/settings/jobs/actions'
import { Button } from '@/components/ui/button'

export function RunJobsNowButton() {
  const [pending, start] = useTransition()
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await runJobsNowAction()
          if ('error' in r) toast.error(r.error)
          else toast.success(r.message)
        })
      }
    >
      <Play className="mr-1.5 h-4 w-4" aria-hidden />
      {pending ? 'Running…' : 'Run now'}
    </Button>
  )
}

export function RetryJobButton({ id }: { id: string }) {
  const [pending, start] = useTransition()
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await retryJobAction(id)
          if ('error' in r) toast.error(r.error)
          else toast.success(r.message)
        })
      }
    >
      <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden />
      Retry
    </Button>
  )
}
