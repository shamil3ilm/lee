/**
 * Decides whether `pnpm db:migrate` should run and against which URL.
 *
 * - On Vercel, only production deployments migrate. Preview builds skip so an
 *   unmerged branch can never change the production schema, and a preview
 *   with no database configured still builds.
 * - Migrations prefer the direct (unpooled) connection: poolers in
 *   transaction mode are meant for app traffic, not schema changes.
 */

export interface MigrationEnv {
  VERCEL?: string
  VERCEL_ENV?: string
  DATABASE_URL?: string
  DATABASE_URL_UNPOOLED?: string
}

export type MigrationPlan =
  | { action: 'run'; url: string }
  | { action: 'skip'; reason: string }

function present(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export function resolveMigrationTarget(env: MigrationEnv): MigrationPlan {
  const onVercel = present(env.VERCEL) !== undefined
  if (onVercel && env.VERCEL_ENV !== 'production') {
    return {
      action: 'skip',
      reason: `VERCEL_ENV=${env.VERCEL_ENV ?? 'unset'}: migrations run only on production deployments`,
    }
  }

  const url = present(env.DATABASE_URL_UNPOOLED) ?? present(env.DATABASE_URL)
  if (!url) throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL required')
  return { action: 'run', url }
}
