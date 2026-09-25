import Link from 'next/link'
import { requireUserId } from '@/lib/auth/require-session'
import { getMasterCV } from '@/lib/documents/master'
import { TEMPLATES } from '@/lib/latex/templates'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LatexTemplatePicker } from '@/components/latex-template-picker'

export const dynamic = 'force-dynamic'

export default async function NewLatexDocumentPage() {
  const userId = await requireUserId()
  const master = await getMasterCV(userId)
  const hasMaster = master !== null

  return (
    <div className="space-y-6">
      <PageHeader
        title="New LaTeX document"
        description="Pick a template to seed a fresh LaTeX CV. You can edit the source in the Overleaf-like editor after creating it."
      />

      {!hasMaster ? (
        <Card>
          <CardHeader>
            <CardTitle>Tip: save your master CV first</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Templates will pre-fill your name, experience, and skills once you have a
            master CV saved. Go to{' '}
            <Link href="/settings/cv" className="text-primary hover:underline">
              Settings → CV
            </Link>{' '}
            to add one. You can still pick a template with placeholder content.
          </CardContent>
        </Card>
      ) : null}

      <LatexTemplatePicker
        templates={TEMPLATES.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
        }))}
        hasMaster={hasMaster}
      />
    </div>
  )
}
