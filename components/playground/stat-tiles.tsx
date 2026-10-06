import Link from 'next/link'
import { Award, Flame, Layers, Sparkles, type LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface Tile {
  key: string
  label: string
  value: string
  hint: string
  icon: LucideIcon
  href?: string
}

function TileCard({ tile }: { tile: Tile }) {
  const Icon = tile.icon
  const body = (
    <CardContent className="space-y-1 p-4">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
        {tile.label}
      </p>
      <p className="text-xl font-semibold tabular-nums" data-testid={`stat-${tile.key}`}>
        {tile.value}
      </p>
      <p className="break-words text-xs text-muted-foreground">{tile.hint}</p>
    </CardContent>
  )
  return (
    <Card className="min-w-0">
      {tile.href ? (
        <Link href={tile.href} className="block rounded-xl hover:bg-accent/40">
          {body}
        </Link>
      ) : (
        body
      )}
    </Card>
  )
}

interface StatTilesProps {
  rankLabel: string
  nextRank: string | null
  xp: number
  streak: number
  bestStreak: number
  dueReviews: number
}

/** Rank, XP, streak and due reviews. */
export function StatTiles({ rankLabel, nextRank, xp, streak, bestStreak, dueReviews }: StatTilesProps) {
  const tiles: Tile[] = [
    { key: 'rank', label: 'Rank', value: rankLabel, hint: nextRank ?? 'Top rank reached.', icon: Award },
    { key: 'xp', label: 'XP', value: xp.toLocaleString('en-US'), hint: 'From practice and reviews.', icon: Sparkles },
    { key: 'streak', label: 'Streak', value: `${streak} day${streak === 1 ? '' : 's'}`, hint: `Best: ${bestStreak}.`, icon: Flame },
    {
      key: 'reviews',
      label: 'Due reviews',
      value: String(dueReviews),
      hint: dueReviews > 0 ? 'Concept cards to recall.' : 'Nothing due right now.',
      icon: Layers,
      href: '/playground/review',
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 @3xl/main:grid-cols-4">
      {tiles.map((t) => (
        <TileCard key={t.key} tile={t} />
      ))}
    </div>
  )
}
