'use client'
import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { AddSourceDialog } from '@/components/add-source-dialog'
import { Button } from '@/components/ui/button'
import { DEFAULT_SOURCES } from '@/lib/defaults/catalog'

// One-click starters come from the same verified catalog as the account
// defaults (lib/defaults/catalog.ts), so broken slugs can't drift in here.
interface Starter {
  id: string
  label: string
  kind: string
  company?: string
  url?: string
  name?: string
}

const STARTERS: Starter[] = DEFAULT_SOURCES.map((d) => ({
  id: d.key,
  label: d.name,
  kind: d.kind,
  company: d.config.company,
  url: d.config.url,
  name: d.name,
}))

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
