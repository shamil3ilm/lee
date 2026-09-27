'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Copies one (already redacted) event as pretty JSON. */
export function CopyJsonButton({ json }: { json: string }) {
  const [copied, setCopied] = useState(false)
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(json)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Could not copy to the clipboard.')
    }
  }
  return (
    <Button type="button" variant="ghost" size="sm" onClick={copy} aria-label="Copy as JSON">
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copied ? 'Copied' : 'Copy as JSON'}
    </Button>
  )
}
