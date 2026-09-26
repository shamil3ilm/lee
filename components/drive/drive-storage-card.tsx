'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CheckCircle2, HardDrive, Loader2, MoveRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DriveConnectButton } from '@/components/drive/drive-connect-button'
import { APP_NAME } from '@/lib/brand'
import {
  moveFilesToDriveAction,
  setDriveStorageEnabledAction,
} from '@/app/(authed)/settings/integrations/actions'

export interface DriveStorageCardProps {
  hasGoogleAccount: boolean
  connected: boolean
  enabled: boolean
  /** Bytes of document assets still in Postgres, and the Postgres cap. */
  postgresBytes: number
  quotaBytes: number
  driveBytes: number
  /** Assets still held in Postgres (what "Move existing files" moves). */
  pendingFiles: number
}

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`
}

const MAX_ROUNDS = 40

/** Settings › Integrations: Google Drive as the file store (A2). */
export function DriveStorageCard(props: DriveStorageCardProps) {
  const router = useRouter()
  const [enabled, setEnabled] = useState(props.enabled)
  const [saving, startSaving] = useTransition()
  const [moving, setMoving] = useState(false)
  const [pending, setPending] = useState(props.pendingFiles)

  function toggle(next: boolean): void {
    startSaving(async () => {
      const res = await setDriveStorageEnabledAction(next)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setEnabled(next)
      toast.success(next ? 'New files will be saved to Google Drive.' : `New files will be stored in ${APP_NAME}.`)
    })
  }

  async function moveAll(): Promise<void> {
    setMoving(true)
    let moved = 0
    try {
      // Each call is one bounded, resumable batch; loop while it progresses.
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const res = await moveFilesToDriveAction()
        if ('migrated' in res) {
          moved += res.migrated
          setPending(res.remaining)
          if (res.error) {
            toast.error(res.error.message)
            break
          }
          if (res.remaining === 0 || res.migrated === 0) {
            if (res.remaining > 0) toast.error(`${res.remaining} file(s) could not be moved. Try again later.`)
            break
          }
        } else {
          toast.error(res.error.message)
          break
        }
      }
      if (moved > 0) toast.success(`Moved ${moved} file(s) to Google Drive.`)
      router.refresh()
    } catch {
      toast.error('Could not move files right now. Please try again.')
    } finally {
      setMoving(false)
    }
  }

  return (
    <Card data-testid="drive-storage-card">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <HardDrive className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Google Drive storage</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
          <div className="min-w-0 text-xs text-muted-foreground">
            {props.connected
              ? `Files go to a ${APP_NAME} folder in your own Drive. ${APP_NAME} can only see files it created or that you pick.`
              : `Connect Drive to keep document files in your own Google Drive (free, uses your Google storage) instead of the 150 MB ${APP_NAME} allowance.`}
          </div>
          {props.connected ? (
            <Badge variant="emerald" className="shrink-0 text-[10px]">
              <CheckCircle2 className="mr-1 size-3" /> Connected
            </Badge>
          ) : (
            <Badge variant="neutral" className="shrink-0 text-[10px]">
              Not connected
            </Badge>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-md border p-2">
            <dt className="text-muted-foreground">Stored in {APP_NAME}</dt>
            <dd className="font-medium" data-testid="drive-postgres-usage">
              {mb(props.postgresBytes)} of {mb(props.quotaBytes)}
            </dd>
          </div>
          <div className="rounded-md border p-2">
            <dt className="text-muted-foreground">Stored in Google Drive</dt>
            <dd className="font-medium">{mb(props.driveBytes)}</dd>
          </div>
        </dl>

        {props.connected ? (
          <>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Save new files to Google Drive</span>
              <input
                type="checkbox"
                className="size-4"
                checked={enabled}
                disabled={saving}
                onChange={(e) => toggle(e.target.checked)}
                data-testid="drive-storage-toggle"
              />
            </label>
            <div className="flex items-center justify-between gap-3 border-t pt-3">
              <p className="text-xs text-muted-foreground">
                {pending > 0
                  ? `${pending} file(s) are still stored in ${APP_NAME}. Moving copies each one, checks it, then frees the space.`
                  : 'All document files are in Google Drive.'}
              </p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={moving || pending === 0}
                onClick={() => void moveAll()}
              >
                {moving ? <Loader2 className="size-3.5 animate-spin" /> : <MoveRight className="size-3.5" />}
                {moving ? 'Moving…' : 'Move existing files to Drive'}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-3 border-t pt-3">
            <p className="text-xs text-muted-foreground">
              {props.hasGoogleAccount
                ? `Google will ask you to allow access to files ${APP_NAME} creates.`
                : 'Sign in with Google to connect Drive.'}
            </p>
            <DriveConnectButton returnTo="/settings/integrations" />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
