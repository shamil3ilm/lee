'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { runJobsNowAction } from '@/app/(authed)/settings/jobs/actions'

/** "Run now" from an empty Discovery view: drain today's source polls, then reload. */
export function RunSourcesButton() {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <Button
      size="sm"
      disabled={pending}
      data-testid="run-sources-now"
      onClick={() =>
        start(async () => {
          const r = await runJobsNowAction()
          if ('error' in r) {
            toast.error(r.error)
            return
          }
          toast.success(r.message)
          router.refresh()
        })
      }
    >
      <Play className="size-4" aria-hidden="true" />
      {pending ? 'Running…' : 'Run now'}
    </Button>
  )
}
