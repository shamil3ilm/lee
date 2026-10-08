import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MarkdownText } from '@/components/markdown-text'
import { PhoneFold } from './phone-fold'

interface ParsedMeta {
  seniority?: string | null
  tech_stack?: string[] | null
  responsibilities?: string[] | null
  requirements?: string[] | null
}

function asParsedMeta(v: unknown): ParsedMeta {
  if (typeof v !== 'object' || v === null) return {}
  return v as ParsedMeta
}

function asBenefits(v: unknown): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) return {}
  return v as Record<string, unknown>
}

function formatBenefit(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (v === null || v === undefined) return '—'
  if (typeof v === 'string' || typeof v === 'number') return String(v)
  return JSON.stringify(v)
}

function MetaList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <ul className="list-inside list-disc space-y-1 text-sm">
        {items.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </div>
  )
}

interface JobOverviewCardsProps {
  descriptionMd: string | null
  parsedMeta: unknown
  benefits: unknown
}

/**
 * Application detail › Overview: the job description, parsed details and
 * benefits. Secondary reading, so each folds to one line on phones.
 */
export function JobOverviewCards({ descriptionMd, parsedMeta, benefits }: JobOverviewCardsProps) {
  const meta = asParsedMeta(parsedMeta)
  const perks = asBenefits(benefits)
  const hasDetails = Boolean(meta.responsibilities?.length || meta.requirements?.length || meta.tech_stack?.length)
  return (
    <>
      {descriptionMd ? (
        <PhoneFold label="Job description">
          <Card>
            <CardHeader>
              <CardTitle>Job description</CardTitle>
            </CardHeader>
            <CardContent>
              <MarkdownText source={descriptionMd} />
            </CardContent>
          </Card>
        </PhoneFold>
      ) : null}

      {hasDetails ? (
        <PhoneFold label="Details">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {meta.requirements && meta.requirements.length > 0 ? <MetaList label="Requirements" items={meta.requirements} /> : null}
              {meta.responsibilities && meta.responsibilities.length > 0 ? (
                <MetaList label="Responsibilities" items={meta.responsibilities} />
              ) : null}
              {meta.tech_stack && meta.tech_stack.length > 0 ? (
                <div>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tech stack</div>
                  <div className="flex flex-wrap gap-1.5">
                    {meta.tech_stack.map((t) => (
                      <Badge key={t} variant="secondary" className="text-xs">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </PhoneFold>
      ) : null}

      {Object.keys(perks).length > 0 ? (
        <PhoneFold label="Benefits">
          <Card>
            <CardHeader>
              <CardTitle>Benefits</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {Object.entries(perks).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between border-b pb-2">
                    <dt className="capitalize text-muted-foreground">{k.replace(/_/g, ' ')}</dt>
                    <dd className="font-medium">{formatBenefit(v)}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </PhoneFold>
      ) : null}
    </>
  )
}
