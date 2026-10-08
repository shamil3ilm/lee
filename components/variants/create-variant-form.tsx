'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { createVariantAction } from '@/app/(authed)/settings/variants/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormActions, FormField } from '@/components/ui/form-field'
import { NativeSelect } from '@/components/ui/native-select'
import { REGION_LABELS, REGIONS, type Region } from '@/lib/variants/types'

interface CreateVariantFormProps {
  families: Array<{ id: string; label: string }>
  initialRegion?: Region
  initialFamily?: string
}

/** One variant at a time, on demand (never a full region × role grid). */
export function CreateVariantForm({ families, initialRegion = 'gcc', initialFamily = '' }: CreateVariantFormProps) {
  const router = useRouter()
  const [region, setRegion] = useState<Region>(initialRegion)
  const [family, setFamily] = useState(initialFamily)
  const [length, setLength] = useState('1')
  const [pending, start] = useTransition()
  const create = (): void =>
    start(async () => {
      const r = await createVariantAction({ region, roleFamily: family, lengthTarget: length })
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      toast.success('Variant created')
      router.push(`/settings/variants/${r.id}`)
    })
  return (
    <Card>
      <CardHeader>
        <CardTitle>New variant</CardTitle>
        <CardDescription>
          A region preset sets the sections and region fields; a role preset (from your accepted role families) leads with the matching items. Only interview-ready items are picked.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-[1fr_1.4fr_8rem_auto]">
          <FormField htmlFor="new-variant-region" label="Region">
            <NativeSelect id="new-variant-region" value={region} onChange={(e) => setRegion(e.target.value as Region)}>
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {REGION_LABELS[r]}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField htmlFor="new-variant-family" label="Role">
            <NativeSelect id="new-variant-family" value={family} onChange={(e) => setFamily(e.target.value)}>
              <option value="">General</option>
              {families.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField htmlFor="new-variant-length" label="Length">
            <NativeSelect id="new-variant-length" value={length} onChange={(e) => setLength(e.target.value)}>
              <option value="1">1 page</option>
              <option value="2">2 pages</option>
            </NativeSelect>
          </FormField>
          <FormActions>
            <Button type="button" onClick={create} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Plus />}
              Create variant
            </Button>
          </FormActions>
        </div>
        {families.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">Accept role families in Settings › Search to get role presets.</p>
        ) : null}
      </CardContent>
    </Card>
  )
}
