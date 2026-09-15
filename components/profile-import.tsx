'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

// Uses a plain POST to /api/profile/import — Server Actions strip file bytes
// through their closure encoding. A native multipart POST works correctly.

export function ProfileImport() {
  const [pending, setPending] = useState(false)
  const router = useRouter()

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)

    setPending(true)
    try {
      const res = await fetch('/api/profile/import', {
        method: 'POST',
        body: formData,
      })
      const json = (await res.json()) as { success?: true; error?: string }
      if (res.ok && json.success) {
        toast.success('Profile imported')
        form.reset()
        router.refresh()
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
          <CardTitle className="text-sm font-semibold">Import from CV / markdown</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Upload a PDF/DOCX CV and/or a markdown profile. The AI provider parses them
            and pre-fills the form below.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cv">CV file (.pdf, .docx, .md, .txt)</Label>
              <Input
                id="cv"
                name="cv"
                type="file"
                accept=".pdf,.docx,.md,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
                className="cursor-pointer"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile_md">Profile markdown (.md, .txt)</Label>
              <Input
                id="profile_md"
                name="profile_md"
                type="file"
                accept=".md,.txt,text/markdown,text/plain"
                className="cursor-pointer"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {pending ? 'Parsing…' : 'Parse and save'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
