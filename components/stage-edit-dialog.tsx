'use client'
import { toast } from 'sonner'
import { updateStageDetails } from '@/app/(authed)/applications/[id]/actions'
import { Button } from '@/components/ui/button'
import { SubmitButton } from '@/components/ui/submit-button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { STAGE_KINDS } from '@/lib/stages/kinds'

export interface StageEditFields {
  stageKind: string
  title: string | null
  scheduledAt: string | null
  durationMinutes: number | null
  location: string | null
  meetingUrl: string | null
  prepNotesMd: string | null
}

interface StageEditDialogProps {
  stageId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  initial: StageEditFields
}

/** ISO → `YYYY-MM-DDTHH:mm` in the browser's timezone for datetime-local. */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function StageEditDialog({ stageId, open, onOpenChange, initial }: StageEditDialogProps) {
  async function handleSubmit(fd: FormData): Promise<void> {
    // Interpret the picker in the user's own timezone, then send ISO.
    const local = String(fd.get('scheduledAt') ?? '')
    if (local) {
      const d = new Date(local)
      fd.set('scheduledAt', Number.isNaN(d.getTime()) ? local : d.toISOString())
    }
    const result = await updateStageDetails(stageId, fd)
    if ('success' in result) {
      toast.success('Stage updated')
      onOpenChange(false)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit interview stage</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-stage-kind">Kind</Label>
              <Select name="kind" defaultValue={initial.stageKind}>
                <SelectTrigger id="edit-stage-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGE_KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-stage-title">Title</Label>
              <Input id="edit-stage-title" name="title" defaultValue={initial.title ?? ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-stage-scheduled">Scheduled</Label>
              <Input
                id="edit-stage-scheduled"
                name="scheduledAt"
                type="datetime-local"
                defaultValue={toLocalInput(initial.scheduledAt)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-stage-duration">Duration (min)</Label>
              <Input
                id="edit-stage-duration"
                name="durationMinutes"
                type="number"
                min="0"
                defaultValue={initial.durationMinutes ?? ''}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-stage-location">Location</Label>
              <Input id="edit-stage-location" name="location" defaultValue={initial.location ?? ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-stage-meeting">Meeting URL</Label>
              <Input
                id="edit-stage-meeting"
                name="meetingUrl"
                type="url"
                placeholder="https://…"
                defaultValue={initial.meetingUrl ?? ''}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="edit-stage-prep">Prep notes</Label>
              <Textarea
                id="edit-stage-prep"
                name="prepNotesMd"
                rows={3}
                defaultValue={initial.prepNotesMd ?? ''}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            If this stage is on your Google Calendar, a new time is synced there too.
          </p>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
