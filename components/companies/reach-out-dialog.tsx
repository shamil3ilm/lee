'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Copy, Mail, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { draftCompanyReachOut, trackCompanySpeculative, type ReachOutResult } from '@/app/(authed)/discoveries/company-actions'

type Plan = Exclude<ReachOutResult, { error: string }>

/**
 * "Reach out": a short speculative note built only from your CV and the
 * company's public facts (fact-locked), with who to contact — one of your
 * own LinkedIn connections, or a careers@ address the company publishes.
 * You copy or open it in your mail app and send it yourself; then lee
 * tracks it as a speculative application with follow-up reminders.
 */
export function ReachOutDialog({ companyId, companyName, tracked }: { companyId: string; companyName: string; tracked: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [pending, start] = useTransition()

  const load = (channel: 'email' | 'linkedin' | null): void => {
    start(async () => {
      const r = await draftCompanyReachOut(companyId, channel)
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      setPlan(r)
      setSubject(r.draft.subject ?? '')
      setBody(r.draft.body)
    })
  }

  const onOpenChange = (next: boolean): void => {
    setOpen(next)
    if (next && !plan) load(null)
  }

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(plan?.draft.channel === 'email' && subject ? `${subject}\n\n${body}` : body)
      toast.success('Copied')
    } catch {
      toast.error('Could not copy. Select the text and copy it instead.')
    }
  }

  const track = (): void => {
    if (!plan) return
    start(async () => {
      const r = await trackCompanySpeculative(companyId, plan.draft.channel, plan.draft.to)
      if ('error' in r) toast.error(r.error)
      else {
        toast.success(r.message ?? 'Tracked')
        setOpen(false)
        router.refresh()
      }
    })
  }

  const mailto =
    plan?.draft.channel === 'email'
      ? `mailto:${encodeURIComponent(plan.draft.to ?? '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" data-testid="reach-out">
          <Send className="size-4" aria-hidden="true" />
          Reach out
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Reach out to {companyName}</DialogTitle>
          <DialogDescription>
            A short speculative note from your CV and the company’s public facts only. Edit it, then send it yourself; lee never sends anything.
          </DialogDescription>
        </DialogHeader>
        {!plan ? (
          <p className="text-sm text-muted-foreground" role="status">
            {pending ? 'Drafting…' : 'No draft yet.'}
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Channel">
              <Button size="sm" variant={plan.draft.channel === 'email' ? 'default' : 'outline'} aria-pressed={plan.draft.channel === 'email'} disabled={pending} onClick={() => load('email')}>
                Email
              </Button>
              <Button size="sm" variant={plan.draft.channel === 'linkedin' ? 'default' : 'outline'} aria-pressed={plan.draft.channel === 'linkedin'} disabled={pending} onClick={() => load('linkedin')}>
                LinkedIn message
              </Button>
            </div>
            <div className="rounded-lg border bg-muted/40 p-3 text-sm" data-testid="reach-out-contact">
              <p className="font-medium">Who to contact</p>
              {plan.people.length > 0 ? (
                <ul className="mt-1 list-disc pl-5">
                  {plan.people.map((p) => (
                    <li key={`${p.name}-${p.position}`}>
                      {p.name}
                      {p.position ? ` · ${p.position}` : ''} <span className="text-muted-foreground">(your connection: ask for a referral)</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {plan.emails.length > 0 ? (
                <p className="mt-1">
                  Published on the company’s site: {plan.emails.join(', ')}
                </p>
              ) : null}
              {plan.people.length === 0 && plan.emails.length === 0 ? (
                <p className="mt-1 text-muted-foreground">
                  No connection or published careers address found. Use the contact form on the company’s site; lee does not look up or guess personal emails.
                </p>
              ) : null}
            </div>
            {plan.draft.channel === 'email' ? (
              <div className="space-y-1.5">
                <Label htmlFor={`ro-subject-${companyId}`}>Subject</Label>
                <Input id={`ro-subject-${companyId}`} value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor={`ro-body-${companyId}`}>Message</Label>
              <Textarea id={`ro-body-${companyId}`} value={body} onChange={(e) => setBody(e.target.value)} rows={10} data-testid="reach-out-body" />
              <p className="text-xs text-muted-foreground">
                {plan.draft.origin === 'ai' ? 'AI draft, checked against your facts.' : 'Built from your facts.'}
                {plan.variantName ? ` Résumé to attach: ${plan.variantName}.` : ''}
                {plan.draft.rejected && plan.draft.rejected.length > 0 ? ' The AI version added facts you did not give, so lee used the safe template.' : ''}
              </p>
            </div>
          </div>
        )}
        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={copy} disabled={!plan}>
              <Copy className="size-4" aria-hidden="true" />
              Copy
            </Button>
            {mailto ? (
              <Button asChild variant="outline" size="sm">
                <a href={mailto}>
                  <Mail className="size-4" aria-hidden="true" />
                  Open in mail app
                </a>
              </Button>
            ) : null}
          </div>
          <Button type="button" size="sm" onClick={track} disabled={!plan || pending || tracked} data-testid="reach-out-track">
            {tracked ? 'Already tracked' : 'I sent it: track it'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
