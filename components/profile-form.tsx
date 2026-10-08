'use client'
import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { saveProfileAction } from '@/app/(authed)/settings/profile/actions'
import type { UserProfile } from '@/lib/db/queries/profile'
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
import { Card, CardContent } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/native-select'
import { currencyOptions } from '@/lib/ui/currencies'
import {
  DEFAULT_TIMEZONE,
  detectBrowserTimezone,
  listTimezones,
} from '@/lib/ui/timezone'

interface ProfileFormProps {
  profile: UserProfile | null
}

// Target roles, locations, relocation and include/exclude keywords live in
// the Search preferences card (components/search-prefs), not here.
const ARRAY_FIELDS = [
  ['skills', 'Skills'],
  ['industries', 'Industries'],
  ['employmentTypes', 'Employment types'],
  ['mustHaves', 'Must-haves'],
] as const

const JSON_FIELDS = [
  ['stackWeights', 'Stack weights'],
  ['companySizeWeights', 'Company size weights'],
  ['benefitPrefs', 'Benefit prefs'],
] as const

function arr(v: string[] | null | undefined): string {
  return (v ?? []).join(', ')
}

function json(v: unknown): string {
  return JSON.stringify(v ?? null, null, 2)
}

export function ProfileForm({ profile }: ProfileFormProps) {
  const [pending, start] = useTransition()
  const [timezone, setTimezone] = useState<string>(profile?.timezone ?? DEFAULT_TIMEZONE)
  // Browsers list canonical ids (Chromium: 'Asia/Calcutta'), so a saved alias
  // like 'Asia/Kolkata' was missing and the select rendered blank. Always
  // keep the current value selectable (v17 §9.1 visual QA).
  const timezones = useMemo(() => {
    const all = listTimezones()
    return all.includes(timezone) ? all : [timezone, ...all]
  }, [timezone])

  function handleSubmit(fd: FormData): void {
    start(async () => {
      const result = await saveProfileAction(fd)
      if ('success' in result) toast.success('Profile saved')
      else toast.error(result.error)
    })
  }

  function handleDetectTimezone(): void {
    const detected = detectBrowserTimezone()
    setTimezone(detected)
    toast.success(`Detected timezone: ${detected}`)
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <Tabs defaultValue="basics">
        {/*
          5 tabs at 390px would overflow. Horizontal-scroll wrapper keeps the
          row single-line without expanding the page beyond the viewport.
        */}
        <div className="-mx-1 overflow-x-auto px-1">
          <TabsList className="w-max">
            <TabsTrigger value="basics">Basics</TabsTrigger>
            <TabsTrigger value="skills">Skills</TabsTrigger>
            <TabsTrigger value="preferences">Weights</TabsTrigger>
            <TabsTrigger value="narrative">Narrative</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="basics">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Headline" name="headline" defaultValue={profile?.headline ?? ''} />
                <Field
                  label="Years experience"
                  name="yearsExperience"
                  type="number"
                  min={0}
                  defaultValue={profile?.yearsExperience ?? ''}
                />
                <Field
                  label="Comp floor (annual)"
                  name="compFloorAnnual"
                  type="number"
                  min={0}
                  defaultValue={profile?.compFloorAnnual ?? ''}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="compCurrency">Comp currency</Label>
                  <NativeSelect id="compCurrency" name="compCurrency" defaultValue={profile?.compCurrency ?? ''}>
                    <option value="">Not set</option>
                    {currencyOptions(profile?.compCurrency).map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Seniority and work mode are set once, in{' '}
                  <Link href="/settings/search" className="text-primary underline underline-offset-2">
                    Settings › Search
                  </Link>
                  .
                </p>
                <div className="space-y-1.5 sm:col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="timezone">Timezone</Label>
                    <button
                      type="button"
                      onClick={handleDetectTimezone}
                      className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      Auto-detect
                    </button>
                  </div>
                  <Select
                    name="timezone"
                    value={timezone}
                    onValueChange={setTimezone}
                  >
                    <SelectTrigger id="timezone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {timezones.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Used for calendar events and Monday-morning digest timing.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="skills">
          <Card>
            <CardContent className="space-y-3 pt-6">
              <p className="text-xs text-muted-foreground">
                Comma-separated. Order matters — put strongest signals first.
              </p>
              {ARRAY_FIELDS.slice(0, 3).map(([field, label]) => (
                <Field
                  key={field}
                  label={label}
                  name={field}
                  defaultValue={arr(profile ? (profile[field] as string[] | null) : null)}
                />
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences">
          <Card>
            <CardContent className="space-y-4 pt-6">
              {ARRAY_FIELDS.slice(3).map(([field, label]) => (
                <Field
                  key={field}
                  label={label}
                  name={field}
                  defaultValue={arr(profile ? (profile[field] as string[] | null) : null)}
                />
              ))}
              {JSON_FIELDS.slice(0, 3).map(([field, label]) => (
                <div key={field} className="space-y-1.5">
                  <Label htmlFor={field}>{label} (JSON)</Label>
                  <Textarea
                    id={field}
                    name={field}
                    rows={4}
                    defaultValue={json(profile?.[field])}
                    className="font-mono text-xs"
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="narrative">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-1.5">
                <Label htmlFor="summaryMd">Summary (markdown)</Label>
                <Textarea
                  id="summaryMd"
                  name="summaryMd"
                  rows={5}
                  defaultValue={profile?.summaryMd ?? ''}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="careerNarrativeMd">Career narrative (markdown)</Label>
                <Textarea
                  id="careerNarrativeMd"
                  name="careerNarrativeMd"
                  rows={8}
                  defaultValue={profile?.careerNarrativeMd ?? ''}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-0 z-10 -mx-1 flex justify-end border-t bg-background/95 px-1 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save profile'}
        </Button>
      </div>
    </form>
  )
}

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
  name: string
}

function Field({ label, name, ...rest }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...rest} />
    </div>
  )
}
