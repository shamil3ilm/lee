'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Shuffle } from 'lucide-react'
import { pickProblemAction } from '@/app/(authed)/playground/problems/actions'
import { Button } from '@/components/ui/button'

/** "Pick one for me": the adaptive selector chooses a problem near your level. */
export function PickButton() {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <Button
      type="button"
      size="sm"
      onClick={() =>
        start(async () => {
          const r = await pickProblemAction()
          if ('error' in r) {
            toast.error(r.error)
            return
          }
          router.push(r.href)
        })
      }
      disabled={pending}
    >
      <Shuffle aria-hidden />
      {pending ? 'Picking…' : 'Pick one for me'}
    </Button>
  )
}
