'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Copy, ExternalLink, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { aiModeSearchUrl } from '@/lib/discovery/ai-mode/url'
import type { AiModePromptSet } from '@/lib/discovery/ai-mode/load'

/**
 * "Search with Google AI Mode": suggested prompts from the search
 * preferences, editable, each opened in a new tab of the user's own browser
 * through a plain link. lee never contacts Google itself.
 */

interface PromptRow {
  id: string
  label: string
  text: string
  employers?: Array<{ name: string; nationalsOnly: boolean }>
}

function PromptEditor({ row, onChange }: { row: PromptRow; onChange: (text: string) => void }) {
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(row.text)
      toast.success('Prompt copied')
    } catch {
      toast.error('Could not copy. Select the text and copy it instead.')
    }
  }
  return (
    <li className="space-y-2 rounded-lg border bg-card p-3" data-testid="ai-mode-prompt">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-medium">{row.label}</span>
        {(row.employers ?? []).map((e) => (
          <Badge key={e.name} variant="neutral">
            {e.name}
          </Badge>
        ))}
      </div>
      <Textarea
        value={row.text}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        aria-label={`Prompt: ${row.label}`}
        className="text-sm"
      />
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <a href={aiModeSearchUrl(row.text)} target="_blank" rel="noopener noreferrer" data-testid="ai-mode-open">
            <ExternalLink className="size-4" aria-hidden="true" />
            Open in Google AI Mode
          </a>
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={copy}>
          <Copy className="size-4" aria-hidden="true" />
          Copy prompt
        </Button>
      </div>
    </li>
  )
}

export function AiModeDialog({ promptSet, triggerVariant = 'outline' }: { promptSet: AiModePromptSet; triggerVariant?: 'default' | 'outline' }) {
  const toRow = (p: AiModePromptSet['today'][number]): PromptRow => ({ id: p.id, label: p.label, text: p.prompt, employers: p.employers })
  const [rows, setRows] = useState<PromptRow[]>(promptSet.today.map(toRow))
  const [more, setMore] = useState<PromptRow[]>(promptSet.more.map(toRow))
  const [posts, setPosts] = useState<PromptRow[]>((promptSet.posts ?? []).map((p) => ({ id: p.id, label: p.label, text: p.prompt })))
  const update = (id: string, text: string): void => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, text } : r)))
    setMore((prev) => prev.map((r) => (r.id === id ? { ...r, text } : r)))
    setPosts((prev) => prev.map((r) => (r.id === id ? { ...r, text } : r)))
  }
  const { cycleDays, employerBatches } = promptSet

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant={triggerVariant} data-testid="ai-mode-trigger">
          <Sparkles className="size-4" aria-hidden="true" />
          Search with Google AI Mode
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Search with Google AI Mode</DialogTitle>
          <DialogDescription>
            Prompts built from your search preferences only (no name, email, phone or employer). Edit them, then open
            one: it runs in a new tab of your own browser. lee does not contact Google.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-3" aria-label="Today's prompts">
          {rows.map((r) => (
            <PromptEditor key={r.id} row={r} onChange={(text) => update(r.id, text)} />
          ))}
        </ul>
        {more.length > 0 ? (
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">More prompts ({more.length})</summary>
            <ul className="mt-3 space-y-3">
              {more.map((r) => (
                <PromptEditor key={r.id} row={r} onChange={(text) => update(r.id, text)} />
              ))}
            </ul>
          </details>
        ) : null}
        {posts.length > 0 ? (
          <section aria-labelledby="ai-mode-posts-heading" className="space-y-2" data-testid="ai-mode-posts">
            <h3 id="ai-mode-posts-heading" className="text-sm font-semibold">
              LinkedIn hiring posts
            </h3>
            <p className="text-xs text-muted-foreground">
              Finds recent public “we’re hiring” posts with their links. Open a post yourself, copy its text and add it
              with “Add from text or link”: lee keeps LinkedIn links as links and never opens them.
            </p>
            <ul className="space-y-3" aria-label="Hiring-post prompts">
              {posts.map((r) => (
                <PromptEditor key={r.id} row={r} onChange={(text) => update(r.id, text)} />
              ))}
            </ul>
          </section>
        ) : null}
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>
            Today’s prompts change daily; every prompt comes round within {cycleDays} day{cycleDays === 1 ? '' : 's'}.
            {employerBatches > 0
              ? ` Employer watch covers ${employerBatches} group${employerBatches === 1 ? '' : 's'} of GCC employers; nationals-only employers are left out.`
              : ''}
          </p>
          <p>
            Prefer not to search signed in? Copy a prompt and paste it into an Incognito or private window. Then use
            “Add from text or link” to bring the openings you want into lee.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
