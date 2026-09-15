'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useFormStatus } from 'react-dom'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { addFromUrl, addManually } from '@/app/(authed)/applications/new/actions'

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {pending ? 'Parsing…' : label}
    </Button>
  )
}

interface NewApplicationFormProps {
  prefillUrl?: string
}

export function NewApplicationForm({ prefillUrl }: NewApplicationFormProps) {
  const router = useRouter()
  const [tab, setTab] = React.useState<'url' | 'manual'>('url')
  const [failedUrl, setFailedUrl] = React.useState<string | undefined>(prefillUrl)

  async function handleUrl(fd: FormData): Promise<void> {
    const result = await addFromUrl(fd)
    if ('success' in result) {
      toast.success('Application saved')
      router.push(`/applications/${result.applicationId}`)
    } else {
      toast.error(result.error)
      const attempted = fd.get('url')
      if (typeof attempted === 'string') setFailedUrl(attempted)
      setTab('manual')
    }
  }

  async function handleManual(fd: FormData): Promise<void> {
    const result = await addManually(fd)
    if ('success' in result) {
      toast.success('Application saved')
      router.push(`/applications/${result.applicationId}`)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as 'url' | 'manual')} className="w-full">
      <TabsList>
        <TabsTrigger value="url">Paste URL</TabsTrigger>
        <TabsTrigger value="manual">Manual entry</TabsTrigger>
      </TabsList>

      <TabsContent value="url">
        <form action={handleUrl} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="url">Job posting URL</Label>
            <Input
              id="url"
              name="url"
              type="url"
              placeholder="https://…"
              required
              autoFocus
              defaultValue={failedUrl}
            />
            <p className="text-xs text-muted-foreground">
              We fetch the page, parse it with AI, and create a saved application.
            </p>
          </div>
          <SubmitButton label="Parse and save" />
        </form>
      </TabsContent>

      <TabsContent value="manual">
        <form action={handleManual} className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="title">Role title *</Label>
              <Input id="title" name="title" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="companyName">Company name *</Label>
              <Input id="companyName" name="companyName" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sourceUrl">Source URL *</Label>
              <Input
                id="sourceUrl"
                name="sourceUrl"
                type="url"
                required
                defaultValue={failedUrl}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="location">Location</Label>
              <Input id="location" name="location" placeholder="Dubai, UAE" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="remoteType">Remote type</Label>
              <Select name="remoteType">
                <SelectTrigger id="remoteType">
                  <SelectValue placeholder="Not specified" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="remote">Remote</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                  <SelectItem value="onsite">Onsite</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="employmentType">Employment type</Label>
              <Select name="employmentType">
                <SelectTrigger id="employmentType">
                  <SelectValue placeholder="Not specified" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_time">Full-time</SelectItem>
                  <SelectItem value="part_time">Part-time</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="internship">Internship</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="description">Description / notes</Label>
              <Textarea id="description" name="description" rows={8} />
            </div>
          </div>
          <SubmitButton label="Save application" />
        </form>
      </TabsContent>
    </Tabs>
  )
}
