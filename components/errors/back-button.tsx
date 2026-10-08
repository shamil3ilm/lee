'use client'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * "Go back": the previous page when there is one in this tab's history,
 * otherwise Home (a link opened in a new tab has nothing to go back to).
 */
export function BackButton({ fallbackHref = '/' }: { fallbackHref?: string }) {
  const router = useRouter()
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        if (window.history.length > 1) router.back()
        else router.push(fallbackHref)
      }}
    >
      <ArrowLeft aria-hidden="true" />
      Go back
    </Button>
  )
}
