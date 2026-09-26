import { Users } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import * as contactsQ from '@/lib/db/queries/contacts'
import * as companiesQ from '@/lib/db/queries/companies'
import { AddContactDialog } from '@/components/add-contact-dialog'
import { ContactActions } from '@/components/contact-actions'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

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

export default async function ContactsPage() {
  const userId = await requireUserId()
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
        actions={<AddContactDialog companies={companyOptions} />}
      />

      {contacts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <Users className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No contacts yet.</p>
          <AddContactDialog companies={companyOptions} />
        </div>
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
                          <div className="font-medium">{c.name}</div>
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
