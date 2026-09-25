'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { VoiceInputButton } from '@/components/voice-input-button'

interface TodoFormProps {
  /** Optional pre-linked application id (mounted from application detail). */
  applicationId?: string
  /** Called after a successful create so parents can close a dialog. */
  onCreated?: () => void
}

/**
 * Quick-add form for a todo. Title + priority + due date (all-day, converted
 * to end-of-day UTC to match "due today"). POSTs to /api/todos and refreshes
 * server data via router.refresh().
 */
export function TodoForm({ applicationId, onCreated }: TodoFormProps) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState('0')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!title.trim()) {
      toast.error('Title is required.')
      return
    }
    setPending(true)
    try {
      // A user picks a date (all-day). Turn it into 23:59:59 UTC so the todo
      // is due by end-of-day; keeps "due today" filters correct.
      let dueAt: string | null = null
      if (dueDate) {
        const d = new Date(`${dueDate}T23:59:59Z`)
        if (!Number.isNaN(d.getTime())) dueAt = d.toISOString()
      }
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          priority: Number(priority),
          dueAt,
          notesMd: notes.trim() || null,
          applicationId: applicationId ?? null,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        todo?: { id: string }
        error?: string
      }
      if (res.ok && json.todo) {
        toast.success('Todo added')
        setTitle('')
        setDueDate('')
        setNotes('')
        setPriority('0')
        router.refresh()
        onCreated?.()
      } else {
        toast.error(json.error ?? 'Could not create todo.')
      }
    } catch {
      toast.error('Network error — could not create todo.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_140px_180px_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="todo-title">Title</Label>
          <div className="flex items-stretch gap-2">
            <Input
              id="todo-title"
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
              placeholder="e.g. Reply to Nadia about the design test"
              autoComplete="off"
              required
              className="flex-1"
            />
            <VoiceInputButton
              onTranscribed={(text) => {
                setTitle((prev) => (prev ? `${prev} ${text}` : text))
              }}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="todo-priority">Priority</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger id="todo-priority">
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
          <Label htmlFor="todo-due">Due date</Label>
          <Input
            id="todo-due"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.currentTarget.value)}
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={pending} className="w-full sm:w-auto">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Add todo
          </Button>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="todo-notes" className="text-xs text-muted-foreground">
          Notes (optional)
        </Label>
        <Input
          id="todo-notes"
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
          placeholder="Extra context…"
          autoComplete="off"
        />
      </div>
    </form>
  )
}
