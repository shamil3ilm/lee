import { findKnownCompany, hostOf } from './domains'
import type { ObservedHost, RuleContext } from './rules/types'
import type { EvidenceSpan, ScamFields } from './types'

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi
const URL_RE = /\bhttps?:\/\/[^\s)<>"'\]]+/gi
const BARE_LINK_RE =
  /\b(?:t\.me|telegram\.me|wa\.me|chat\.whatsapp\.com|bit\.ly|tinyurl\.com|cutt\.ly|rb\.gy|forms\.gle)\/[^\s)<>"']+/gi

/** Span of `host` inside `ref`, else the whole reference (IDN/punycode). */
function hostSpan(field: ObservedHost['field'], ref: EvidenceSpan, host: string): EvidenceSpan {
  const idx = ref.text.toLowerCase().indexOf(host)
  if (idx < 0) return { ...ref, field }
  return { field, start: ref.start + idx, text: ref.text.slice(idx, idx + host.length) }
}

function observe(
  field: ObservedHost['field'],
  via: ObservedHost['via'],
  ref: EvidenceSpan,
): ObservedHost | null {
  const host = hostOf(ref.text.replace(/^mailto:/i, ''))
  if (!host) return null
  return { field, host, via, span: hostSpan(field, ref, host) }
}

function wholeField(fields: ScamFields, field: ObservedHost['field']): EvidenceSpan | null {
  const text = fields[field]
  const trimmed = text.trim()
  if (!trimmed) return null
  return { field, start: text.indexOf(trimmed), text: trimmed }
}

function scan(fields: ScamFields, field: ObservedHost['field'], re: RegExp, via: ObservedHost['via']): ObservedHost[] {
  const out: ObservedHost[] = []
  for (const m of fields[field].matchAll(re)) {
    const o = observe(field, via, { field, start: m.index ?? 0, text: m[0] })
    if (o) out.push(o)
  }
  return out
}

export function collectHosts(fields: ScamFields): ObservedHost[] {
  const hosts: ObservedHost[] = []
  const url = wholeField(fields, 'url')
  if (url) {
    const o = observe('url', 'link', url)
    if (o) hosts.push(o)
  }
  const apply = wholeField(fields, 'applyUrl')
  if (apply) {
    const isMail = /^mailto:/i.test(apply.text) || (!apply.text.includes('://') && apply.text.includes('@'))
    const o = observe('applyUrl', isMail ? 'email' : 'link', apply)
    if (o) hosts.push(o)
  }
  const email = wholeField(fields, 'applyEmail')
  if (email) {
    const o = observe('applyEmail', 'email', email)
    if (o) hosts.push(o)
  }
  hosts.push(...scan(fields, 'description', EMAIL_RE, 'email'))
  hosts.push(...scan(fields, 'description', URL_RE, 'link'))
  hosts.push(...scan(fields, 'description', BARE_LINK_RE, 'link'))
  // De-duplicate by field + host so one address is judged once per field.
  const seen = new Set<string>()
  return hosts.filter((h) => {
    const key = `${h.field}|${h.host}|${h.via}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function buildContext(fields: ScamFields): RuleContext {
  const known = fields.company ? findKnownCompany(fields.company) : null
  const inputDomain = hostOf(fields.companyDomain)
  const legitDomains = [...new Set([...(inputDomain ? [inputDomain] : []), ...(known?.domains ?? [])])]
  const companyTrim = fields.company.trim()
  const companySpan: EvidenceSpan | null = companyTrim
    ? { field: 'company', start: fields.company.indexOf(companyTrim), text: companyTrim }
    : null
  return {
    fields,
    legitDomains,
    knownCompany: known !== null,
    companySpan,
    hosts: collectHosts(fields),
  }
}
