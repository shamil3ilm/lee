import type { ReactNode } from 'react'

interface ConnectionIdentityProps {
  name: string
  detail?: ReactNode
  avatarUrl: string | null
  badge?: ReactNode
}

/** Avatar + name row shared by the GitHub and LinkedIn cards. */
export function ConnectionIdentity({ name, detail, avatarUrl, badge }: ConnectionIdentityProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
      <div className="flex min-w-0 items-center gap-3">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- provider avatar; no optimisation or remote config wanted
          <img src={avatarUrl} alt="" width={36} height={36} referrerPolicy="no-referrer" className="size-9 shrink-0 rounded-full border" />
        ) : (
          <div aria-hidden="true" className="size-9 shrink-0 rounded-full border bg-muted" />
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{name}</div>
          {detail ? <div className="truncate text-xs text-muted-foreground">{detail}</div> : null}
        </div>
      </div>
      {badge}
    </div>
  )
}
