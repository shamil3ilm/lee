import type { StudyPlan } from '@/lib/academy/problems/schema'

/** Curated lists of problems with progress bars (/playground/problems/plans). */
export const STUDY_PLANS: readonly StudyPlan[] = [
  {
    id: 'backend-essentials',
    title: 'Backend interview essentials',
    description:
      'The patterns backend screens lean on: hashing, two pointers, windows, stacks, trees, graphs, intervals and one DP, each in a service-flavoured story.',
    problems: [
      'refund-pair',
      'repeated-transaction-ids',
      'noisiest-error-codes',
      'mirrored-reference-code',
      'busiest-minute-stretch',
      'longest-fresh-session',
      'balanced-config-template',
      'days-until-higher-price',
      'compare-release-versions',
      'org-chart-depth',
      'category-tree-levels',
      'fewest-service-hops',
      'job-build-order',
      'interview-room-count',
      'merge-busy-schedules',
      'fewest-notes-exact',
      'lru-cache-ops',
      'flatten-json-keys',
    ],
  },
  {
    id: 'payments-reliability',
    title: 'Payments & reliability',
    description:
      'Idempotency, rate limits, retries, reconciliation, webhook checks and money arithmetic: the problems payment and platform teams actually ship.',
    problems: [
      'idempotency-key-dedup',
      'token-bucket-limiter',
      'retry-backoff-schedule',
      'ledger-reconciliation',
      'webhook-signature-check',
      'split-bill-cents',
      'outbox-dispatch-order',
      'cursor-pagination',
      'access-log-summary',
      'refund-pair',
      'non-adjacent-payouts',
      'offsetting-ledger-triples',
      'postfix-fee-formula',
      'first-overdraft-entry',
    ],
  },
  {
    id: 'sql-30',
    title: 'SQL 30',
    description:
      'Thirty minutes a day of real Postgres in the browser: joins, anti-joins, grouping, ranking and window functions over payments data.',
    problems: [
      'merchant-volume',
      'customers-without-orders',
      'duplicate-webhook-deliveries',
      'second-largest-invoice',
      'daily-refund-rate',
      'first-overdraft-entry',
    ],
  },
  {
    id: 'hard-mode',
    title: 'Hard mode',
    description: 'The hardest problems in the set, for when the essentials feel easy.',
    problems: [
      'order-run-one-backorder',
      'backfill-under-peaks',
      'shortest-covering-log-slice',
      'largest-reservation-block',
      'expand-repeat-template',
      'budget-path-count',
      'sku-edit-distance',
      'longest-revenue-climb',
      'access-log-summary',
      'outbox-dispatch-order',
    ],
  },
]
