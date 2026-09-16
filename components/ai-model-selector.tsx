'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Cpu, Loader2, Zap } from 'lucide-react'
import { saveAiModelAction } from '@/app/(authed)/settings/profile/actions'
// Import from the registry file directly (not from @/lib/ai) so this client
// component doesn't pull the server DB chain via lib/ai/index.ts.
import { MODEL_REGISTRY, type ModelChoice } from '@/lib/ai/registry'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface AiModelSelectorProps {
  currentModelId: string | null
}

const USE_ENV_VALUE = '__env_default__'

export function AiModelSelector({ currentModelId }: AiModelSelectorProps) {
  const [pending, start] = useTransition()
  const [selected, setSelected] = useState<string>(currentModelId ?? USE_ENV_VALUE)

  function save(value: string): void {
    const modelIdForServer = value === USE_ENV_VALUE ? '' : value
    setSelected(value)
    start(async () => {
      const fd = new FormData()
      fd.set('modelId', modelIdForServer)
      const result = await saveAiModelAction(fd)
      if ('success' in result) toast.success('AI model updated')
      else toast.error(result.error)
    })
  }

  const active: ModelChoice | undefined = MODEL_REGISTRY.find((m) => m.id === selected)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Cpu className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">AI model</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Model used for CV parsing, job matching, and future document generation.
          Switch anytime — takes effect on the next AI call.
        </p>
        <Select value={selected} onValueChange={save} disabled={pending}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Pick a model" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={USE_ENV_VALUE}>
              Use server default
            </SelectItem>
            {MODEL_REGISTRY.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label}
                {m.freeTier ? ' · free' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {active ? (
          <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-2 text-xs">
            <Zap className="mt-0.5 size-3.5 text-muted-foreground" />
            <div>
              <div className="font-medium">{active.label}</div>
              <div className="text-muted-foreground">{active.description}</div>
              {active.tokensPerSec ? (
                <div className="mt-1 text-muted-foreground">
                  ~{active.tokensPerSec} tok/sec
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {pending ? (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> saving…
          </div>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => save(USE_ENV_VALUE)}
          disabled={pending || selected === USE_ENV_VALUE}
        >
          Reset to server default
        </Button>
      </CardContent>
    </Card>
  )
}
