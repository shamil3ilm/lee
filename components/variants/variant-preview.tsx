import { AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { RenderedResume } from '@/lib/variants/render'

/** The résumé as it will print (structure, not typography), plus every warning. */
export function VariantPreview({ rendered, lengthTarget }: { rendered: RenderedResume; lengthTarget: 1 | 2 }) {
  return (
    <Card data-testid="variant-preview">
      <CardHeader>
        <CardTitle>Preview</CardTitle>
        <CardDescription>
          About {rendered.estimatedPages} page(s) · target {lengthTarget}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rendered.warnings.length > 0 ? (
          <ul aria-label="Warnings" className="space-y-1 rounded-md border border-warning/40 bg-warning-soft p-3 text-xs text-warning">
            {rendered.warnings.map((w, i) => (
              <li key={i} className="flex gap-1.5">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 break-words">{w.message}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <article className="space-y-3 rounded-md border bg-card p-4 text-sm">
          <header className="text-center">
            <h2 className="break-words text-lg font-semibold">{rendered.name}</h2>
            <p className="text-muted-foreground">{rendered.headline}</p>
            <p className="mt-1 break-words text-xs text-muted-foreground">{rendered.contact.map((c) => (c.field === 'profile' || c.field === 'email' || c.field === 'url' ? c.value : `${c.label}: ${c.value}`)).join(' · ')}</p>
          </header>
          {rendered.sections.map((s) => (
            <section key={s.key} className="space-y-1.5">
              <h3 className="border-b text-xs font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</h3>
              {s.lines.map((l, i) => (
                <p key={i} className="break-words">{l}</p>
              ))}
              {s.entries.map((e) => (
                <div key={e.id}>
                  <div className="flex flex-wrap justify-between gap-x-2">
                    <span className="font-medium">
                      {e.title}
                      {e.subtitle ? <span className="font-normal text-muted-foreground"> — {e.subtitle}</span> : null}
                    </span>
                    <span className="text-xs text-muted-foreground">{[e.location, e.dates].filter(Boolean).join(' · ')}</span>
                  </div>
                  {e.keywords.length > 0 ? <p className="text-xs italic text-muted-foreground">{e.keywords.join(', ')}</p> : null}
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    {e.bullets.map((b, i) => (
                      <li key={i} className="break-words">{b.text}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </article>
      </CardContent>
    </Card>
  )
}
