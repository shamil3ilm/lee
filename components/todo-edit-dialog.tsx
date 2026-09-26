'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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

export interface TodoEditFields {
  id: string
  title: string
  notesMd: string | null
  priority: number
  /** ISO string or null. */
  dueAt: string | null
}

interface TodoEditDialogProps {
  todo: TodoEditFields
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** `YYYY-MM-DD` of an ISO timestamp in UTC (todos are due end-of-day UTC). */
function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : ''
}

/** Edit a todo through the existing PATCH /api/todos/[id] route. */
export function TodoEditDialog({ todo, open, onOpenChange }: TodoEditDialogProps) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [title, setTitle] = useState(todo.title)
  const [notes, setNotes] = useState(todo.notesMd ?? '')
  const [priority, setPriority] = useState(String(todo.priority))
  const [dueDate, setDueDate] = useState(toDateInput(todo.dueAt))

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!title.trim()) {
      toast.error('Title is required.')
      return
    }
    // Same convention as the quick-add form: due by 23:59:59 UTC that day.
    const due = dueDate ? new Date(`${dueDate}T23:59:59Z`) : null
    setPending(true)
    try {
      const res = await fetch(`/api/todos/${todo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          notesMd: notes.trim() || null,
          priority: Number(priority),
          dueAt: due && !Number.isNaN(due.getTime()) ? due.toISOString() : null,
        }),
      })
      if (res.ok) {
        toast.success('Todo updated')
        onOpenChange(false)
        router.refresh()
      } else {
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        toast.error(json.error ?? 'Could not update todo.')
      }
    } catch {
      toast.error('Network error — could not update todo.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit todo</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-todo-title">Title *</Label>
            <Input
              id="edit-todo-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={300}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-todo-priority">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger id="edit-todo-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">None</SelectItem>
                  <SelectItem value="1">Low</SelectItem>
                  <SelectItem value="2">Medium</SelectItem>
                  <SelectItem value="3">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-todo-due">Due</Label>
              <Input
                id="edit-todo-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-todo-notes">Notes</Label>
            <Textarea
              id="edit-todo-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
