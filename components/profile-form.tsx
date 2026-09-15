'use client'
import { useTransition } from 'react'
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

interface ProfileFormProps {
  profile: UserProfile | null
}

const REMOTE_OPTIONS = ['any', 'remote', 'hybrid', 'onsite'] as const

const ARRAY_FIELDS = [
  ['skills', 'Skills'],
  ['industries', 'Industries'],
  ['roleTypes', 'Role types'],
  ['employmentTypes', 'Employment types'],
  ['willingToRelocateTo', 'Willing to relocate to (ISO-2)'],
  ['mustHaves', 'Must-haves'],
  ['dealbreakers', 'Dealbreakers'],
  ['keywords', 'Keywords'],
] as const

const JSON_FIELDS = [
  ['stackWeights', 'Stack weights'],
  ['companySizeWeights', 'Company size weights'],
  ['benefitPrefs', 'Benefit prefs'],
  ['locationPrefs', 'Location prefs (array)'],
] as const

function arr(v: string[] | null | undefined): string {
  return (v ?? []).join(', ')
}

function json(v: unknown): string {
  return JSON.stringify(v ?? null, null, 2)
}

export function ProfileForm({ profile }: ProfileFormProps) {
  const [pending, start] = useTransition()

  function handleSubmit(fd: FormData): void {
    start(async () => {
      const result = await saveProfileAction(fd)
      if ('success' in result) toast.success('Profile saved')
      else toast.error(result.error)
    })
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <Tabs defaultValue="basics">
        <TabsList>
          <TabsTrigger value="basics">Basics</TabsTrigger>
          <TabsTrigger value="skills">Skills</TabsTrigger>
          <TabsTrigger value="location">Location</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="narrative">Narrative</TabsTrigger>
        </TabsList>

        <TabsContent value="basics">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Headline" name="headline" defaultValue={profile?.headline ?? ''} />
                <Field
                  label="Seniority"
                  name="seniority"
                  defaultValue={profile?.seniority ?? ''}
                  placeholder="senior, staff, principal…"
                />
                <Field
                  label="Years experience"
                  name="yearsExperience"
                  type="number"
                  min={0}
                  defaultValue={profile?.yearsExperience ?? ''}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="remotePref">Remote preference</Label>
                  <Select name="remotePref" defaultValue={profile?.remotePref ?? 'any'}>
                    <SelectTrigger id="remotePref">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REMOTE_OPTIONS.map((o) => (
                        <SelectItem key={o} value={o} className="capitalize">
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Field
                  label="Comp floor (annual)"
                  name="compFloorAnnual"
                  type="number"
                  min={0}
                  defaultValue={profile?.compFloorAnnual ?? ''}
                />
                <Field
                  label="Comp currency (ISO-3)"
                  name="compCurrency"
                  defaultValue={profile?.compCurrency ?? ''}
                  placeholder="USD, AED…"
                  maxLength={3}
                />
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
              {ARRAY_FIELDS.slice(0, 4).map(([field, label]) => (
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

        <TabsContent value="location">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  name="acceptRelocation"
                  type="checkbox"
                  defaultChecked={profile?.acceptRelocation ?? false}
                  className="size-4 rounded border-input"
                />
                Accept relocation
              </label>
              <Field
                label="Willing to relocate to (ISO-2, comma separated)"
                name="willingToRelocateTo"
                defaultValue={arr(profile?.willingToRelocateTo ?? null)}
                placeholder="AE, US, DE"
              />
              <div className="space-y-1.5">
                <Label htmlFor="locationPrefs">Location prefs (JSON array)</Label>
                <Textarea
                  id="locationPrefs"
                  name="locationPrefs"
                  rows={4}
                  defaultValue={json(profile?.locationPrefs)}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  {`Format: [{ "country": "AE", "priority": 1 }, ...]`}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences">
          <Card>
            <CardContent className="space-y-4 pt-6">
              {ARRAY_FIELDS.slice(4).map(([field, label]) => (
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

      <div className="flex justify-end">
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
