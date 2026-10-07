'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { refreshShortlistAction } from '@/app/(authed)/shortlist/actions'

/** Rebuild today's shortlist now (DB only, no AI). Choices already made stay. */
export function RefreshShortlistButton({ label = 'Refresh', variant = 'outline' }: { label?: string; variant?: 'outline' | 'default' }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <Button
      size="sm"
      variant={variant}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await refreshShortlistAction()
          if ('error' in r) toast.error(r.error)
          else toast.success('Shortlist updated')
          router.refresh()
        })
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
      {label}
    </Button>
  )
}
