'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { GitCommit, GitPullRequest, Lock, RefreshCw, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { LocalTime } from '@/components/local-time'
import {
  applyRepoSuggestionAction,
  linkRepoAction,
  refreshGitHubReposAction,
  setFollowDepsAction,
} from '@/app/(authed)/settings/resume/github-actions'
import { buildRepoSuggestion, reviewHint, reviewHintText } from '@/lib/integrations/github/evidence'
import type { ProjectItem } from '@/lib/resume/types'
import { RadarFollowSuggestions } from './radar-follow-suggestions'

export interface RepoRow {
  fullName: string
  htmlUrl: string
  isPrivate: boolean
  description: string | null
  topics: string[]
  languages: Array<{ name: string; share: number }>
  stars: number
  lastCommitAt: string | null
  userCommits: number
  userPrs: number
  linkedProjectId: string | null
  followDeps: boolean
}

interface GitHubEvidencePanelProps {
  connected: boolean
  repos: RepoRow[]
  projects: ProjectItem[]
}

/**
 * Settings › Résumé › From GitHub: repo evidence next to the readiness
 * flags. Linking a repo never changes a flag; it can only suggest a review.
 */
export function GitHubEvidencePanel({ connected, repos, projects }: GitHubEvidencePanelProps) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, success?: string): void => {
    start(async () => {
      const r = await fn()
      if (!r.ok) toast.error(r.error)
      else if (success) toast.success(success)
      router.refresh()
    })
  }

  return (
    <Card id="resume-github" className="scroll-mt-28">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">From GitHub</CardTitle>
        {connected ? (
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(refreshGitHubReposAction, 'Refreshed from GitHub.')}>
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Refresh
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!connected ? (
          <p className="text-muted-foreground">
            <Link href="/settings/integrations#github" className="underline">
              Connect GitHub
            </Link>{' '}
            to see your repositories (private ones only if you granted them), your commit and PR counts, and link them to projects as evidence.
          </p>
        ) : repos.length === 0 ? (
          <p className="text-muted-foreground">No repositories cached yet. Click Refresh.</p>
        ) : (
          <ul className="space-y-3" data-testid="github-repo-list">
            {repos.map((r) => (
              <RepoItem key={r.fullName} repo={r} projects={projects} pending={pending} run={run} />
            ))}
          </ul>
        )}
        {connected ? <RadarFollowSuggestions /> : null}
      </CardContent>
    </Card>
  )
}

interface RepoItemProps {
  repo: RepoRow
  projects: ProjectItem[]
  pending: boolean
  run: (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, success?: string) => void
}

function RepoItem({ repo, projects, pending, run }: RepoItemProps) {
  const project = projects.find((p) => p.id === repo.linkedProjectId) ?? null
  const hint = project ? reviewHintText(reviewHint(project, repo)) : null
  const suggestion = project ? buildRepoSuggestion(project, repo) : null
  const [takeDescription, setTakeDescription] = useState(true)
  const [takeUrl, setTakeUrl] = useState(true)
  const [keywords, setKeywords] = useState<string[]>(suggestion?.keywords ?? [])
  const hasSuggestion = suggestion !== null && (suggestion.description !== null || suggestion.keywords.length > 0 || suggestion.url !== null)
  const selectId = `link-${repo.fullName.replace(/[^a-z0-9]/gi, '-')}`

  return (
    <li className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <a href={repo.htmlUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 font-medium underline-offset-2 hover:underline">
          {repo.isPrivate ? <Lock className="size-3.5 text-muted-foreground" aria-label="Private" /> : null}
          {repo.fullName}
        </a>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1" title="Your commits">
            <GitCommit className="size-3.5" aria-hidden="true" /> {repo.userCommits.toLocaleString('en-US')} commits
          </span>
          <span className="inline-flex items-center gap-1" title="Your pull requests">
            <GitPullRequest className="size-3.5" aria-hidden="true" /> {repo.userPrs} PRs
          </span>
          <span className="inline-flex items-center gap-1">
            <Star className="size-3.5" aria-hidden="true" /> {repo.stars}
          </span>
          {repo.lastCommitAt ? (
            <span>
              last commit <LocalTime date={repo.lastCommitAt} format="date-year" />
            </span>
          ) : null}
        </div>
      </div>
      {repo.languages.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {repo.languages.map((l) => (
            <Badge key={l.name} variant="outline" className="text-[10px]">
              {l.name} {Math.round(l.share * 100)}%
            </Badge>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1 space-y-1">
          <Label htmlFor={selectId} className="text-xs">
            Evidence for project
          </Label>
          <NativeSelect
            id={selectId}
            value={repo.linkedProjectId ?? ''}
            disabled={pending}
            onChange={(e) => run(() => linkRepoAction(repo.fullName, e.target.value || null))}
          >
            <option value="">Not linked</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Checkbox
          checked={repo.followDeps}
          disabled={pending}
          onChange={(e) => {
            const on = e.currentTarget.checked
            run(() => setFollowDepsAction(repo.fullName, on))
          }}
          label={<span className="text-xs">Follow its dependencies in Radar</span>}
        />
      </div>
      {project ? (
        <p className="text-xs text-muted-foreground">
          Readiness stays yours: {project.interviewReady ? 'marked interview-ready' : 'not marked interview-ready'}.
          {hint ? <span className="mt-1 block text-warning">{hint}</span> : null}
        </p>
      ) : null}
      {project && suggestion && hasSuggestion ? (
        <div className="space-y-2 rounded-md bg-muted/40 p-2 text-xs" data-testid="repo-suggestion">
          <div className="font-medium">Suggested for “{project.name}” (nothing changes until you apply)</div>
          {suggestion.description ? (
            <Checkbox checked={takeDescription} onChange={(e) => setTakeDescription(e.currentTarget.checked)} label={`Description: ${suggestion.description}`} />
          ) : null}
          {suggestion.url ? <Checkbox checked={takeUrl} onChange={(e) => setTakeUrl(e.currentTarget.checked)} label={`Link: ${suggestion.url}`} /> : null}
          {suggestion.keywords.map((k) => (
            <Checkbox
              key={k}
              checked={keywords.includes(k)}
              onChange={(e) => {
                const on = e.currentTarget.checked
                setKeywords((cur) => (on ? [...cur, k] : cur.filter((x) => x !== k)))
              }}
              label={`Keyword: ${k}`}
            />
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(
                () => applyRepoSuggestionAction(repo.fullName, { description: takeDescription, keywords, url: takeUrl }),
                `Updated “${project.name}”.`,
              )
            }
          >
            Apply to project
          </Button>
        </div>
      ) : null}
    </li>
  )
}
