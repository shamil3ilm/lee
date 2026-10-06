import { masterCvSchema, type MasterCV } from '@/lib/documents/types'
import type { RenderedResume } from './render'

/**
 * Plain-text résumé for portal forms (paste into "Experience" boxes): no
 * markup, one heading per section, "- " bullets, wrapped by the portal.
 */
export function toPlainText(r: RenderedResume): string {
  const out: string[] = [r.name.toUpperCase(), r.headline, r.contact.map((c) => c.value).join(' | '), '']
  for (const s of r.sections) {
    out.push(s.label.toUpperCase())
    for (const line of s.lines) out.push(line)
    for (const e of s.entries) {
      const head = [e.title, e.subtitle].filter(Boolean).join(' — ')
      const meta = [e.location, e.dates].filter(Boolean).join(' | ')
      out.push(meta ? `${head} (${meta})` : head)
      if (e.keywords.length > 0) out.push(`Stack: ${e.keywords.join(', ')}`)
      for (const b of e.bullets) out.push(`- ${b.text}`)
      out.push('')
    }
    if (s.entries.length === 0) out.push('')
  }
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`
}

/** Text of design/domain-only bullets: tailoring must keep them framed that way. */
export function domainOnlyBullets(r: RenderedResume): string[] {
  return r.sections.flatMap((s) => s.entries.flatMap((e) => e.bullets.filter((b) => b.mode === 'domain').map((b) => b.text)))
}

/**
 * The rendered variant as a MasterCV — the starting point for per-job
 * tailoring and for "Score this variant". Only what the variant shows.
 */
export function variantToMasterCv(r: RenderedResume): MasterCV {
  const contact = (field: string, label?: string) =>
    r.contact.find((c) => c.field === field && (label === undefined || c.label.toLowerCase() === label))?.value
  const section = (key: string) => r.sections.find((s) => s.key === key)
  const split = (d: string): { start: string; end: string } => {
    const [a = '', b = ''] = d.split(' – ')
    return { start: a || 'unknown', end: !b || b === 'Present' ? 'present' : b }
  }
  return masterCvSchema.parse({
    basics: {
      name: r.name,
      headline: r.headline,
      email: contact('email'),
      phone: contact('phone'),
      location: contact('location'),
      linkedin: contact('profile', 'linkedin'),
      github: contact('profile', 'github'),
      website: contact('url'),
    },
    summary: section('summary')?.lines.join(' ') ?? '',
    experience: (section('work')?.entries ?? []).map((e) => ({
      company: e.subtitle,
      role: e.title,
      location: e.location || undefined,
      ...split(e.dates),
      bullets: e.bullets.map((b) => b.text),
    })),
    projects: (section('projects')?.entries ?? []).map((e) => ({
      name: e.title,
      description: e.subtitle,
      tech: e.keywords.length > 0 ? e.keywords : undefined,
      highlights: e.bullets.map((b) => b.text),
    })),
    education: (section('education')?.lines ?? []).map((line) => {
      const [degree = line, school = line] = line.split(' · ')
      return { school, degree }
    }),
    skills: { primary: (section('skills')?.lines[0] ?? '').split(', ').filter(Boolean) },
    certifications: (section('certificates')?.lines ?? []).map((line) => {
      const [name = line, issuer] = line.split(' · ')
      return { name, issuer: issuer || name }
    }),
    languages: (section('languages')?.lines ?? []).map((line) => {
      const [name = line, proficiency = 'Professional'] = line.split(' — ')
      return { name, proficiency }
    }),
  })
}
