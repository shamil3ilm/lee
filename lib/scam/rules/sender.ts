import {
  MESSAGING_HOSTS,
  URL_SHORTENERS,
  detectLookalike,
  isFreemail,
  isJobPlatform,
  isSameSite,
} from '../domains'
import type { EvidenceSpan } from '../types'
import { fired, type ObservedHost, type Rule, type RuleContext } from './types'

function isNeutralHost(h: ObservedHost): boolean {
  return (
    isFreemail(h.host) ||
    isJobPlatform(h.host) ||
    MESSAGING_HOSTS.has(h.host) ||
    URL_SHORTENERS.has(h.host)
  )
}

/** Hosts that might impersonate the company: links and emails not on a neutral platform. */
function candidateHosts(ctx: RuleContext): ObservedHost[] {
  return ctx.hosts.filter((h) => !isNeutralHost(h))
}

function lookalikes(ctx: RuleContext): Array<{ host: ObservedHost; kind: string }> {
  if (ctx.legitDomains.length === 0) return []
  const out: Array<{ host: ObservedHost; kind: string }> = []
  for (const h of candidateHosts(ctx)) {
    const hit = detectLookalike(h.host, ctx.legitDomains)
    if (!hit) continue
    // A TLD-only difference from a domain the posting itself supplied is a
    // plain mismatch (acme.io vs acme.com); for a famous brand it is spoofing.
    if (hit.kind === 'tld_swap' && !ctx.knownCompany) continue
    out.push({ host: h, kind: hit.kind })
  }
  return out
}

function withCompany(ctx: RuleContext, spans: EvidenceSpan[]): EvidenceSpan[] {
  return ctx.companySpan ? [...spans, ctx.companySpan] : spans
}

export const senderRules: readonly Rule[] = [
  {
    id: 'sender.freemail_recruiter',
    group: 'sender',
    weight: 15,
    label: 'Recruiter uses a free-mail address (Gmail, Outlook…)',
    detect(ctx) {
      if (!ctx.companySpan) return null
      const free = ctx.hosts.filter((h) => h.via === 'email' && isFreemail(h.host)).map((h) => h.span)
      if (free.length === 0) return null
      return ctx.knownCompany
        ? fired(withCompany(ctx, free.slice(0, 2)), {
            weight: 40,
            label: 'Free-mail recruiter claiming to hire for a well-known company',
          })
        : fired(free.slice(0, 2))
    },
  },
  {
    id: 'sender.lookalike_domain',
    group: 'sender',
    weight: 45,
    label: 'Lookalike of the company’s real domain (typo, homoglyph or brand-in-name)',
    detect: (ctx) => fired(lookalikes(ctx).map((l) => l.host.span).slice(0, 3)),
  },
  {
    id: 'sender.apply_domain_mismatch',
    group: 'sender',
    weight: 15,
    label: 'Apply link / email domain does not match the company',
    detect(ctx) {
      if (ctx.legitDomains.length === 0) return null
      const flagged = new Set(lookalikes(ctx).map((l) => l.host.host))
      const spans = candidateHosts(ctx)
        .filter((h) => h.field === 'applyUrl' || h.field === 'applyEmail')
        .filter((h) => !flagged.has(h.host))
        .filter((h) => !ctx.legitDomains.some((d) => isSameSite(h.host, d)))
        .map((h) => h.span)
      if (spans.length === 0) return null
      return ctx.knownCompany ? fired(withCompany(ctx, spans), { weight: 25 }) : fired(spans)
    },
  },
  {
    id: 'sender.url_shortener',
    group: 'sender',
    weight: 15,
    label: 'Apply link hidden behind a URL shortener',
    detect: (ctx) =>
      fired(ctx.hosts.filter((h) => h.via === 'link' && URL_SHORTENERS.has(h.host)).map((h) => h.span).slice(0, 2)),
  },
]
