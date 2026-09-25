'use client'
import { useState } from 'react'
import { CheckSquare, Plus } from 'lucide-react'
import type { Todo } from '@/lib/db/queries/todos'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TodoForm } from '@/components/todo-form'
import { TodoRow } from '@/components/todo-row'

interface TodosCardProps {
  applicationId: string
  todos: Todo[]
}

/**
 * Mini todos widget mounted on the application detail page. Shows todos
 * linked to this application only; "+ Add" opens a dialog with a pre-linked
 * quick-add form.
 */
export function TodosCard({ applicationId, todos }: TodosCardProps) {
  const [addOpen, setAddOpen] = useState(false)
  const openCount = todos.filter((t) => t.status === 'open').length

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <CheckSquare className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Todos</CardTitle>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground">
            {openCount} open
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="size-3.5" />
          Add
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {todos.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
            No todos linked to this application yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {todos.map((t) => (
              <TodoRow key={t.id} todo={t} />
            ))}
          </ul>
        )}
      </CardContent>
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New todo</DialogTitle>
          </DialogHeader>
          <TodoForm
            applicationId={applicationId}
            onCreated={() => setAddOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </Card>
  )
}
