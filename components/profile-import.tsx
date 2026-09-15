'use client'
import { useActionState, useEffect } from 'react'
import { useFormStatus } from 'react-dom'
import { toast } from 'sonner'
import { Loader2, Upload } from 'lucide-react'
import {
  importProfileAction,
  type ActionResult,
} from '@/app/(authed)/settings/profile/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {pending ? 'Parsing…' : 'Parse and save'}
    </Button>
  )
}

async function runImport(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult | null> {
  return importProfileAction(formData)
}

export function ProfileImport() {
  // useActionState is React 19's pattern for server actions that need to
  // report results back to the client. It preserves multipart file uploads
  // intact — unlike wrapping the action in a client callback (which triggers
  // Next's closure encoding and strips file bytes).
  const [state, action] = useActionState<ActionResult | null, FormData>(
    runImport,
    null,
  )

  useEffect(() => {
    if (state === null) return
    if ('success' in state) toast.success('Profile imported')
    else toast.error(state.error)
  }, [state])

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Upload className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Import from CV / markdown</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
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
            <SubmitButton />
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
