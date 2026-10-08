'use client'
import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Camera, Loader2 } from 'lucide-react'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { switchToPhotoVersionAction } from '@/app/(authed)/cv-fit-actions'
import { PHOTO_LABELS, type PhotoVerdict } from '@/lib/cv-fit/photo/labels'
import type { PhotoActionKind } from '@/lib/cv-fit/photo/variant'
import { cn } from '@/lib/utils'

export interface PhotoAdviceData {
  advice: PhotoVerdict
  reasons: string[]
  action: { kind: PhotoActionKind; note: string }
}

const TONE: Readonly<Record<PhotoVerdict, BadgeProps['variant']>> = {
  recommended: 'info',
  optional: 'neutral',
  avoid: 'warning',
}

/**
 * "Photo: Recommended / Optional / Avoid" with the reasons and the next
 * step under the variant's own rules (Remote / US / EU and India never
 * show a photo). The rules live in lib/cv-fit/photo.
 */
export function PhotoAdvice({ data, applicationId, className }: { data: PhotoAdviceData; applicationId: string; className?: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const switchVersion = (): void =>
    start(async () => {
      const r = await switchToPhotoVersionAction(applicationId)
      if ('error' in r) toast.error(r.error)
      else {
        toast.success(r.created ? `Created and using ${r.name}` : `Using ${r.name}`)
        router.refresh()
      }
    })
  return (
    <div className={cn('space-y-1.5', className)} data-testid="photo-advice">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Camera className="size-3.5 text-muted-foreground" aria-hidden="true" />
        <Badge variant={TONE[data.advice]}>Photo: {PHOTO_LABELS[data.advice]}</Badge>
      </div>
      <ul className="space-y-0.5 pl-5 text-[11px] leading-snug text-muted-foreground" aria-label="Why">
        {data.reasons.slice(0, 3).map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {data.action.kind === 'switch_to_gcc_photo' ? (
        <div className="space-y-1 pl-5">
          <p className="text-[11px] text-muted-foreground">{data.action.note}</p>
          <Button size="sm" variant="outline" className="h-8" disabled={pending} onClick={switchVersion}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Use the photo version
          </Button>
        </div>
      ) : null}
      {data.action.kind === 'upload' ? (
        <p className="pl-5 text-[11px] text-muted-foreground">
          {data.action.note}{' '}
          <Link href={`/settings/resume?from=${encodeURIComponent(`/applications/${applicationId}/prepare`)}`} className="font-medium text-primary underline underline-offset-2">
            Upload a photo
          </Link>
        </p>
      ) : null}
      {data.action.kind === 'turn_off' ? <p className="pl-5 text-[11px] font-medium text-warning">{data.action.note}</p> : null}
    </div>
  )
}
