'use client'
import { useState } from 'react'
import { Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { referralDraft } from '@/lib/integrations/linkedin/referral-draft'
import type { ReferralHint } from '@/lib/integrations/linkedin/connections'
import { CopyButton } from './copy-button'

interface ReferralHintCardProps {
  hint: ReferralHint
  role: string | null
  myName: string | null
}

/** The hint plus an editable referral-ask draft the user copies and sends themselves. */
export function ReferralHintCard({ hint, role, myName }: ReferralHintCardProps) {
  const [open, setOpen] = useState(false)
  const [person, setPerson] = useState(hint.people[0]?.name ?? '')
  const [text, setText] = useState(() => referralDraft({ personName: person, company: hint.company, role, myName }))
  const names = hint.people.map((p) => p.name)
  const more = hint.count - names.length

  return (
    <div className="space-y-2 rounded-md border border-info/30 bg-info-soft p-3 text-sm" data-testid="referral-hint">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2">
          <Users className="size-4 shrink-0 text-info" aria-hidden="true" />
          <span>
            You know {hint.count} {hint.count === 1 ? 'person' : 'people'} at {hint.company}: {names.join(', ')}
            {more > 0 ? ` and ${more} more` : ''}.
          </span>
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Hide draft' : 'Draft a referral ask'}
        </Button>
      </div>
      {open ? (
        <div className="space-y-2">
          {hint.people.length > 1 ? (
            <div className="space-y-1">
              <Label htmlFor="referral-person">To</Label>
              <NativeSelect
                id="referral-person"
                value={person}
                onChange={(e) => {
                  setPerson(e.target.value)
                  setText(referralDraft({ personName: e.target.value, company: hint.company, role, myName }))
                }}
              >
                {hint.people.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                    {p.position ? ` · ${p.position}` : ''}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : null}
          <Label htmlFor="referral-text" className="sr-only">
            Referral message
          </Label>
          <Textarea id="referral-text" rows={7} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            <CopyButton text={text} label="Copy message" />
            <span className="text-xs text-muted-foreground">Send it yourself on LinkedIn; lee never messages anyone.</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
