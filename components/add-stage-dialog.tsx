'use client'
import { useState } from 'react'
import { addStage } from '@/app/(authed)/applications/[id]/actions'

const KINDS = ['phone_screen', 'technical', 'system_design', 'onsite', 'final', 'other'] as const

interface AddStageDialogProps {
  applicationId: string
}

export function AddStageDialog({ applicationId }: AddStageDialogProps) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded border px-3 py-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
        type="button"
      >
        + Add stage
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/50">
      <form
        action={async (fd) => {
          await addStage(fd)
          setOpen(false)
        }}
        className="w-96 space-y-2 rounded bg-white p-4 dark:bg-neutral-900"
      >
        <h3 className="text-lg font-semibold">Add interview stage</h3>
        <input type="hidden" name="applicationId" value={applicationId} />
        <label className="block text-sm">
          <span className="mb-1 block">Kind</span>
          <select name="kind" required className="w-full rounded border px-2 py-1">
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <input
          name="title"
          placeholder="Title (optional)"
          className="w-full rounded border px-2 py-1"
        />
        <label className="block text-sm">
          <span className="mb-1 block">Scheduled at</span>
          <input
            name="scheduledAt"
            type="datetime-local"
            className="w-full rounded border px-2 py-1"
          />
        </label>
        <input
          name="durationMinutes"
          type="number"
          min="0"
          placeholder="Duration (minutes)"
          className="w-full rounded border px-2 py-1"
        />
        <input
          name="meetingUrl"
          type="url"
          placeholder="Meeting URL"
          className="w-full rounded border px-2 py-1"
        />
        <div className="flex gap-2 pt-2">
          <button className="rounded bg-black px-3 py-1 text-white" type="submit">
            Save
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded border px-3 py-1"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
