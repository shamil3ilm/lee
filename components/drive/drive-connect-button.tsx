'use client'
import { useTransition } from 'react'
import { HardDrive, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { connectDriveAction } from '@/lib/drive/actions'

interface DriveConnectButtonProps {
  /** Path to return to after Google's consent screen. */
  returnTo: string
  reconnect?: boolean
  size?: 'sm' | 'default'
  variant?: 'default' | 'outline' | 'secondary'
}

/** Starts Google's consent for drive.file (incremental authorization). */
export function DriveConnectButton({
  returnTo,
  reconnect = false,
  size = 'sm',
  variant = 'outline',
}: DriveConnectButtonProps) {
  const [pending, start] = useTransition()
  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      disabled={pending}
      data-testid="drive-connect"
      onClick={() => start(() => connectDriveAction(returnTo))}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <HardDrive className="size-3.5" />}
      {reconnect ? 'Reconnect Google Drive' : 'Connect Google Drive'}
    </Button>
  )
}
