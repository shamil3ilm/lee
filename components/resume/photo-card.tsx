'use client'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ImageUp, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PHOTO_INPUT_TYPES, validatePhotoFile } from '@/lib/resume/photo'
import { cropToSquareJpeg } from '@/lib/resume/photo-crop'

interface PhotoCardProps {
  /** sha256 of the stored photo (cache-busts the preview), or null when none. */
  photoVersion: string | null
}

async function errorOf(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null
  return typeof body?.error === 'string' ? body.error : 'Could not save the photo.'
}

/**
 * Settings › Profile › Résumé: the profile photo used by variant PDFs whose
 * Photo toggle is on. Private — never published to the portfolio.
 */
export function PhotoCard({ photoVersion }: PhotoCardProps) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [pending, start] = useTransition()

  const upload = (file: File): void =>
    start(async () => {
      const invalid = validatePhotoFile(file)
      if (invalid) {
        setError(invalid)
        return
      }
      let cropped: Blob
      try {
        cropped = await cropToSquareJpeg(file)
      } catch {
        setError('This image could not be read. Try another file.')
        return
      }
      const form = new FormData()
      form.append('file', new File([cropped], 'photo.jpg', { type: 'image/jpeg' }))
      try {
        const res = await fetch('/api/profile/photo', { method: 'POST', body: form })
        if (!res.ok) {
          setError(await errorOf(res))
          return
        }
      } catch {
        setError('Could not reach lee. Check your connection and try again.')
        return
      }
      setError(null)
      toast.success('Photo saved')
      router.refresh()
    })

  const remove = (): void =>
    start(async () => {
      try {
        const res = await fetch('/api/profile/photo', { method: 'DELETE' })
        if (!res.ok) {
          toast.error('Could not remove the photo.')
          return
        }
      } catch {
        toast.error('Could not reach lee. Check your connection and try again.')
        return
      }
      setConfirm(false)
      toast.success('Photo removed')
      router.refresh()
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Photo</CardTitle>
        <CardDescription>
          Private. Placed only in variant PDFs whose Photo field is on — never for Remote / US / EU or India, off by
          default for GCC — and never published to your portfolio. JPEG, PNG or WebP up to 2 MB; lee crops it square.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4">
        {photoVersion ? (
          // eslint-disable-next-line @next/next/no-img-element -- private, authenticated route; no optimisation wanted
          <img
            src={`/api/profile/photo?v=${photoVersion.slice(0, 12)}`}
            alt="Your profile photo"
            width={96}
            height={96}
            className="size-24 rounded-md border object-cover"
            data-testid="profile-photo"
          />
        ) : (
          <div className="flex size-24 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">No photo</div>
        )}
        <div className="space-y-2">
          <input
            ref={input}
            type="file"
            accept={PHOTO_INPUT_TYPES.join(',')}
            className="sr-only"
            aria-label="Choose a photo"
            data-testid="photo-input"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) upload(file)
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => input.current?.click()}>
              {pending ? <Loader2 className="animate-spin" /> : <ImageUp />}
              {photoVersion ? 'Replace photo' : 'Upload photo'}
            </Button>
            {photoVersion ? (
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setConfirm(true)}>
                <Trash2 /> Remove
              </Button>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </CardContent>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Remove your photo?"
        description={<p>Variant PDFs stop showing it the next time they are built. Copies inside existing variant documents are replaced then too.</p>}
        confirmLabel="Remove"
        pending={pending}
        onConfirm={remove}
      />
    </Card>
  )
}
