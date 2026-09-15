'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { addStage } from '@/app/(authed)/applications/[id]/actions'
import { Button } from '@/components/ui/button'
import { SubmitButton } from '@/components/ui/submit-button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const KINDS = [
  { value: 'phone_screen', label: 'Phone screen' },
  { value: 'technical', label: 'Technical' },
  { value: 'system_design', label: 'System design' },
  { value: 'onsite', label: 'Onsite' },
  { value: 'final', label: 'Final' },
  { value: 'other', label: 'Other' },
] as const

interface AddStageDialogProps {
  applicationId: string
}

export function AddStageDialog({ applicationId }: AddStageDialogProps) {
  const [open, setOpen] = useState(false)

  async function handleSubmit(fd: FormData): Promise<void> {
    const result = await addStage(fd)
    if ('success' in result) {
      toast.success('Stage added')
      setOpen(false)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="size-4" />
          Add stage
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add interview stage</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="applicationId" value={applicationId} />
          <div className="space-y-1.5">
            <Label htmlFor="kind">Kind</Label>
            <Select name="kind" defaultValue="phone_screen">
              <SelectTrigger id="kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="title">Title (optional)</Label>
            <Input id="title" name="title" placeholder="e.g. Hiring manager chat" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="scheduledAt">Scheduled</Label>
              <Input id="scheduledAt" name="scheduledAt" type="datetime-local" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="durationMinutes">Duration (min)</Label>
              <Input id="durationMinutes" name="durationMinutes" type="number" min="0" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meetingUrl">Meeting URL</Label>
            <Input id="meetingUrl" name="meetingUrl" type="url" placeholder="https://…" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Adding…">Add stage</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
