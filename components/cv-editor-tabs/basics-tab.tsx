'use client'
import type { MasterCV } from '@/lib/documents/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'

interface BasicsTabProps {
  cv: MasterCV
  setCv: (cv: MasterCV) => void
}

const FIELDS: ReadonlyArray<{
  key: keyof MasterCV['basics']
  label: string
  placeholder?: string
}> = [
  { key: 'name', label: 'Full name', placeholder: 'Ada Lovelace' },
  { key: 'headline', label: 'Headline', placeholder: 'Staff Software Engineer' },
  { key: 'email', label: 'Email', placeholder: 'ada@example.com' },
  { key: 'phone', label: 'Phone', placeholder: '+971 50 000 0000' },
  { key: 'location', label: 'Location', placeholder: 'Dubai, UAE' },
  { key: 'linkedin', label: 'LinkedIn', placeholder: 'linkedin.com/in/…' },
  { key: 'github', label: 'GitHub', placeholder: 'github.com/…' },
  { key: 'website', label: 'Website', placeholder: 'https://…' },
]

export function BasicsTab({ cv, setCv }: BasicsTabProps) {
  function updateBasics(key: keyof MasterCV['basics'], value: string): void {
    setCv({
      ...cv,
      basics: {
        ...cv.basics,
        [key]: value,
      },
    })
  }
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`basics-${f.key}`}>{f.label}</Label>
              <Input
                id={`basics-${f.key}`}
                value={cv.basics[f.key] ?? ''}
                placeholder={f.placeholder}
                onChange={(e) => updateBasics(f.key, e.target.value)}
              />
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="summary">Summary</Label>
          <Textarea
            id="summary"
            rows={5}
            value={cv.summary ?? ''}
            placeholder="A short professional summary…"
            onChange={(e) => setCv({ ...cv, summary: e.target.value })}
          />
        </div>
      </CardContent>
    </Card>
  )
}
