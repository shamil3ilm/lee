'use client'
import { useState, useTransition } from 'react'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { saveResumeAction } from '@/app/(authed)/settings/profile/resume/actions'
import { Button } from '@/components/ui/button'
import type { ResumeProfile } from '@/lib/resume/types'
import { BasicsCard } from './basics-card'
import { CertificatesCard, EducationCard, LanguagesCard } from './other-cards'
import { PortfolioCard } from './portfolio-card'
import { ProjectsCard } from './projects-card'
import { SkillsCard } from './skills-card'
import { WorkCard } from './work-card'

interface ResumeEditorProps {
  initial: ResumeProfile
  stored: boolean
}

/**
 * Settings › Profile › Résumé: the master profile, lee's one source of
 * résumé facts. One Save writes the whole profile (validated and
 * fact-locked on the server) and refreshes the derived master CV.
 */
export function ResumeEditor({ initial, stored }: ResumeEditorProps) {
  const [profile, setProfile] = useState<ResumeProfile>(initial)
  const [dirty, setDirty] = useState(!stored)
  const [problems, setProblems] = useState<string[]>([])
  const [pending, start] = useTransition()

  const update = <K extends keyof ResumeProfile>(key: K, value: ResumeProfile[K]): void => {
    setProfile((p) => ({ ...p, [key]: value }))
    setDirty(true)
  }

  const save = (): void =>
    start(async () => {
      const r = await saveResumeAction(profile)
      if ('error' in r) {
        setProblems(r.problems ?? [r.error])
        toast.error(r.error)
        return
      }
      setProblems([])
      setProfile(r.profile)
      setDirty(false)
      toast.success(r.snapshot ? 'Profile saved — master CV updated' : 'Profile saved')
    })

  const saveBar = (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {dirty ? <span className="text-xs text-muted-foreground">Unsaved changes</span> : null}
      <Button type="button" onClick={save} disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Save />}
        Save profile
      </Button>
    </div>
  )

  return (
    <div className="space-y-6">
      {!stored ? (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          Started from your settings. Review it and save to create your master profile.
        </p>
      ) : null}
      {saveBar}
      {problems.length > 0 ? (
        <ul role="alert" className="list-disc space-y-1 rounded-md border border-destructive/40 p-3 pl-7 text-sm text-destructive">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
      <BasicsCard value={profile.basics} onChange={(v) => update('basics', v)} />
      <WorkCard value={profile.work} onChange={(v) => update('work', v)} />
      <ProjectsCard value={profile.projects} onChange={(v) => update('projects', v)} />
      <SkillsCard value={profile.skills} onChange={(v) => update('skills', v)} />
      <EducationCard value={profile.education} onChange={(v) => update('education', v)} />
      <LanguagesCard value={profile.languages} onChange={(v) => update('languages', v)} />
      <CertificatesCard value={profile.certificates} onChange={(v) => update('certificates', v)} />
      <PortfolioCard value={profile.portfolio} work={profile.work} onChange={(v) => update('portfolio', v)} />
      {saveBar}
    </div>
  )
}
