'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Download, Loader2, Save } from 'lucide-react'
import type { MasterCV } from '@/lib/documents/types'
import { saveMasterCvAction } from '@/app/(authed)/settings/cv/actions'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BasicsTab } from '@/components/cv-editor-tabs/basics-tab'
import { ExperienceTab } from '@/components/cv-editor-tabs/experience-tab'
import { ProjectsTab } from '@/components/cv-editor-tabs/projects-tab'
import { EducationTab } from '@/components/cv-editor-tabs/education-tab'
import { SkillsTab } from '@/components/cv-editor-tabs/skills-tab'
import { ImportTab } from '@/components/cv-editor-tabs/import-tab'

interface CvEditorProps {
  initialCv: MasterCV
  documentId: string | null
}

export function CvEditor({ initialCv, documentId }: CvEditorProps) {
  const router = useRouter()
  const [cv, setCv] = useState<MasterCV>(initialCv)
  const [savedDocumentId, setSavedDocumentId] = useState<string | null>(documentId)
  const [pending, startTransition] = useTransition()

  function handleSave(cvToSave: MasterCV): Promise<void> {
    return new Promise((resolve) => {
      startTransition(async () => {
        const result = await saveMasterCvAction(cvToSave)
        if ('success' in result) {
          setSavedDocumentId(result.documentId)
          toast.success('Master CV saved')
          router.refresh()
        } else {
          toast.error(result.error)
        }
        resolve()
      })
    })
  }

  function openPdf(): void {
    if (!savedDocumentId) return
    window.open(`/api/documents/${savedDocumentId}/pdf`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Master CV
        </h2>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={openPdf}
            disabled={!savedDocumentId}
          >
            <Download className="size-4" />
            Preview PDF
          </Button>
          <Button
            type="button"
            onClick={() => {
              void handleSave(cv)
            }}
            disabled={pending}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {pending ? 'Saving…' : 'Save master CV'}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        {/*
          6 tabs on a 390px viewport would overflow. Wrap the TabsList in a
          horizontal scroller so it stays a single row without pushing the
          page wider than the viewport.
        */}
        <div className="-mx-1 overflow-x-auto px-1">
          <TabsList className="w-max">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="experience">Experience</TabsTrigger>
            <TabsTrigger value="projects">Projects</TabsTrigger>
            <TabsTrigger value="education">Education</TabsTrigger>
            <TabsTrigger value="skills">Skills</TabsTrigger>
            <TabsTrigger value="import">Import</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview">
          <BasicsTab cv={cv} setCv={setCv} />
        </TabsContent>
        <TabsContent value="experience">
          <ExperienceTab cv={cv} setCv={setCv} />
        </TabsContent>
        <TabsContent value="projects">
          <ProjectsTab cv={cv} setCv={setCv} />
        </TabsContent>
        <TabsContent value="education">
          <EducationTab cv={cv} setCv={setCv} />
        </TabsContent>
        <TabsContent value="skills">
          <SkillsTab cv={cv} setCv={setCv} />
        </TabsContent>
        <TabsContent value="import">
          <ImportTab cv={cv} setCv={setCv} onMergeAndSave={handleSave} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
