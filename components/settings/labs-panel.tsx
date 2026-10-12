'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { setLabsAction } from '@/app/(authed)/settings/labs/actions'

const LAB_ITEMS = [
  { name: 'Playground', what: 'practice problems, mock interviews and review cards' },
  { name: 'Radar', what: 'an AI and tech news watch' },
  { name: 'Models', what: 'compare AI models side by side' },
  { name: 'Decisions', what: 'the decision-provider playground' },
  { name: 'Expenses', what: 'budgets and spending' },
] as const

/** The Labs switch: shows or hides the side-project group in the sidebar. */
export function LabsPanel({ enabled, defaultOn }: { enabled: boolean; defaultOn: boolean }) {
  const router = useRouter()
  const [on, setOn] = useState(enabled)
  const [pending, start] = useTransition()

  const change = (next: boolean): void => {
    setOn(next)
    start(async () => {
      const r = await setLabsAction(next)
      if ('error' in r) {
        setOn(!next)
        toast.error(r.error)
        return
      }
      toast.success(next ? 'Labs shown in the sidebar' : 'Labs hidden from the sidebar')
      router.refresh()
    })
  }

  return (
    <Card data-testid="labs-panel">
      <CardHeader className="pb-3">
        <CardTitle>Labs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <Switch
          checked={on}
          disabled={pending}
          onChange={(e) => change(e.currentTarget.checked)}
          label="Show Labs in the sidebar"
          description={`Off keeps the sidebar to the job search. ${defaultOn ? 'On by default for you, the owner.' : 'Off by default for invited accounts.'}`}
        />
        <ul className="space-y-1 text-sm text-muted-foreground" aria-label="What Labs holds">
          {LAB_ITEMS.map((i) => (
            <li key={i.name}>
              <span className="font-medium text-foreground">{i.name}</span>: {i.what}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
