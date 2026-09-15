'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { setStance } from '@/app/(authed)/companies/[id]/actions'

const STANCES = [
  { value: 'watching', label: 'Watching' },
  { value: 'target', label: 'Target' },
  { value: 'passive', label: 'Passive' },
  { value: 'not_interested', label: 'Not interested' },
] as const

interface CompanyStancePickerProps {
  companyId: string
  current: string | null
}

export function CompanyStancePicker({ companyId, current }: CompanyStancePickerProps) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const handleChange = (value: string): void => {
    start(async () => {
      const result = await setStance(companyId, value)
      if ('success' in result) {
        const label = STANCES.find((s) => s.value === value)?.label ?? value
        toast.success(`Stance: ${label}`)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Select value={current ?? undefined} disabled={pending} onValueChange={handleChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Set stance" />
      </SelectTrigger>
      <SelectContent>
        {STANCES.map((s) => (
          <SelectItem key={s.value} value={s.value}>
            {s.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
