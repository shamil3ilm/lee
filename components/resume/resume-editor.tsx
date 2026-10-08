'use client'
import { useState, useTransition } from 'react'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { saveResumeAction } from '@/app/(authed)/settings/resume/actions'
import { Button } from '@/components/ui/button'
import type { ResumeProfile } from '@/lib/resume/types'
import { BasicsCard } from './basics-card'
import { CertificatesCard, EducationCard, LanguagesCard } from './other-cards'
import { PortfolioCard } from './portfolio-card'
import { ProjectsCard } from './projects-card'
import { SkillsCard } from './skills-card'
import { WorkCard } from './work-card'
import { SECTION_ANCHOR } from '@/components/section-nav'

interface ResumeEditorProps {
  initial: ResumeProfile
  stored: boolean
}

/**
 * Settings › Résumé: the master profile, lee's one source of
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

  // One Save for the whole profile, stuck to the bottom of the viewport
  // while the (long) editor is on screen.
  const saveBar = (
    <div
      data-testid="resume-save-bar"
      className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-end gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
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
      {problems.length > 0 ? (
        <ul role="alert" className="list-disc space-y-1 rounded-md border border-destructive/40 p-3 pl-7 text-sm text-destructive">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
      <div id="resume-basics" className={SECTION_ANCHOR}>
        <BasicsCard value={profile.basics} onChange={(v) => update('basics', v)} />
      </div>
      <div id="resume-work" className={SECTION_ANCHOR}>
        <WorkCard value={profile.work} onChange={(v) => update('work', v)} />
      </div>
      <div id="resume-projects" className={SECTION_ANCHOR}>
        <ProjectsCard value={profile.projects} onChange={(v) => update('projects', v)} />
      </div>
      <div id="resume-skills" className={SECTION_ANCHOR}>
        <SkillsCard value={profile.skills} onChange={(v) => update('skills', v)} />
      </div>
      <div id="resume-education" className={`${SECTION_ANCHOR} space-y-6`}>
        <EducationCard value={profile.education} onChange={(v) => update('education', v)} />
        <LanguagesCard value={profile.languages} onChange={(v) => update('languages', v)} />
        <CertificatesCard value={profile.certificates} onChange={(v) => update('certificates', v)} />
      </div>
      <div id="resume-portfolio" className={SECTION_ANCHOR}>
        <PortfolioCard value={profile.portfolio} work={profile.work} onChange={(v) => update('portfolio', v)} />
      </div>
      {saveBar}
    </div>
  )
}
