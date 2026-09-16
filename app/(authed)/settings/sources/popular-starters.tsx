'use client'
import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { AddSourceDialog } from '@/components/add-source-dialog'
import { Button } from '@/components/ui/button'

interface Starter {
  id: string
  label: string
  kind: string
  company?: string
  url?: string
  name?: string
}

const STARTERS: Starter[] = [
  { id: 'stripe', label: 'Stripe (Greenhouse)', kind: 'greenhouse', company: 'stripe', name: 'Stripe (Greenhouse)' },
  { id: 'notion', label: 'Notion (Greenhouse)', kind: 'greenhouse', company: 'notion', name: 'Notion (Greenhouse)' },
  { id: 'ramp', label: 'Ramp (Ashby)', kind: 'ashby', company: 'ramp', name: 'Ramp (Ashby)' },
  { id: 'remoteok', label: 'RemoteOK (all remote)', kind: 'remoteok', name: 'RemoteOK' },
  { id: 'yc', label: 'YC Companies', kind: 'yc_directory', name: 'Y Combinator directory' },
  { id: 'hn', label: "HN Who's Hiring", kind: 'hn_whoishiring', name: "HN Who's Hiring" },
]

export function PopularStarters(): React.ReactElement {
  const [selected, setSelected] = useState<Starter | null>(null)

  return (
    <div className="rounded-lg border bg-card/40 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="size-4 text-primary" />
        Popular starters
      </div>
      <div className="flex flex-wrap gap-2">
        {STARTERS.map((s) => (
          <Button
            key={s.id}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSelected(s)}
          >
            {s.label}
          </Button>
        ))}
      </div>
      {selected ? (
        <AddSourceDialog
          key={selected.id}
          open={true}
          onOpenChange={(o) => {
            if (!o) setSelected(null)
          }}
          initialKind={selected.kind}
          initialCompany={selected.company ?? ''}
          initialUrl={selected.url ?? ''}
          initialName={selected.name ?? ''}
        />
      ) : null}
    </div>
  )
}
