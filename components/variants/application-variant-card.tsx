'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { chooseVariantAction } from '@/app/(authed)/settings/variants/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/native-select'
import type { VariantSuggestion, VariantSummary } from '@/lib/variants/suggest'
import type { BestCv } from '@/lib/cv-fit/types'
import { BestCvLine } from '@/components/cv-fit/best-cv-line'
import { PhotoAdvice, type PhotoAdviceData } from '@/components/cv-fit/photo-advice'

interface ApplicationVariantCardProps {
  applicationId: string
  variants: VariantSummary[]
  suggestion: VariantSuggestion
  current: { id: string; name: string; version: number } | null
  /** Best CV for this job (lib/cv-fit), when variants exist. */
  bestCv?: BestCv | null
  photo?: PhotoAdviceData | null
}

/** Which résumé variant this application uses; tailored CVs start from it. */
export function ApplicationVariantCard({ applicationId, variants, suggestion, current, bestCv = null, photo = null }: ApplicationVariantCardProps) {
  const router = useRouter()
  const [selected, setSelected] = useState(current?.id ?? bestCv?.best.variantId ?? suggestion.variant?.id ?? '')
  const [pending, start] = useTransition()
  const use = (variantId: string | null): void =>
    start(async () => {
      const r = await chooseVariantAction(applicationId, variantId)
      if ('error' in r) toast.error(r.error)
      else {
        toast.success(variantId ? `Using version ${r.version}` : 'Using your master profile')
        router.refresh()
      }
    })
  const createHref = suggestion.create
    ? `/settings/variants?region=${suggestion.create.region}${suggestion.create.roleFamily ? `&family=${suggestion.create.roleFamily}` : ''}`
    : '/settings/variants'
  return (
    <Card data-testid="application-variant">
      <CardHeader>
        <CardTitle>Résumé variant</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          {current ? (
            <>
              Tailored CVs start from <span className="font-medium text-foreground">{current.name}</span> v{current.version}.
            </>
          ) : (
            'Tailored CVs start from your master profile.'
          )}
        </p>
        {variants.length > 0 ? (
          <BestCvLine bestCv={bestCv} target={{ kind: 'application', id: applicationId }} currentVariantId={current?.id ?? null} />
        ) : null}
        {photo ? <PhotoAdvice applicationId={applicationId} data={photo} /> : null}
        {!bestCv && suggestion.variant && suggestion.variant.id !== current?.id ? (
          <p>
            Suggested: <span className="font-medium">{suggestion.variant.name}</span>
            <span className="block text-xs text-muted-foreground">{suggestion.reason}</span>
          </p>
        ) : null}
        {variants.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <NativeSelect aria-label="Variant for this application" value={selected} onChange={(e) => setSelected(e.target.value)} className="min-w-0 flex-1">
              <option value="">Master profile</option>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} (v{v.currentVersion})
                </option>
              ))}
            </NativeSelect>
            <Button type="button" size="sm" className="h-9" disabled={pending} onClick={() => use(selected || null)}>
              {pending ? <Loader2 className="animate-spin" /> : null} Use
            </Button>
          </div>
        ) : null}
        {suggestion.create ? (
          <Link href={createHref} className="inline-block text-xs text-primary hover:underline">
            Create a variant for this kind of job
          </Link>
        ) : null}
      </CardContent>
    </Card>
  )
}
