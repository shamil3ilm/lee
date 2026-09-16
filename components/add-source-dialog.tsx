'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { addSource } from '@/app/(authed)/settings/sources/actions'
import { Button } from '@/components/ui/button'
import { SubmitButton } from '@/components/ui/submit-button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

interface KindMeta {
  id: string
  label: string
  description: string
  needs: 'company' | 'url' | 'none'
  placeholder?: string
}

const KINDS: KindMeta[] = [
  { id: 'greenhouse', label: 'Greenhouse', description: 'Company board on greenhouse.io', needs: 'company', placeholder: 'stripe' },
  { id: 'lever', label: 'Lever', description: 'Company board on lever.co', needs: 'company', placeholder: 'netflix' },
  { id: 'ashby', label: 'Ashby', description: 'Company board on ashbyhq.com', needs: 'company', placeholder: 'ramp' },
  { id: 'workable', label: 'Workable', description: 'Company board on workable.com', needs: 'company', placeholder: 'company-slug' },
  { id: 'remoteok', label: 'RemoteOK', description: 'All remote-friendly jobs on remoteok.com', needs: 'none' },
  { id: 'hn_whoishiring', label: "HN Who's Hiring", description: 'Monthly HN "Who is hiring?" thread', needs: 'none' },
  { id: 'yc_directory', label: 'YC Directory', description: 'Y Combinator company directory', needs: 'none' },
  { id: 'rss', label: 'RSS feed', description: 'Any jobs RSS feed URL', needs: 'url', placeholder: 'https://example.com/jobs.rss' },
  { id: 'jsonld', label: 'JSON-LD JobPosting', description: 'A page with JSON-LD JobPosting markup', needs: 'url', placeholder: 'https://example.com/careers' },
]

const KIND_BY_ID = new Map(KINDS.map((k) => [k.id, k] as const))

interface AddSourceDialogProps {
  initialKind?: string
  initialCompany?: string
  initialUrl?: string
  initialName?: string
  triggerLabel?: string
  triggerVariant?: 'default' | 'outline' | 'ghost' | 'secondary'
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
}

export function AddSourceDialog({
  initialKind = 'greenhouse',
  initialCompany = '',
  initialUrl = '',
  initialName = '',
  triggerLabel = 'Add source',
  triggerVariant = 'default',
  open: controlledOpen,
  onOpenChange,
  children,
}: AddSourceDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = (v: boolean): void => {
    if (onOpenChange) onOpenChange(v)
    else setUncontrolledOpen(v)
  }
  const [kind, setKind] = useState<string>(initialKind)
  // KINDS is a non-empty constant, so this fallback is always defined; the
  // cast avoids repeated `meta ?? KINDS[0]` reads and satisfies noUncheckedIndex.
  const meta: KindMeta = KIND_BY_ID.get(kind) ?? (KINDS[0] as KindMeta)

  async function handleSubmit(fd: FormData): Promise<void> {
    fd.set('kind', kind)
    const result = await addSource(fd)
    if ('success' in result) {
      toast.success('Source added')
      setOpen(false)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children ? (
        <DialogTrigger asChild>{children}</DialogTrigger>
      ) : (
        <DialogTrigger asChild>
          <Button size="sm" variant={triggerVariant}>
            <Plus className="size-4" />
            {triggerLabel}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add discovery source</DialogTitle>
          <DialogDescription>
            Every discovery cycle polls each enabled source and scores new items.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="source-kind">Source kind *</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger id="source-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k.id} value={k.id}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{meta.description}</p>
          </div>

          {meta.needs === 'company' ? (
            <div className="space-y-1.5">
              <Label htmlFor="source-company">Company slug *</Label>
              <Input
                id="source-company"
                name="company"
                placeholder={meta.placeholder}
                defaultValue={initialCompany}
                required
                autoFocus
              />
            </div>
          ) : null}

          {meta.needs === 'url' ? (
            <div className="space-y-1.5">
              <Label htmlFor="source-url">Feed URL *</Label>
              <Input
                id="source-url"
                name="url"
                type="url"
                placeholder={meta.placeholder}
                defaultValue={initialUrl}
                required
                autoFocus
              />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="source-name">Display name</Label>
            <Input
              id="source-name"
              name="name"
              placeholder="Auto-generated from kind + config"
              defaultValue={initialName}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Adding…">Add source</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
