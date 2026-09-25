import Link from 'next/link'
import { ArrowRight, Beaker, GraduationCap, Swords, type LucideIcon } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * v17 §0 — the Playground hub. One place for everything hands-on: practice,
 * model comparison and decision-engine experiments. Replaces the old `/learn`
 * placeholder and the standalone `/lab` Model Lab.
 */

interface PlaygroundSection {
  key: string
  title: string
  description: string
  icon: LucideIcon
  href?: string
  cta?: string
}

const SECTIONS: readonly PlaygroundSection[] = [
  {
    key: 'practice',
    title: 'Practice',
    description:
      'Adaptive interview practice is on the way: exercises that adjust to your level, realistic simulations and boss battles, with spaced-repetition review so skills stick.',
    icon: GraduationCap,
  },
  {
    key: 'models',
    title: 'Models',
    description:
      'Run one prompt against several free open-source models side by side, compare speed and quality, and keep a blind-vote leaderboard.',
    icon: Swords,
    href: '/playground/models',
    cta: 'Open Model Playground',
  },
  {
    key: 'decisions',
    title: 'Decisions',
    description:
      'Try classification, yes/no and score prompts against each decision provider and compare latency, confidence and disagreement.',
    icon: Beaker,
    href: '/playground/decisions',
    cta: 'Open Decisions',
  },
]

function SectionCard({ section }: { section: PlaygroundSection }) {
  const Icon = section.icon
  return (
    <Card className="flex flex-col">
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon className="size-4 text-muted-foreground" aria-hidden />
            {section.title}
          </CardTitle>
          {section.href ? null : <Badge variant="neutral">Coming soon</Badge>}
        </div>
        <CardDescription>{section.description}</CardDescription>
      </CardHeader>
      <CardContent className="mt-auto">
        {section.href ? (
          <Link
            href={section.href}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {section.cta} <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        ) : (
          <p className="text-xs text-muted-foreground">Nothing to set up. It will appear here when ready.</p>
        )}
      </CardContent>
    </Card>
  )
}

export default function PlaygroundPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Playground"
        description="Hands-on space to practise, compare AI models and tune the decision engine."
      />
      <div className="grid gap-4 md:grid-cols-3">
        {SECTIONS.map((s) => (
          <SectionCard key={s.key} section={s} />
        ))}
      </div>
    </div>
  )
}
