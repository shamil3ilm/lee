'use client'
import { Plus, Trash2 } from 'lucide-react'
import type { MasterCV } from '@/lib/documents/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type Certification = NonNullable<MasterCV['certifications']>[number]
type Language = NonNullable<MasterCV['languages']>[number]

interface SkillsTabProps {
  cv: MasterCV
  setCv: (cv: MasterCV) => void
}

function csvToArr(v: string): string[] {
  return v
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

export function SkillsTab({ cv, setCv }: SkillsTabProps) {
  const certifications = cv.certifications ?? []
  const languages = cv.languages ?? []

  function updateCertification(index: number, patch: Partial<Certification>): void {
    const next = certifications.map((it, i) => (i === index ? { ...it, ...patch } : it))
    setCv({ ...cv, certifications: next })
  }

  function removeCertification(index: number): void {
    const next = certifications.filter((_, i) => i !== index)
    setCv({ ...cv, certifications: next.length ? next : undefined })
  }

  function addCertification(): void {
    setCv({
      ...cv,
      certifications: [...certifications, { name: '', issuer: '', date: '', url: '' }],
    })
  }

  function updateLanguage(index: number, patch: Partial<Language>): void {
    const next = languages.map((it, i) => (i === index ? { ...it, ...patch } : it))
    setCv({ ...cv, languages: next })
  }

  function removeLanguage(index: number): void {
    const next = languages.filter((_, i) => i !== index)
    setCv({ ...cv, languages: next.length ? next : undefined })
  }

  function addLanguage(): void {
    setCv({
      ...cv,
      languages: [...languages, { name: '', proficiency: 'Fluent' }],
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-1.5">
            <Label htmlFor="skills-primary">Primary skills (comma separated)</Label>
            <Textarea
              id="skills-primary"
              rows={3}
              value={cv.skills.primary.join(', ')}
              onChange={(e) =>
                setCv({
                  ...cv,
                  skills: { ...cv.skills, primary: csvToArr(e.target.value) },
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              Ordered — strongest signals first. These get the ATS-friendly bold section.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="skills-secondary">Secondary skills (comma separated)</Label>
            <Textarea
              id="skills-secondary"
              rows={3}
              value={(cv.skills.secondary ?? []).join(', ')}
              onChange={(e) => {
                const arr = csvToArr(e.target.value)
                setCv({
                  ...cv,
                  skills: {
                    ...cv.skills,
                    secondary: arr.length ? arr : undefined,
                  },
                })
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex items-center justify-between">
            <Label>Certifications</Label>
            <Button type="button" variant="ghost" size="sm" onClick={addCertification}>
              <Plus className="size-4" />
              Add
            </Button>
          </div>
          {certifications.length === 0 ? (
            <p className="text-xs text-muted-foreground">No certifications.</p>
          ) : (
            certifications.map((c, i) => (
              <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-4">
                <Input
                  placeholder="Name"
                  value={c.name}
                  onChange={(e) => updateCertification(i, { name: e.target.value })}
                />
                <Input
                  placeholder="Issuer"
                  value={c.issuer}
                  onChange={(e) => updateCertification(i, { issuer: e.target.value })}
                />
                <Input
                  placeholder="Date"
                  value={c.date ?? ''}
                  onChange={(e) => updateCertification(i, { date: e.target.value })}
                />
                <div className="flex items-center gap-1">
                  <Input
                    placeholder="URL"
                    value={c.url ?? ''}
                    onChange={(e) => updateCertification(i, { url: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeCertification(i)}
                    aria-label="Delete"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex items-center justify-between">
            <Label>Languages</Label>
            <Button type="button" variant="ghost" size="sm" onClick={addLanguage}>
              <Plus className="size-4" />
              Add
            </Button>
          </div>
          {languages.length === 0 ? (
            <p className="text-xs text-muted-foreground">No languages.</p>
          ) : (
            languages.map((l, i) => (
              <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_auto]">
                <Input
                  placeholder="Language"
                  value={l.name}
                  onChange={(e) => updateLanguage(i, { name: e.target.value })}
                />
                <Input
                  placeholder="Proficiency"
                  value={l.proficiency}
                  onChange={(e) => updateLanguage(i, { proficiency: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeLanguage(i)}
                  aria-label="Delete"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
