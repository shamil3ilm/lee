'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ClipboardPaste, ExternalLink, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { findCompaniesNow, importCompaniesFromText } from '@/app/(authed)/discoveries/company-actions'
import type { CompanyPrompt } from '@/lib/company-discovery/ai-prompts'

const MAX_CHARS = 20_000

/**
 * "Add companies": Google AI Mode prompts (opened in the user's own
 * browser; lee never contacts Google) and a paste box for the answer, a
 * list or links. Names and websites become companies; their careers pages
 * are checked later, after a robots.txt check.
 */
export function PasteCompaniesDialog({ prompts }: { prompts: readonly CompanyPrompt[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [pending, start] = useTransition()

  const add = (): void => {
    start(async () => {
      const r = await importCompaniesFromText(text)
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      toast.success(r.message ?? 'Added')
      setText('')
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" data-testid="add-companies">
          <ClipboardPaste className="size-4" aria-hidden="true" />
          Add companies
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add companies</DialogTitle>
          <DialogDescription>
            Ask Google AI Mode in your own browser, then paste the answer, a list or links here. One company per line: a name, a website, or both.
          </DialogDescription>
        </DialogHeader>
        {prompts.length > 0 ? (
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Prompts for Google AI Mode ({prompts.length})</summary>
            <ul className="mt-2 space-y-2">
              {prompts.map((p) => (
                <li key={p.id} className="space-y-1 text-sm">
                  <p className="font-medium">{p.label}</p>
                  <p className="text-muted-foreground">{p.prompt}</p>
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs underline underline-offset-4">
                    Open in Google AI Mode
                    <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
          rows={8}
          aria-label="Companies to add"
          placeholder={'Acme Payments - https://acme.example\nBeta ERP (Kuwait City) — beta.example'}
          data-testid="add-companies-text"
        />
        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await findCompaniesNow()
                if ('error' in r) toast.error(r.error)
                else toast.success(r.message ?? 'Queued')
              })
            }
          >
            <Search className="size-4" aria-hidden="true" />
            Run the weekly search now
          </Button>
          <Button type="button" size="sm" onClick={add} disabled={pending || text.trim().length < 2} data-testid="add-companies-submit">
            Add companies
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
