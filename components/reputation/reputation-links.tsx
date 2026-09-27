import { ExternalLink } from 'lucide-react'
import type { DeepLinkGroup } from '@/lib/reputation/deep-links'

/** Sites lee must not fetch: one-click searches the user opens themselves. */
export function ReputationLinks({ groups }: { groups: DeepLinkGroup[] }) {
  return (
    <div className="space-y-2">
      {groups.map((g) => (
        <div key={g.id}>
          <div className="mb-1 text-xs font-medium text-muted-foreground">{g.label}</div>
          <div className="flex flex-wrap gap-2">
            {g.links.map((l) => (
              <a
                key={l.id}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors hover:bg-accent"
              >
                {l.label} <ExternalLink className="size-3" />
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
