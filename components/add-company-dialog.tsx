'use client'
import { useState } from 'react'
import { addCompany } from '@/app/(authed)/companies/actions'

export function AddCompanyDialog() {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded bg-black px-3 py-2 text-white"
        type="button"
      >
        + Add company
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/50">
      <form
        action={async (fd) => {
          await addCompany(fd)
          setOpen(false)
        }}
        className="w-96 space-y-2 rounded bg-white p-4 dark:bg-neutral-900"
      >
        <h3 className="text-lg font-semibold">Add company</h3>
        <input
          name="name"
          placeholder="Name"
          className="w-full rounded border px-2 py-1"
          required
        />
        <input
          name="domain"
          placeholder="Domain (e.g. stripe.com)"
          className="w-full rounded border px-2 py-1"
          required
        />
        <input
          name="headquartersCountry"
          placeholder="Country (ISO-2, e.g. AE)"
          className="w-full rounded border px-2 py-1"
        />
        <select name="size" className="w-full rounded border px-2 py-1">
          <option value="">Size (optional)</option>
          <option>1-10</option>
          <option>11-50</option>
          <option>51-200</option>
          <option>201-1k</option>
          <option>1k-5k</option>
          <option>5k+</option>
        </select>
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
