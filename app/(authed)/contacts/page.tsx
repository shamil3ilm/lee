import { auth } from '@/lib/auth'
import * as contactsQ from '@/lib/db/queries/contacts'
import * as companiesQ from '@/lib/db/queries/companies'
import { addContact } from './actions'

export const dynamic = 'force-dynamic'

interface CompanyOption {
  id: string
  name: string
}

function groupByCompany(
  contacts: { id: string; name: string; role: string | null; email: string | null; companyId: string | null }[],
  companies: CompanyOption[],
): { key: string; label: string; rows: typeof contacts }[] {
  const byId = new Map<string, string>()
  for (const c of companies) byId.set(c.id, c.name)
  const groups = new Map<string, { key: string; label: string; rows: typeof contacts }>()
  const NONE = '__none__'
  for (const c of contacts) {
    const key = c.companyId ?? NONE
    const label = c.companyId ? byId.get(c.companyId) ?? '(unknown company)' : '(no company)'
    if (!groups.has(key)) groups.set(key, { key, label, rows: [] })
    groups.get(key)!.rows.push(c)
  }
  return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label))
}

export default async function ContactsPage() {
  const session = await auth()
  const userId = session!.user!.id
  const [contacts, companies] = await Promise.all([
    contactsQ.list(userId),
    companiesQ.listWatched(userId),
  ])
  const companyOptions: CompanyOption[] = companies.map((c) => ({ id: c.id, name: c.name }))
  const groups = groupByCompany(contacts, companyOptions)

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold">Contacts</h1>

      <form action={addContact} className="grid gap-2 rounded border p-4 md:grid-cols-2">
        <h2 className="col-span-full font-medium">Add contact</h2>
        <input name="name" placeholder="Name" required className="rounded border px-2 py-1" />
        <input name="role" placeholder="Role" className="rounded border px-2 py-1" />
        <input name="email" type="email" placeholder="Email" className="rounded border px-2 py-1" />
        <input name="phone" placeholder="Phone" className="rounded border px-2 py-1" />
        <input
          name="linkedinUrl"
          type="url"
          placeholder="LinkedIn URL"
          className="rounded border px-2 py-1"
        />
        <select name="companyId" className="rounded border px-2 py-1">
          <option value="">(no company)</option>
          {companyOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <textarea
          name="notes"
          rows={2}
          placeholder="Notes"
          className="col-span-full rounded border px-2 py-1"
        />
        <button className="col-span-full rounded bg-black px-3 py-2 text-white" type="submit">
          Add contact
        </button>
      </form>

      {groups.length === 0 ? (
        <p className="text-neutral-500">No contacts yet.</p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.key}>
              <h2 className="mb-2 font-medium">{g.label}</h2>
              <ul className="space-y-1 text-sm">
                {g.rows.map((c) => (
                  <li key={c.id} className="rounded border p-2">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-neutral-500">
                      {c.role ?? '—'} · {c.email ?? '—'}
                    </div>
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
