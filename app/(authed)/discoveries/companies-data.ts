import * as companiesQ from '@/lib/db/queries/localCompanies'
import { BOARD_LABELS, type BoardKind } from '@/lib/companies/ats-detect'
import { INDUSTRY_LABELS, isIndustry } from '@/lib/company-discovery/industry'
import { deepestRegions } from '@/lib/company-discovery/normalize'
import type { FitChip } from '@/lib/company-discovery/fit'
import { STAGE_LABELS, type CompanyEvidence, type CompanyStage } from '@/lib/company-discovery/types'
import { placeName } from '@/lib/regions/display'
import { parseRegionParam } from '@/lib/regions/selection'
import type { CompanyCardData, CompanyGrowthCard } from '@/components/companies/types'
import { GROWTH_LABELS, MIN_GROWTH_STEPS, type GrowthSignal } from '@/lib/company-discovery/growth/types'

/** Discovery › Companies query string, validated. */
export interface CompanyParams {
  status: 'new' | 'saved' | 'dismissed'
  region: string[]
  industry: string
  stage: string
  hiring: boolean
  warm: boolean
  source: string
  /** 'fit' (default) | 'growth'. */
  sort: 'fit' | 'growth'
  /** Minimum growth score; 0 = any. */
  minGrowth: number
  /** "Under the radar" only. */
  gems: boolean
  page: number
  size: number
}

const SOURCE_TAG = /^(wikidata|github|yc|linkedin|paste|jobs|seed|search|directory:[a-z0-9-]{1,40})$/

export function parseCompanyParams(sp: Record<string, string | undefined>, size: number): CompanyParams {
  const status = sp.status === 'saved' || sp.status === 'dismissed' ? sp.status : 'new'
  const page = Math.max(1, Math.min(10_000, Number.parseInt(sp.page ?? '', 10) || 1))
  return {
    status,
    region: parseRegionParam(sp.region),
    industry: isIndustry(sp.industry) ? sp.industry : '',
    stage: sp.stage && sp.stage in STAGE_LABELS ? sp.stage : '',
    hiring: sp.hiring === '1',
    warm: sp.warm === '1',
    source: sp.source && SOURCE_TAG.test(sp.source) ? sp.source : '',
    sort: sp.sort === 'growth' ? 'growth' : 'fit',
    minGrowth: (MIN_GROWTH_STEPS as readonly number[]).includes(Number(sp.minGrowth)) ? Number(sp.minGrowth) : 0,
    gems: sp.gems === '1',
    page,
    size,
  }
}

function toCard(row: companiesQ.CompanyRow): CompanyCardData {
  const n = (row.normalized ?? {}) as { name?: unknown }
  const ev = (row.evidence ?? {}) as CompanyEvidence
  const deepest = deepestRegions(row.regionIds)
  const board = row.atsKind as BoardKind | null
  return {
    id: row.id,
    name: typeof n.name === 'string' ? n.name : 'Company',
    website: row.website,
    domain: row.domain,
    logoUrl: ev.logoUrl?.startsWith('https://') ? ev.logoUrl : null,
    regionLabel: deepest[0] ? placeName(deepest[0]) : null,
    industries: row.industry.filter(isIndustry).map((i) => INDUSTRY_LABELS[i]),
    sizeBand: row.sizeBand,
    stage: row.stage && row.stage in STAGE_LABELS ? STAGE_LABELS[row.stage as CompanyStage] : null,
    description: ev.description ?? null,
    fitScore: row.fitScore,
    chips: Array.isArray(row.fitDetail) ? (row.fitDetail as FitChip[]) : [],
    boardLabel: board && board in BOARD_LABELS ? BOARD_LABELS[board] : null,
    watchable: !!board && ['greenhouse', 'lever', 'ashby', 'workable', 'recruitee', 'pinpoint', 'workday', 'teamtailor'].includes(board),
    careersUrl: row.careersUrl,
    openRoles: typeof ev.openRoles === 'number' ? ev.openRoles : null,
    connections: ev.connections ?? 0,
    emails: ev.contactEmails ?? [],
    status: row.status,
    watch: row.watch,
    sourceTags: row.sourceTags,
    listedAt: ev.listedAt ?? null,
    enrichStatus: row.enrichStatus,
    careersNote: ev.careersNote ?? null,
    dismissReason: row.dismissReason,
    tracked: !!row.applicationId,
    githubLogin: ev.githubLogin ?? null,
    growth: toGrowthView(row),
    hiddenGem: row.hiddenGem,
    radarReasons: radarReasons(row.growthDetail),
  }
}

function toGrowthView(row: companiesQ.CompanyRow): CompanyGrowthCard {
  const detail = (row.growthDetail ?? {}) as { signals?: unknown }
  const signals = Array.isArray(detail.signals) ? (detail.signals as GrowthSignal[]).filter((s) => s && typeof s.kind === 'string' && s.kind in GROWTH_LABELS) : []
  const conf = row.growthConfidence === 'high' || row.growthConfidence === 'medium' || row.growthConfidence === 'low' ? row.growthConfidence : null
  return { score: row.growthScore, confidence: conf, signals }
}

function radarReasons(detail: unknown): string[] {
  const r = (detail as { radar?: unknown } | null)?.radar
  return Array.isArray(r) ? r.filter((x): x is string => typeof x === 'string').slice(0, 5) : []
}

export async function loadCompanyCards(userId: string, p: CompanyParams): Promise<{ cards: CompanyCardData[]; total: number; facets: { sources: string[]; industries: string[] } }> {
  const opts = {
    status: p.status,
    // Rows store every ancestor (Dubai → ae, gcc), so the selection itself is enough.
    regionIds: p.region.length > 0 ? p.region : undefined,
    industry: p.industry || undefined,
    stage: p.stage || undefined,
    hiring: p.hiring,
    warm: p.warm,
    sourceTag: p.source || undefined,
    minGrowth: p.minGrowth || undefined,
    gems: p.gems,
  }
  const [rows, total, facets] = await Promise.all([
    companiesQ.listCompanies(userId, { ...opts, sort: p.sort, limit: p.size, offset: (p.page - 1) * p.size }),
    companiesQ.countCompanies(userId, opts),
    companiesQ.facets(userId),
  ])
  return { cards: rows.map(toCard), total, facets }
}
