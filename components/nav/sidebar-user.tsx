import Image from 'next/image'

interface SidebarUserProps {
  email: string
  name?: string | null
  image?: string | null
}

function initials(email: string, name?: string | null): string {
  const base = name?.trim() || email
  const parts = base.split(/[\s@.]+/).filter(Boolean)
  const first = parts[0]?.[0] ?? '?'
  const second = parts[1]?.[0] ?? ''
  return (first + second).toUpperCase()
}

export function SidebarUser({ email, name, image }: SidebarUserProps) {
  return (
    <div
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm group-data-[sidebar=rail]/shell:justify-center group-data-[sidebar=rail]/shell:px-0"
      title={email}
    >
      {image ? (
        <Image
          src={image}
          alt=""
          width={28}
          height={28}
          className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-border"
          unoptimized
        />
      ) : (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-medium text-secondary-foreground">
          {initials(email, name)}
        </span>
      )}
      <div className="min-w-0 flex-1 group-data-[sidebar=rail]/shell:hidden">
        {name ? <div className="truncate text-xs font-medium">{name}</div> : null}
        <div className="truncate text-xs text-muted-foreground">{email}</div>
      </div>
    </div>
  )
}
