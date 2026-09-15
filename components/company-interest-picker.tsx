'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { InterestStars } from '@/components/interest-stars'
import { setInterestLevel } from '@/app/(authed)/companies/[id]/actions'

interface CompanyInterestPickerProps {
  companyId: string
  level: number | null
}

export function CompanyInterestPicker({ companyId, level }: CompanyInterestPickerProps) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const handleChange = (next: number): void => {
    start(async () => {
      const result = await setInterestLevel(companyId, next)
      if ('success' in result) {
        toast.success(next === 0 ? 'Interest cleared' : `Interest: ${next}/5`)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <InterestStars
      level={level}
      size="md"
      onChange={handleChange}
      disabled={pending}
      ariaLabel="Set interest level"
    />
  )
}
