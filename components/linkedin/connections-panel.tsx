'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { deleteAllConnectionsAction, searchConnectionsAction, type ConnectionView } from '@/app/(authed)/settings/linkedin/actions'

interface ConnectionsPanelProps {
  count: number
  initial: ConnectionView[]
}

/** The imported connections: search, and delete all. Private to the user. */
export function ConnectionsPanel({ count, initial }: ConnectionsPanelProps) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [q, setQ] = useState('')
  const [rows, setRows] = useState(initial)
  const [confirm, setConfirm] = useState(false)

  const search = (value: string): void => {
    setQ(value)
    start(async () => {
      const r = await searchConnectionsAction(value)
      if (r.ok) setRows(r.rows)
    })
  }

  if (count === 0) return <p className="text-sm text-muted-foreground">No connections imported. Import an export that includes Connections.csv.</p>

  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        {count.toLocaleString('en-US')} connections. lee uses them only for “You know … at …” hints on jobs and applications.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor="connections-search">Search by name, company or position</Label>
          <Input id="connections-search" value={q} onChange={(e) => search(e.target.value)} placeholder="e.g. Careem" />
        </div>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setConfirm(true)}>
          Delete all
        </Button>
      </div>
      <ul className="divide-y rounded-md border" data-testid="linkedin-connections">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap justify-between gap-x-3 px-3 py-2">
            <span className="font-medium">{r.name}</span>
            <span className="text-muted-foreground">{[r.position, r.company].filter(Boolean).join(' · ')}</span>
          </li>
        ))}
        {rows.length === 0 ? <li className="px-3 py-2 text-muted-foreground">No matches.</li> : null}
      </ul>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete all connections?"
        description="Every imported LinkedIn connection is deleted from lee. Referral hints disappear until you import again."
        confirmLabel="Delete all"
        pending={pending}
        onConfirm={() => {
          setConfirm(false)
          start(async () => {
            const r = await deleteAllConnectionsAction()
            if (r.ok) toast.success(`Deleted ${r.deleted.toLocaleString('en-US')} connections.`)
            else toast.error(r.error)
            router.refresh()
          })
        }}
      />
    </div>
  )
}
