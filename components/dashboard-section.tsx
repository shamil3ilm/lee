interface DashboardSectionProps {
  title: string
  children: React.ReactNode
}

export function DashboardSection({ title, children }: DashboardSectionProps) {
  const id = `dash-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <section aria-labelledby={id} className="space-y-3 pt-2">
      <h2
        id={id}
        className="text-sm font-semibold uppercase tracking-wider text-muted-foreground"
      >
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  )
}
