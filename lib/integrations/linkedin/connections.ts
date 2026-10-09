import * as linkedinQ from '@/lib/db/queries/linkedin'
import { companyKey } from './company-key'
import type { LinkedInConnectionRow } from './export/parse'

/**
 * SERVER-ONLY. LinkedIn connections (from the export) and the referral
 * hints built on them. Stored compactly and privately per user: name,
 * company, position, connected-on — and an email only when the export has
 * one AND the user ticked "Keep email addresses".
 */

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[A-Za-z]{2,}$/

export function toConnectionInputs(rows: readonly LinkedInConnectionRow[], includeEmails: boolean): linkedinQ.ConnectionInput[] {
  const byKey = new Map<string, linkedinQ.ConnectionInput>()
  for (const r of rows) {
    const name = `${r.firstName} ${r.lastName}`.replace(/\s+/g, ' ').trim().slice(0, 200)
    if (!name) continue
    const company = r.company.trim().slice(0, 200)
    const input: linkedinQ.ConnectionInput = {
      name,
      company,
      companyKey: companyKey(company),
      position: r.position.trim().slice(0, 200),
      connectedOn: /^\d{4}-\d{2}-\d{2}$/.test(r.connectedOn) ? r.connectedOn : null,
      email: includeEmails && EMAIL.test(r.email) ? r.email : null,
    }
    byKey.set(`${input.name}\u0000${input.companyKey}`, input)
  }
  return [...byKey.values()]
}

export async function importConnections(
  userId: string,
  rows: readonly LinkedInConnectionRow[],
  includeEmails: boolean,
  importBatchId: string | null = null,
): Promise<number> {
  return linkedinQ.upsertConnections(userId, toConnectionInputs(rows, includeEmails), importBatchId)
}

export interface ReferralHint {
  company: string
  count: number
  people: Array<{ name: string; position: string }>
}

/** "You know 2 people at Careem": the user's connections at this company, or null. */
export async function referralHint(userId: string, company: string | null | undefined): Promise<ReferralHint | null> {
  const key = company ? companyKey(company) : ''
  if (!key) return null
  const { count, rows } = await linkedinQ.byCompanyMatch(userId, key, 5)
  if (count === 0) return null
  return { company: company!.trim(), count, people: rows.map((p) => ({ name: p.name, position: p.position })) }
}
