'use client'
import { toast } from 'sonner'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Copy a suggestion to paste into LinkedIn by hand (there is no API for profile edits). */
export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        navigator.clipboard
          .writeText(text)
          .then(() => toast.success('Copied.'))
          .catch(() => toast.error('Could not copy. Select the text and copy it instead.'))
      }}
    >
      <Copy className="size-3.5" aria-hidden="true" />
      {label}
    </Button>
  )
}
