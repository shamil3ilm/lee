'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Globe, ListChecks, X } from 'lucide-react'
import {
  addAllowListEntryAction,
  removeAllowListEntryAction,
  toggleScamNetChecksAction,
} from '@/app/(authed)/settings/scam-shield/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface AllowEntry {
  id: string
  kind: string
  value: string
}

interface ScamShieldSettingsProps {
  netChecks: boolean
  entries: AllowEntry[]
}

export function ScamShieldSettings({ netChecks, entries }: ScamShieldSettingsProps) {
  return (
    <>
      <NetChecksCard initial={netChecks} />
      <AllowListCard entries={entries} />
    </>
  )
}

function NetChecksCard({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial)
  const [saving, startSave] = useTransition()

  function toggle(next: boolean): void {
    const previous = enabled
    setEnabled(next)
    startSave(async () => {
      const result = await toggleScamNetChecksAction(next)
      if ('error' in result) {
        setEnabled(previous)
        toast.error(result.error)
      } else {
        toast.success(next ? 'Network checks on' : 'Network checks off')
      }
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Globe className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Network checks</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4 rounded-md border p-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">Check domain age and mail records</div>
            <div className="text-xs text-muted-foreground">
              Looks up a posting&apos;s domain registration date (rdap.org) and MX records (Cloudflare
              DNS-over-HTTPS). Free; sends only the domain name. Results are cached, and a failed
              lookup never raises the risk.
            </div>
          </div>
          <label className="relative inline-flex shrink-0 cursor-pointer items-center">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={enabled}
              disabled={saving}
              onChange={(e) => toggle(e.currentTarget.checked)}
              aria-label="Enable Scam Shield network checks"
            />
            <span
              className="h-5 w-9 rounded-full bg-input transition-colors peer-checked:bg-primary peer-disabled:opacity-50"
              aria-hidden="true"
            />
            <span
              className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform peer-checked:translate-x-4"
              aria-hidden="true"
            />
          </label>
        </div>
      </CardContent>
    </Card>
  )
}

function AllowListCard({ entries }: { entries: AllowEntry[] }) {
  const [isPending, startTransition] = useTransition()
  const [removing, setRemoving] = useState<AllowEntry | null>(null)
  const [kind, setKind] = useState<'domain' | 'company'>('domain')
  const [value, setValue] = useState('')

  function remove(id: string): void {
    startTransition(async () => {
      const result = await removeAllowListEntryAction(id)
      if ('error' in result) toast.error(result.error)
      else {
        toast.success('Removed from allow-list')
        setRemoving(null)
      }
    })
  }

  function add(e: React.FormEvent): void {
    e.preventDefault()
    startTransition(async () => {
      const result = await addAllowListEntryAction(kind, value)
      if ('error' in result) toast.error(result.error)
      else {
        toast.success('Added to allow-list')
        setValue('')
      }
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ListChecks className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Allow-list</CardTitle>
          <Badge variant="secondary">{entries.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="space-y-1.5 sm:w-36">
            <Label htmlFor="allow-kind" className="text-xs">
              Type
            </Label>
            <Select value={kind} onValueChange={(v) => setKind(v === 'company' ? 'company' : 'domain')}>
              <SelectTrigger id="allow-kind" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="domain">Domain</SelectItem>
                <SelectItem value="company">Company</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="allow-value" className="text-xs">
              {kind === 'domain' ? 'Domain' : 'Company name'}
            </Label>
            <Input
              id="allow-value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={kind === 'domain' ? 'acme.com' : 'Acme'}
              maxLength={200}
            />
          </div>
          <Button type="submit" size="sm" className="h-9" disabled={isPending || !value.trim()}>
            Add
          </Button>
        </form>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Empty. When you mark a posting “Not a scam”, its company and domain are remembered here so
            similar postings are not quarantined.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <Badge variant={e.kind === 'domain' ? 'blue' : 'violet'}>{e.kind}</Badge>
                <span className="min-w-0 flex-1 truncate">{e.value}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  disabled={isPending}
                  onClick={() => setRemoving(e)}
                  aria-label={`Remove ${e.value}`}
                  title="Remove"
                >
                  <X className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title={`Remove ${removing?.value ?? 'entry'}?`}
        description={
          <p>
            New postings from this {removing?.kind ?? 'entry'} will be assessed normally again. Items
            it already released stay released until they are re-assessed.
          </p>
        }
        confirmLabel="Remove"
        pending={isPending}
        onConfirm={() => {
          if (removing) remove(removing.id)
        }}
      />
    </Card>
  )
}
