import * as companiesQ from '@/lib/db/queries/localCompanies'
import * as sourcesQ from '@/lib/db/queries/sources'
import * as companyQ from '@/lib/db/queries/companies'
import * as jobsQ from '@/lib/db/queries/jobs'
import * as applicationsQ from '@/lib/db/queries/applications'
import * as activitiesQ from '@/lib/db/queries/activities'
import { BOARD_LABELS, boardSource, type BoardKind } from '@/lib/companies/ats-detect'
import { enqueueSourcePollNow } from '@/lib/queue/scheduler'
import type { CompanyEvidence, DismissReason } from './types'

/**
 * SERVER-ONLY. The Companies tab's actions on one company row. Each is
 * user-scoped and idempotent where it can be (a second "Watch jobs" reuses
 * the source the first created).
 */

export class CompanyActionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CompanyActionError'
  }
}

function nameOf(row: companiesQ.CompanyRow): string {
  return String((row.normalized as { name?: unknown } | null)?.name ?? 'Company')
}

async function load(userId: string, id: string): Promise<companiesQ.CompanyRow> {
  const row = await companiesQ.getCompany(userId, id)
  if (!row) throw new CompanyActionError('Company not found.')
  return row
}

/** "Watch jobs": add (or reuse) a source for the company's job board and poll it now. */
export async function watchJobs(userId: string, id: string): Promise<{ sourceId: string; created: boolean }> {
  const row = await load(userId, id)
  const kind = row.atsKind as BoardKind | null
  const src = kind && row.atsSlug ? boardSource({ kind, slug: row.atsSlug, url: row.careersUrl ?? '', watchable: true }) : null
  if (!src || !(kind && kind in BOARD_LABELS)) throw new CompanyActionError('No supported job board was found for this company.')
  const same = (await sourcesQ.list(userId)).find(
    (s) => s.kind === src.kind && JSON.stringify(Object.entries(src.config)) === JSON.stringify(Object.entries(s.config as object).filter(([k]) => k in src.config)),
  )
  const source =
    same ??
    (await sourcesQ.create(userId, {
      name: `${nameOf(row)} (${BOARD_LABELS[kind]})`.slice(0, 120),
      kind: src.kind,
      config: { ...src.config, companyDiscoveryId: row.id },
      enabled: true,
    }))
  if (!source.enabled) await sourcesQ.update(userId, source.id, { enabled: true })
  await companiesQ.patchCompany(userId, row.id, { watch: 'jobs', watchSourceId: source.id, status: 'saved' })
  await enqueueSourcePollNow(userId, source.id)
  return { sourceId: source.id, created: !same }
}

/**
 * "Watch careers page": a weekly "check yourself" link in Settings ›
 * Sources (never fetched by the watch source). When robots.txt allowed lee
 * to read the page at enrichment, its text hash is also compared weekly and
 * a change adds a to-do.
 */
export async function watchCareers(userId: string, id: string): Promise<{ sourceId: string; changeDetection: boolean }> {
  const row = await load(userId, id)
  const url = row.careersUrl ?? row.website
  if (!url) throw new CompanyActionError('This company has no website to watch yet.')
  const existing = (await sourcesQ.list(userId)).find((s) => s.kind === 'watch' && (s.config as { url?: unknown }).url === url)
  const blocked = row.enrichStatus === 'blocked'
  const source =
    existing ??
    (await sourcesQ.create(userId, {
      name: `${nameOf(row)} careers`.slice(0, 120),
      kind: 'watch',
      config: {
        url,
        reason: blocked ? 'Its robots.txt does not allow lee to read the page. Check weekly.' : 'No job board found. Check weekly.',
        cadence: 'weekly',
        companyDiscoveryId: row.id,
      },
      enabled: false,
    }))
  await companiesQ.patchCompany(userId, row.id, { watch: 'careers', watchSourceId: source.id, status: 'saved' })
  return { sourceId: source.id, changeDetection: !!row.careersHash && !blocked }
}

export async function saveCompany(userId: string, id: string): Promise<void> {
  await load(userId, id)
  await companiesQ.patchCompany(userId, id, { status: 'saved' })
}

export async function dismissCompany(userId: string, id: string, reason: DismissReason | null): Promise<void> {
  await load(userId, id)
  await companiesQ.patchCompany(userId, id, { status: 'dismissed', dismissReason: reason, enrichStatus: null })
}

export async function restoreCompany(userId: string, id: string): Promise<void> {
  const row = await load(userId, id)
  if (row.status !== 'dismissed') return
  await companiesQ.patchCompany(userId, id, { status: 'new', dismissReason: null })
}

/**
 * Track a speculative approach as an application (status "speculative",
 * applied now) so the follow-up cadence reminds the user. The job is a
 * placeholder for the company ("Speculative application"); lee sends
 * nothing.
 */
export async function trackSpeculative(
  userId: string,
  id: string,
  input: { channel: 'email' | 'linkedin'; to: string | null },
  now: Date = new Date(),
): Promise<{ applicationId: string }> {
  const row = await load(userId, id)
  if (row.applicationId) return { applicationId: row.applicationId }
  const name = nameOf(row)
  const company = row.domain
    ? await companyQ.findOrCreateByDomain(userId, row.domain, name)
    : await companyQ.createWithoutDomain(userId, name)
  const ev = (row.evidence ?? {}) as CompanyEvidence
  const job = await jobsQ.upsertBySourceUrl(userId, company.id, {
    title: 'Speculative application',
    sourceUrl: row.careersUrl ?? row.website ?? `https://lee.invalid/speculative/${row.id}`,
    location: null,
    descriptionMd: ev.description ? `${name}: ${ev.description}` : `${name} (no open role; speculative approach)`,
  })
  const app = await applicationsQ.create(userId, { jobId: job.id, status: 'speculative', source: 'speculative', appliedAt: now })
  await activitiesQ.log(userId, app.id, 'note', {
    text: `Speculative ${input.channel === 'email' ? 'email' : 'LinkedIn message'} sent${input.to ? ` to ${input.to}` : ''} (drafted in lee, sent by you).`,
  })
  await companiesQ.patchCompany(userId, row.id, { applicationId: app.id, status: 'saved' })
  return { applicationId: app.id }
}
