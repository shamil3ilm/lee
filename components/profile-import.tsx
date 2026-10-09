'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { ImportReviewPanel } from '@/components/import/import-review-panel'
import { applyCvImportAction } from '@/app/(authed)/settings/profile/cv-import-actions'
import type { ImportItem } from '@/lib/import/types'
import type { CvProposal } from '@/lib/profile/cv-import'

// Uses a plain POST to /api/profile/import — Server Actions strip file bytes
// through their closure encoding. A native multipart POST works correctly.
// The route only parses; the review below applies what the user ticks.

interface Preview {
  proposal: CvProposal
  items: ImportItem[]
  editable: boolean
}

export function ProfileImport() {
  const [pending, setPending] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const router = useRouter()

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const form = event.currentTarget
    setPending(true)
    try {
      const res = await fetch('/api/profile/import', { method: 'POST', body: new FormData(form) })
      const json = (await res.json()) as Partial<Preview> & { success?: true; error?: string }
      if (res.ok && json.success && json.proposal && json.items) {
        setPreview({ proposal: json.proposal, items: json.items, editable: json.editable === true })
        form.reset()
      } else {
        toast.error(json.error ?? 'Could not import profile.')
      }
    } catch {
      toast.error('Network error — could not import profile.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Upload className="size-4 text-muted-foreground" />
          <CardTitle>Import from CV / markdown</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Upload a PDF/DOCX CV and/or a markdown profile. The AI provider parses them into suggestions; you review them item by item and nothing
            is saved until you confirm.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cv">CV file (.pdf, .docx, .md, .txt)</Label>
              <Input
                id="cv"
                name="cv"
                type="file"
                accept=".pdf,.docx,.md,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile_md">Profile markdown (.md, .txt)</Label>
              <Input id="profile_md" name="profile_md" type="file" accept=".md,.txt,text/markdown,text/plain" />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {pending ? 'Parsing…' : 'Parse and review'}
            </Button>
          </div>
        </form>
        {preview ? (
          <div data-testid="cv-import-review">
            <ImportReviewPanel
              items={preview.items}
              suggestOnly={!preview.editable}
              onApply={(selection) => applyCvImportAction(preview.proposal, selection)}
              onCancel={() => setPreview(null)}
              onApplied={() => router.refresh()}
              onDone={() => setPreview(null)}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
