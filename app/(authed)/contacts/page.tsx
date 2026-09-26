import { Users } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import * as contactsQ from '@/lib/db/queries/contacts'
import * as companiesQ from '@/lib/db/queries/companies'
import { AddContactDialog } from '@/components/add-contact-dialog'
import { ContactActions } from '@/components/contact-actions'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BoardViewToggle } from '@/components/board/view-toggle'
import { ContactsBoard, type ContactBoardItem } from '@/components/contacts-board'
import { parseBoardView } from '@/lib/board/view'
import { CONTACT_STAGE_LABELS, CONTACT_STAGE_TONE, contactStageOf } from '@/lib/contacts/pipeline'

export const dynamic = 'force-dynamic'

interface CompanyOption {
  id: string
  name: string
}

interface ContactRow {
  id: string
  name: string
  role: string | null
  email: string | null
  phone: string | null
  linkedinUrl: string | null
  notes: string | null
  companyId: string | null
  pipelineStage: string | null
}

function groupByCompany(
  contacts: ContactRow[],
  companies: CompanyOption[],
): { key: string; label: string; rows: ContactRow[] }[] {
  const byId = new Map<string, string>()
  for (const c of companies) byId.set(c.id, c.name)
  const groups = new Map<string, { key: string; label: string; rows: ContactRow[] }>()
  const NONE = '__none__'
  for (const c of contacts) {
    const key = c.companyId ?? NONE
    const label = c.companyId ? byId.get(c.companyId) ?? '(unknown company)' : 'No company'
    if (!groups.has(key)) groups.set(key, { key, label, rows: [] })
    groups.get(key)!.rows.push(c)
  }
  return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label))
}

interface ContactsPageProps {
  searchParams: Promise<{ view?: string | string[] }>
}

/** Same rows as the list, with company names resolved (no extra query). */
function toBoardItems(
  contacts: Array<contactsQ.Contact>,
  companies: CompanyOption[],
): ContactBoardItem[] {
  const byId = new Map(companies.map((c) => [c.id, c.name] as const))
  return contacts.map((c) => ({
    id: c.id,
    version: c.updatedAt.toISOString(),
    name: c.name,
    role: c.role,
    email: c.email,
    linkedinUrl: c.linkedinUrl,
    companyName: c.companyId ? (byId.get(c.companyId) ?? null) : null,
    stage: contactStageOf(c.pipelineStage),
  }))
}

export default async function ContactsPage({ searchParams }: ContactsPageProps) {
  const userId = await requireUserId()
  const { view, explicit } = parseBoardView((await searchParams).view, 'list')
  const [contacts, companyNames] = await Promise.all([
    contactsQ.list(userId),
    companiesQ.listNames(userId),
  ])
  // Every company (watched or not) is both a group label and a pick in the
  // add/edit forms — a contact at an unwatched company must stay editable
  // without losing its company (v17 §9.1 visual QA).
  const companyOptions: CompanyOption[] = [...companyNames].sort((a, b) =>
    a.name.localeCompare(b.name),
  )
  const groups = groupByCompany(contacts, companyNames)

  return (
    <div>
      <PageHeader
        title="Contacts"
        description={`${contacts.length} in your rolodex`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <BoardViewToggle
              page="contacts"
              current={view}
              defaultView="list"
              explicit={explicit}
              boardHref="/contacts?view=board"
              listHref="/contacts?view=list"
            />
            <AddContactDialog companies={companyOptions} />
          </div>
        }
      />

      {view === 'board' ? (
        <ContactsBoard contacts={toBoardItems(contacts, companyNames)} />
      ) : contacts.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No contacts yet."
          description="Add recruiters, referrers and interviewers to keep your network in one place."
          action={<AddContactDialog companies={companyOptions} />}
        />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key}>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-sm font-semibold">{g.label}</h2>
                <Badge variant="secondary">{g.rows.length}</Badge>
              </div>
              <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                {g.rows.map((c) => (
                  <li key={c.id}>
                    <Card>
                      <CardContent className="flex items-start gap-2 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{c.name}</span>
                            {c.pipelineStage ? (
                              <Badge variant={CONTACT_STAGE_TONE[contactStageOf(c.pipelineStage)]} className="text-[10px]">
                                {CONTACT_STAGE_LABELS[contactStageOf(c.pipelineStage)]}
                              </Badge>
                            ) : null}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {c.role ?? 'No role'}
                            {c.email ? (
                              <>
                                {' · '}
                                <a className="hover:underline" href={`mailto:${c.email}`}>
                                  {c.email}
                                </a>
                              </>
                            ) : null}
                          </div>
                        </div>
                        <ContactActions
                          contact={{
                            id: c.id,
                            name: c.name,
                            role: c.role,
                            email: c.email,
                            phone: c.phone,
                            linkedinUrl: c.linkedinUrl,
                            companyId: c.companyId,
                            notes: c.notes,
                          }}
                          companies={companyOptions}
                        />
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
