'use client'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { changeStatus } from '@/app/(authed)/applications/[id]/actions'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  APPLICATION_STATUSES,
  STATUS_LABELS,
  type ApplicationStatus,
} from '@/lib/ui/status'

interface StatusPickerProps {
  applicationId: string
  current: string
}

export function StatusPicker({ applicationId, current }: StatusPickerProps) {
  const [pending, start] = useTransition()

  const handleChange = (value: string): void => {
    start(async () => {
      const result = await changeStatus(applicationId, value)
      if ('success' in result) toast.success(`Moved to ${STATUS_LABELS[value as ApplicationStatus]}`)
      else toast.error(result.error)
    })
  }

  return (
    <Select value={current} disabled={pending} onValueChange={handleChange}>
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {APPLICATION_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {STATUS_LABELS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
