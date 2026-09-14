'use client'
import { useTransition } from 'react'
import { changeStatus } from '@/app/(authed)/applications/[id]/actions'

const STATUSES = [
  'saved',
  'applied',
  'screen',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
] as const

interface StatusPickerProps {
  applicationId: string
  current: string
}

export function StatusPicker({ applicationId, current }: StatusPickerProps) {
  const [pending, start] = useTransition()
  return (
    <select
      className="rounded border px-2 py-1"
      value={current}
      disabled={pending}
      onChange={(e) => start(() => changeStatus(applicationId, e.target.value))}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  )
}
