'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Globe, ListChecks, X } from 'lucide-react'
import {
  removeAllowListEntryAction,
  toggleScamNetChecksAction,
} from '@/app/(authed)/settings/scam-shield/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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

  function remove(id: string): void {
    startTransition(async () => {
      const result = await removeAllowListEntryAction(id)
      if ('error' in result) toast.error(result.error)
      else toast.success('Removed from allow-list')
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
      <CardContent>
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
                  onClick={() => remove(e.id)}
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
    </Card>
  )
}
