import type { ProblemSource } from '@/lib/academy/problems/schema'

/**
 * Backend and payments practice set. Original problems written for lee:
 * classic ideas (dedup, rate limits, caches, keyset paging), our own stories,
 * wording, examples and tests.
 */

const healthLines = Array.from({ length: 20 }, (_, i) => {
  const ms = 20 - i
  const status = ms === 7 ? 500 : ms === 8 ? 499 : 200
  return `2026-03-02T08:00:${String(i).padStart(2, '0')}Z GET /health ${status} ${ms}ms`
})

export const BACKEND: readonly ProblemSource[] = [
  {
    slug: 'idempotency-key-dedup',
    title: 'Idempotent charge requests',
    kind: 'function',
    difficulty: 'medium',
    rating: 1400,
    skillId: 'idempotency',
    topics: ['hashing', 'reliability'],
    roles: ['payments', 'apis'],
    statement: `A payments API accepts charge requests that carry an \`Idempotency-Key\`. Clients retry on timeouts, so the same key can arrive more than once. You get the requests in arrival order as objects \`{ key, amountCents, at }\` (\`at\` in whole seconds, non-decreasing) and a key lifetime \`ttlSec\`.

Process the requests in order and return one outcome string per request:

- **\`"charged"\`**: the key has no live entry. Charge the card and store \`{ amountCents, at }\` for the key (replacing any expired entry).
- **\`"replayed"\`**: the key has a live entry with the **same** amount. Return the stored result; do not charge again.
- **\`"conflict"\`**: the key has a live entry with a **different** amount. Reject the request.

An entry stored at time \`s\` is live for a request at time \`at\` when \`at < s + ttlSec\`; at exactly \`s + ttlSec\` it has expired. Replays and conflicts never change or refresh the stored entry.`,
    constraints: [
      '0 ≤ requests.length ≤ 100 000',
      '0 ≤ ttlSec ≤ 10^6',
      '1 ≤ amountCents ≤ 10^9; 0 ≤ at ≤ 10^9, non-decreasing',
      'Keys are non-empty strings.',
    ],
    hints: [
      'You only ever need the latest charged entry for each key.',
      'Keep a hash map from key to `{ amountCents, at }` of the request that was actually charged.',
      'For each request: look up the key; if the entry is live (`at < storedAt + ttlSec`) compare amounts, otherwise charge and overwrite the entry.',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    parSec: 1200,
    fn: {
      name: 'dedupPayments',
      params: [
        { name: 'requests', type: 'object[]', tsType: 'Array<{ key: string; amountCents: number; at: number }>' },
        { name: 'ttlSec', type: 'int' },
      ],
      returns: { type: 'string[]' },
    },
    samples: [
      {
        args: [
          [
            { key: 'a', amountCents: 500, at: 0 },
            { key: 'a', amountCents: 500, at: 30 },
            { key: 'b', amountCents: 700, at: 40 },
            { key: 'a', amountCents: 900, at: 59 },
            { key: 'a', amountCents: 900, at: 60 },
          ],
          60,
        ],
        expected: ['charged', 'replayed', 'charged', 'conflict', 'charged'],
        explanation:
          'Key "a" is charged at 0 and live until 60. The retry at 30 replays; the 900 request at 59 conflicts; at 60 the entry has expired, so the 900 request is charged.',
      },
      {
        args: [
          [
            { key: 'k', amountCents: 100, at: 5 },
            { key: 'k', amountCents: 100, at: 5 },
          ],
          10,
        ],
        expected: ['charged', 'replayed'],
      },
    ],
    hidden: [
      { args: [[], 60], expected: [] },
      { args: [[{ key: 'x', amountCents: 1, at: 0 }], 1], expected: ['charged'] },
      {
        args: [
          [
            { key: 'a', amountCents: 100, at: 0 },
            { key: 'b', amountCents: 100, at: 1 },
            { key: 'a', amountCents: 100, at: 2 },
            { key: 'b', amountCents: 200, at: 3 },
            { key: 'a', amountCents: 100, at: 100 },
            { key: 'a', amountCents: 100, at: 150 },
          ],
          100,
        ],
        expected: ['charged', 'charged', 'replayed', 'conflict', 'charged', 'replayed'],
      },
      {
        args: [
          [
            { key: 'a', amountCents: 5, at: 0 },
            { key: 'a', amountCents: 5, at: 0 },
            { key: 'a', amountCents: 5, at: 1 },
          ],
          0,
        ],
        expected: ['charged', 'charged', 'charged'],
      },
      {
        args: [
          [
            { key: 'p', amountCents: 100, at: 0 },
            { key: 'p', amountCents: 200, at: 5 },
            { key: 'p', amountCents: 200, at: 10 },
            { key: 'p', amountCents: 100, at: 12 },
          ],
          10,
        ],
        expected: ['charged', 'conflict', 'charged', 'conflict'],
      },
      {
        args: [
          [
            { key: 'q', amountCents: 50, at: 0 },
            { key: 'q', amountCents: 50, at: 9 },
            { key: 'q', amountCents: 50, at: 10 },
            { key: 'q', amountCents: 50, at: 19 },
            { key: 'q', amountCents: 50, at: 20 },
          ],
          10,
        ],
        expected: ['charged', 'replayed', 'charged', 'replayed', 'charged'],
      },
      {
        args: [
          [
            { key: 'a', amountCents: 1, at: 0 },
            { key: 'b', amountCents: 2, at: 0 },
            { key: 'c', amountCents: 3, at: 0 },
            { key: 'a', amountCents: 2, at: 1 },
            { key: 'b', amountCents: 2, at: 1 },
            { key: 'c', amountCents: 4, at: 1 },
          ],
          5,
        ],
        expected: ['charged', 'charged', 'charged', 'conflict', 'replayed', 'conflict'],
      },
    ],
    scale: {
      args: [
        {
          t: 'objs',
          fields: {
            key: { t: 'pick', values: ['k0', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9'] },
            amountCents: { t: 'pick', values: [100, 200] },
            at: { t: 'ascInt', step: 1 },
          },
        },
        { t: 'const', value: 50 },
      ],
    },
    reference: {
      code: `function dedupPayments(requests, ttlSec) {
  const store = new Map()
  const out = []
  for (const r of requests) {
    const prev = store.get(r.key)
    if (prev && r.at < prev.at + ttlSec) {
      out.push(prev.amountCents === r.amountCents ? 'replayed' : 'conflict')
    } else {
      store.set(r.key, { amountCents: r.amountCents, at: r.at })
      out.push('charged')
    }
  }
  return out
}`,
      approach:
        'Keep a hash map from idempotency key to the request that was actually charged. A request whose key has a live entry (`at < storedAt + ttlSec`) is a replay when the amount matches and a conflict otherwise; anything else is charged and overwrites the entry. One O(1) lookup per request: O(n) time, O(n) space.',
    },
  },
  {
    slug: 'token-bucket-limiter',
    title: 'Per-client token bucket',
    kind: 'function',
    difficulty: 'medium',
    rating: 1450,
    skillId: 'rate-limiting',
    topics: ['design', 'reliability'],
    roles: ['apis', 'backend'],
    statement: `An API gateway limits each client with its own **token bucket**. Every bucket holds at most \`capacity\` tokens and gains \`refillPerSec\` tokens per elapsed second.

You get the requests as \`{ client, at }\` objects (\`at\` in whole seconds, non-decreasing). For each request:

1. If this is the client's first request, its bucket starts **full** (\`capacity\` tokens) at time \`at\`.
2. Otherwise refill: \`tokens = min(capacity, tokens + (at - last) * refillPerSec)\`, where \`last\` is the time of the client's previous request (allowed or denied). Then set \`last = at\`.
3. If \`tokens ≥ 1\`, spend one token and allow the request; otherwise deny it.

Return a list of booleans, one per request in input order (\`true\` = allowed). Clients never affect each other's buckets.`,
    constraints: [
      '0 ≤ requests.length ≤ 100 000',
      '1 ≤ capacity ≤ 10^6; 0 ≤ refillPerSec ≤ 10^6',
      '0 ≤ at ≤ 10^9, non-decreasing',
      'All arithmetic stays in integers.',
    ],
    hints: [
      'Each client needs only two numbers: tokens left and the time of its last request.',
      'Refill lazily when a request arrives instead of simulating every second.',
      'Store `{ tokens, last }` per client in a map; cap the refill at `capacity` before spending.',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    parSec: 1200,
    fn: {
      name: 'allowRequests',
      params: [
        { name: 'capacity', type: 'int' },
        { name: 'refillPerSec', type: 'int' },
        { name: 'requests', type: 'object[]', tsType: 'Array<{ client: string; at: number }>' },
      ],
      returns: { type: 'bool[]' },
    },
    samples: [
      {
        args: [
          2,
          1,
          [
            { client: 'a', at: 0 },
            { client: 'a', at: 0 },
            { client: 'a', at: 0 },
            { client: 'a', at: 1 },
            { client: 'a', at: 1 },
            { client: 'a', at: 3 },
          ],
        ],
        expected: [true, true, false, true, false, true],
        explanation:
          'The bucket starts with 2 tokens: two requests at 0 pass, the third is denied. At 1 one token is back (allowed, then empty). At 3 two seconds refill 2 tokens.',
      },
      {
        args: [
          1,
          1,
          [
            { client: 'a', at: 0 },
            { client: 'b', at: 0 },
            { client: 'a', at: 0 },
            { client: 'b', at: 1 },
          ],
        ],
        expected: [true, true, false, true],
      },
    ],
    hidden: [
      { args: [3, 1, []], expected: [] },
      {
        args: [
          3,
          0,
          [
            { client: 'a', at: 0 },
            { client: 'a', at: 1 },
            { client: 'a', at: 2 },
            { client: 'a', at: 3 },
            { client: 'a', at: 100 },
          ],
        ],
        expected: [true, true, true, false, false],
      },
      {
        args: [
          5,
          10,
          [
            { client: 'a', at: 0 },
            { client: 'a', at: 0 },
            { client: 'a', at: 0 },
            { client: 'a', at: 0 },
            { client: 'a', at: 0 },
            { client: 'a', at: 0 },
            { client: 'a', at: 1 },
          ],
        ],
        expected: [true, true, true, true, true, false, true],
      },
      {
        args: [
          1,
          1,
          [
            { client: 'a', at: 5 },
            { client: 'a', at: 5 },
            { client: 'b', at: 5 },
            { client: 'a', at: 6 },
            { client: 'a', at: 6 },
            { client: 'b', at: 100 },
          ],
        ],
        expected: [true, false, true, true, false, true],
      },
      {
        args: [
          2,
          3,
          [
            { client: 'a', at: 0 },
            { client: 'a', at: 0 },
            { client: 'a', at: 1000 },
            { client: 'a', at: 1000 },
            { client: 'a', at: 1000 },
          ],
        ],
        expected: [true, true, true, true, false],
      },
      { args: [1, 0, [{ client: 'z', at: 7 }]], expected: [true] },
      {
        args: [
          4,
          2,
          [
            { client: 'a', at: 0 },
            { client: 'a', at: 0 },
            { client: 'a', at: 0 },
            { client: 'a', at: 0 },
            { client: 'a', at: 1 },
            { client: 'a', at: 1 },
            { client: 'a', at: 1 },
            { client: 'a', at: 2 },
          ],
        ],
        expected: [true, true, true, true, true, true, false, true],
      },
    ],
    scale: {
      args: [
        { t: 'const', value: 3 },
        { t: 'const', value: 1 },
        {
          t: 'objs',
          fields: {
            client: { t: 'pick', values: ['c1', 'c2', 'c3', 'c4', 'c5'] },
            at: { t: 'ascInt', step: 1 },
          },
        },
      ],
    },
    reference: {
      code: `function allowRequests(capacity, refillPerSec, requests) {
  const buckets = new Map()
  const out = []
  for (const r of requests) {
    let b = buckets.get(r.client)
    if (!b) {
      b = { tokens: capacity, last: r.at }
      buckets.set(r.client, b)
    } else {
      b.tokens = Math.min(capacity, b.tokens + (r.at - b.last) * refillPerSec)
      b.last = r.at
    }
    if (b.tokens >= 1) {
      b.tokens -= 1
      out.push(true)
    } else {
      out.push(false)
    }
  }
  return out
}`,
      approach:
        'Store `{ tokens, last }` per client and refill lazily: on each request add `(at − last) × refillPerSec`, cap at `capacity`, then spend one token if there is one. Each request is O(1), so the whole run is O(n) time and O(number of clients) space.',
    },
  },
  {
    slug: 'lru-cache-ops',
    title: 'Session cache eviction',
    kind: 'function',
    difficulty: 'medium',
    rating: 1400,
    skillId: 'caching',
    topics: ['design', 'hashing'],
    roles: ['backend'],
    statement: `An auth service keeps recent sessions in a small in-memory cache that holds at most \`capacity\` entries. When it is full, it evicts the entry that was **used least recently**.

You get a list of operations and return one output per operation:

- \`{ "op": "get", "key": k }\`: if \`k\` is cached, output its value and mark \`k\` as most recently used. Otherwise output \`-1\` (a miss changes nothing).
- \`{ "op": "put", "key": k, "value": v }\`: store \`v\` under \`k\` (overwriting an existing value) and mark \`k\` as most recently used. If a **new** key makes the cache exceed \`capacity\`, first evict the least recently used entry. Output \`null\`.

Both operations count as a "use". Return the outputs in operation order.`,
    constraints: [
      '1 ≤ capacity ≤ 10 000',
      '0 ≤ ops.length ≤ 100 000',
      'Keys are non-empty strings; -10^9 ≤ value ≤ 10^9 (values are never -1).',
    ],
    hints: [
      'You need O(1) lookup by key and O(1) "who was used longest ago?".',
      'A hash map gives the lookup; a doubly linked list (or an insertion-ordered map) keeps recency order.',
      'On every use move the key to the "newest" end; evict from the "oldest" end when a new key overflows the capacity.',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    parSec: 1200,
    fn: {
      name: 'runSessionCache',
      params: [
        { name: 'capacity', type: 'int' },
        { name: 'ops', type: 'object[]', tsType: 'Array<{ op: "get" | "put"; key: string; value?: number }>' },
      ],
      returns: { type: 'any', tsType: 'Array<number | null>' },
    },
    samples: [
      {
        args: [
          2,
          [
            { op: 'put', key: 'a', value: 1 },
            { op: 'put', key: 'b', value: 2 },
            { op: 'get', key: 'a' },
            { op: 'put', key: 'c', value: 3 },
            { op: 'get', key: 'b' },
            { op: 'get', key: 'c' },
          ],
        ],
        expected: [null, null, 1, null, -1, 3],
        explanation: 'Reading "a" makes "b" the least recently used entry, so putting "c" evicts "b".',
      },
      {
        args: [
          1,
          [
            { op: 'put', key: 'x', value: 5 },
            { op: 'put', key: 'x', value: 6 },
            { op: 'get', key: 'x' },
          ],
        ],
        expected: [null, null, 6],
      },
    ],
    hidden: [
      { args: [2, []], expected: [] },
      { args: [1, [{ op: 'get', key: 'a' }]], expected: [-1] },
      {
        args: [
          2,
          [
            { op: 'put', key: 'a', value: 1 },
            { op: 'put', key: 'b', value: 2 },
            { op: 'put', key: 'a', value: 10 },
            { op: 'put', key: 'c', value: 3 },
            { op: 'get', key: 'a' },
            { op: 'get', key: 'b' },
            { op: 'get', key: 'c' },
          ],
        ],
        expected: [null, null, null, null, 10, -1, 3],
      },
      {
        args: [
          3,
          [
            { op: 'put', key: 'a', value: 1 },
            { op: 'put', key: 'b', value: 2 },
            { op: 'put', key: 'c', value: 3 },
            { op: 'get', key: 'a' },
            { op: 'get', key: 'b' },
            { op: 'put', key: 'd', value: 4 },
            { op: 'get', key: 'c' },
            { op: 'get', key: 'd' },
            { op: 'put', key: 'e', value: 5 },
            { op: 'get', key: 'a' },
            { op: 'get', key: 'b' },
          ],
        ],
        expected: [null, null, null, 1, 2, null, -1, 4, null, -1, 2],
      },
      {
        args: [
          2,
          [
            { op: 'put', key: 'a', value: 1 },
            { op: 'put', key: 'b', value: 2 },
            { op: 'get', key: 'z' },
            { op: 'put', key: 'c', value: 3 },
            { op: 'get', key: 'a' },
            { op: 'get', key: 'b' },
          ],
        ],
        expected: [null, null, -1, null, -1, 2],
      },
      {
        args: [
          2,
          [
            { op: 'put', key: 'k', value: 0 },
            { op: 'get', key: 'k' },
            { op: 'put', key: 'k', value: -7 },
            { op: 'get', key: 'k' },
          ],
        ],
        expected: [null, 0, null, -7],
      },
      {
        args: [
          2,
          [
            { op: 'put', key: 'a', value: 1 },
            { op: 'put', key: 'b', value: 2 },
            { op: 'get', key: 'a' },
            { op: 'put', key: 'c', value: 3 },
            { op: 'put', key: 'd', value: 4 },
            { op: 'get', key: 'a' },
            { op: 'get', key: 'c' },
            { op: 'get', key: 'd' },
          ],
        ],
        expected: [null, null, 1, null, null, -1, 3, 4],
      },
    ],
    scale: {
      args: [
        { t: 'const', value: 8 },
        {
          t: 'objs',
          fields: {
            op: { t: 'pick', values: ['get', 'put'] },
            key: { t: 'pick', values: ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 's12', 's13', 's14', 's15'] },
            value: { t: 'int', min: 0, max: 1000 },
          },
        },
      ],
    },
    reference: {
      code: `function runSessionCache(capacity, ops) {
  const cache = new Map()
  const out = []
  for (const o of ops) {
    if (o.op === 'get') {
      if (!cache.has(o.key)) {
        out.push(-1)
        continue
      }
      const v = cache.get(o.key)
      cache.delete(o.key)
      cache.set(o.key, v)
      out.push(v)
    } else {
      if (cache.has(o.key)) cache.delete(o.key)
      else if (cache.size >= capacity) cache.delete(cache.keys().next().value)
      cache.set(o.key, o.value)
      out.push(null)
    }
  }
  return out
}`,
      approach:
        'Keep entries in a structure ordered by recency: a hash map plus a doubly linked list, or (as here) an insertion-ordered map where re-inserting a key moves it to the newest end. A use deletes and re-inserts the key; an overflowing put evicts the oldest key first. Every operation is O(1), so the run is O(n) time and O(capacity) space.',
    },
  },
  {
    slug: 'retry-backoff-schedule',
    title: 'Retry backoff schedule',
    kind: 'function',
    difficulty: 'medium',
    rating: 1380,
    skillId: 'background-jobs',
    topics: ['math', 'reliability'],
    roles: ['backend', 'apis'],
    statement: `A job runner retries a failing webhook delivery with exponential backoff. Attempt 1 is the first call and has no delay. Before each retry \`k\` (\`k = 1 … maxAttempts − 1\`) the runner waits:

1. \`raw = baseMs × factor^(k−1)\`, capped: \`capped = min(raw, maxDelayMs)\`.
2. Jitter, deterministic for testing: \`j = jitterPct[(k−1) mod jitterPct.length]\` (use \`j = 0\` when the list is empty). \`delay = floor(capped × (100 + j) / 100)\`. The cap is applied **before** jitter, so a positive \`j\` may push a delay above \`maxDelayMs\`.
3. Budget: the runner gives up once the delays would exceed \`budgetMs\` in total. If \`(sum of delays so far) + delay > budgetMs\`, stop: this retry and all later ones are dropped. A total exactly equal to \`budgetMs\` is still allowed.

Return the list of delays in milliseconds, in retry order.`,
    constraints: [
      '1 ≤ baseMs ≤ 10^6; 1 ≤ factor ≤ 10; baseMs ≤ maxDelayMs ≤ 10^9',
      '1 ≤ maxAttempts ≤ 100 000',
      '-50 ≤ jitterPct[i] ≤ 50; 0 ≤ jitterPct.length ≤ 100 000',
      '0 ≤ budgetMs ≤ 10^15',
    ],
    hints: [
      'Compute the delays one retry at a time, keeping a running total.',
      '`factor^(k−1)` overflows quickly; once the raw delay reaches the cap it stays there, so stop multiplying.',
      'Keep `raw = min(raw × factor, maxDelayMs)` between retries; jitter with integer math `floor(capped × (100 + j) / 100)`; break before adding a delay that would pass the budget.',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    parSec: 1200,
    fn: {
      name: 'backoffSchedule',
      params: [
        { name: 'baseMs', type: 'int' },
        { name: 'factor', type: 'int' },
        { name: 'maxDelayMs', type: 'int' },
        { name: 'maxAttempts', type: 'int' },
        { name: 'jitterPct', type: 'int[]' },
        { name: 'budgetMs', type: 'int' },
      ],
      returns: { type: 'int[]' },
    },
    samples: [
      {
        args: [100, 2, 1000, 6, [0, 10, -10], 5000],
        expected: [100, 220, 360, 800, 1100],
        explanation:
          'Raw delays 100, 200, 400, 800, 1600 → capped to 1000. Jitter cycles 0, +10, −10, 0, +10: 100, 220, 360, 800, 1100 (total 2580 ≤ 5000).',
      },
      {
        args: [1000, 3, 60000, 10, [], 10000],
        expected: [1000, 3000],
        explanation: 'The third retry would wait 9000 ms, bringing the total to 13000 > 10000, so the runner stops.',
      },
    ],
    hidden: [
      { args: [100, 2, 1000, 1, [5], 1000], expected: [] },
      { args: [333, 1, 1000, 4, [-33], 100000], expected: [223, 223, 223] },
      { args: [500, 2, 10000, 5, [], 1500], expected: [500, 1000] },
      { args: [10, 2, 100, 5, [], 0], expected: [] },
      { args: [1, 1, 1, 4, [-50], 0], expected: [0, 0, 0] },
      { args: [1000, 10, 30000, 8, [50, -50], 1000000], expected: [1500, 5000, 45000, 15000, 45000, 15000, 45000] },
      { args: [200, 2, 5000, 3, [25, 5, 7, 9], 10000], expected: [250, 420] },
      {
        args: [1000000, 10, 1000000000, 50, [], 3000000000],
        expected: [1000000, 10000000, 100000000, 1000000000, 1000000000],
      },
    ],
    scale: {
      args: [
        { t: 'const', value: 1 },
        { t: 'const', value: 2 },
        { t: 'const', value: 1000 },
        { t: 'n' },
        { t: 'ints', min: -50, max: 50 },
        { t: 'const', value: 1000000000000000 },
      ],
    },
    reference: {
      code: `function backoffSchedule(baseMs, factor, maxDelayMs, maxAttempts, jitterPct, budgetMs) {
  const out = []
  let raw = Math.min(baseMs, maxDelayMs)
  let total = 0
  for (let k = 1; k < maxAttempts; k++) {
    const j = jitterPct.length > 0 ? jitterPct[(k - 1) % jitterPct.length] : 0
    const delay = Math.floor((raw * (100 + j)) / 100)
    if (total + delay > budgetMs) break
    out.push(delay)
    total += delay
    raw = Math.min(raw * factor, maxDelayMs)
  }
  return out
}`,
      approach:
        'Walk the retries in order, keeping the capped raw delay and the running total. Because the raw delay is re-capped after every multiplication it never overflows. Jitter uses integer math and a floor; the loop stops at the first delay that would overshoot the budget. O(maxAttempts) time and space for the output.',
    },
  },
  {
    slug: 'ledger-reconciliation',
    title: 'Ledger vs bank statement',
    kind: 'function',
    difficulty: 'easy',
    rating: 1200,
    skillId: 'transactions',
    topics: ['hashing', 'sorting'],
    roles: ['payments', 'data'],
    statement: `At the end of the day finance reconciles the internal ledger against the bank statement. Both are lists of \`{ ref, amountCents }\` entries; a \`ref\` appears at most once in each list. Amounts can be negative (refunds).

Return an object with three lists of refs:

- \`missingInBank\`: refs in the ledger but not in the bank statement.
- \`missingInLedger\`: refs in the bank statement but not in the ledger.
- \`amountMismatch\`: refs in both lists whose amounts differ.

Every list is sorted in ascending order by plain character-by-character string comparison (so \`"r-10"\` comes before \`"r-2"\`). All three keys are always present, even when a list is empty.`,
    constraints: [
      '0 ≤ ledger.length, bank.length ≤ 100 000',
      'Refs are non-empty ASCII strings, unique within each list.',
      '-10^9 ≤ amountCents ≤ 10^9',
    ],
    hints: [
      'Index one list by ref so you can look entries up from the other list.',
      'Put the bank statement in a hash map; walk the ledger, then walk the bank for refs the ledger lacks.',
      'Collect the three lists, then sort each with an ordinary string comparison.',
    ],
    complexity: { time: 'O(n log n)', space: 'O(n)' },
    parSec: 600,
    fn: {
      name: 'reconcile',
      params: [
        { name: 'ledger', type: 'object[]', tsType: 'Array<{ ref: string; amountCents: number }>' },
        { name: 'bank', type: 'object[]', tsType: 'Array<{ ref: string; amountCents: number }>' },
      ],
      returns: { type: 'object', tsType: '{ missingInBank: string[]; missingInLedger: string[]; amountMismatch: string[] }' },
    },
    samples: [
      {
        args: [
          [
            { ref: 'tx-1', amountCents: 500 },
            { ref: 'tx-2', amountCents: 700 },
            { ref: 'tx-3', amountCents: 100 },
          ],
          [
            { ref: 'tx-2', amountCents: 700 },
            { ref: 'tx-3', amountCents: 150 },
            { ref: 'tx-4', amountCents: 90 },
          ],
        ],
        expected: { missingInBank: ['tx-1'], missingInLedger: ['tx-4'], amountMismatch: ['tx-3'] },
        explanation: 'tx-2 matches. tx-1 never reached the bank, tx-4 is unknown to the ledger, and tx-3 settled for 150 instead of 100.',
      },
      { args: [[], []], expected: { missingInBank: [], missingInLedger: [], amountMismatch: [] } },
    ],
    hidden: [
      {
        args: [
          [
            { ref: 'a', amountCents: 1 },
            { ref: 'b', amountCents: 2 },
          ],
          [
            { ref: 'b', amountCents: 2 },
            { ref: 'a', amountCents: 1 },
          ],
        ],
        expected: { missingInBank: [], missingInLedger: [], amountMismatch: [] },
      },
      {
        args: [
          [],
          [
            { ref: 'z', amountCents: 5 },
            { ref: 'm', amountCents: 3 },
          ],
        ],
        expected: { missingInBank: [], missingInLedger: ['m', 'z'], amountMismatch: [] },
      },
      {
        args: [
          [
            { ref: 'r-10', amountCents: 1 },
            { ref: 'r-2', amountCents: 1 },
            { ref: 'r-1', amountCents: 1 },
          ],
          [],
        ],
        expected: { missingInBank: ['r-1', 'r-10', 'r-2'], missingInLedger: [], amountMismatch: [] },
      },
      {
        args: [[{ ref: 'x', amountCents: -500 }], [{ ref: 'x', amountCents: 500 }]],
        expected: { missingInBank: [], missingInLedger: [], amountMismatch: ['x'] },
      },
      {
        args: [
          [
            { ref: 'c', amountCents: 10 },
            { ref: 'a', amountCents: 20 },
            { ref: 'e', amountCents: 30 },
            { ref: 'd', amountCents: 0 },
          ],
          [
            { ref: 'd', amountCents: 0 },
            { ref: 'b', amountCents: 5 },
            { ref: 'e', amountCents: 31 },
            { ref: 'a', amountCents: 20 },
            { ref: 'f', amountCents: 1 },
          ],
        ],
        expected: { missingInBank: ['c'], missingInLedger: ['b', 'f'], amountMismatch: ['e'] },
      },
      {
        args: [
          [
            { ref: 'p', amountCents: 1 },
            { ref: 'q', amountCents: 2 },
          ],
          [
            { ref: 'q', amountCents: 3 },
            { ref: 'p', amountCents: 0 },
          ],
        ],
        expected: { missingInBank: [], missingInLedger: [], amountMismatch: ['p', 'q'] },
      },
    ],
    scale: {
      args: [
        { t: 'objs', fields: { ref: { t: 'seq', prefix: 'tx-' }, amountCents: { t: 'int', min: 1, max: 3 } } },
        { t: 'objs', fields: { ref: { t: 'seq', prefix: 'tx-' }, amountCents: { t: 'int', min: 1, max: 3 } } },
      ],
    },
    reference: {
      code: `function reconcile(ledger, bank) {
  const bankByRef = new Map()
  for (const b of bank) bankByRef.set(b.ref, b.amountCents)
  const ledgerRefs = new Set()
  const missingInBank = []
  const amountMismatch = []
  for (const l of ledger) {
    ledgerRefs.add(l.ref)
    if (!bankByRef.has(l.ref)) missingInBank.push(l.ref)
    else if (bankByRef.get(l.ref) !== l.amountCents) amountMismatch.push(l.ref)
  }
  const missingInLedger = bank.filter((b) => !ledgerRefs.has(b.ref)).map((b) => b.ref)
  const byString = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
  return {
    missingInBank: missingInBank.sort(byString),
    missingInLedger: missingInLedger.sort(byString),
    amountMismatch: amountMismatch.sort(byString),
  }
}`,
      approach:
        'Hash the bank statement by ref, walk the ledger to find refs missing from the bank or settled for a different amount, then walk the bank for refs the ledger never saw. Hash lookups make the matching O(n); sorting the three result lists makes the total O(n log n) time with O(n) space.',
    },
  },
  {
    slug: 'webhook-signature-check',
    title: 'Webhook signature header check',
    kind: 'function',
    difficulty: 'medium',
    rating: 1500,
    skillId: 'crypto-basics',
    topics: ['strings', 'security'],
    roles: ['payments', 'apis'],
    statement: `A payment provider signs every webhook. The request carries a header such as \`t=1700000000,v1=ab12,v1=cd34\`. Your server has already computed the expected signature for the payload (\`expectedSig\`, a hex string), so no real cryptography is needed here: your job is the header handling around it.

Return one of \`"ok"\`, \`"malformed"\`, \`"expired"\` or \`"mismatch"\`:

**Parsing.** Split the header on \`,\`. Each part must contain \`=\`; the key is the text before the **first** \`=\` and must be non-empty, the value is everything after it. Nothing is trimmed (\`" v1"\` is a different key from \`"v1"\`). The header is **malformed** when any of these holds:
- a part has no \`=\`, or an empty key (an empty header counts: its only part is empty);
- there is not exactly one \`t\` part, or its value is not 1 to 10 decimal digits;
- there is no \`v1\` part, or some \`v1\` part has an empty value.

Parts with other keys (such as \`v0\`) are ignored.

**Freshness.** With \`t\` as an integer, the request is **expired** when \`|now − t| > toleranceSec\` (too old or too far in the future). A difference exactly equal to \`toleranceSec\` is fine.

**Signature.** The result is **ok** when at least one \`v1\` value equals \`expectedSig\` exactly (case-sensitive), otherwise **mismatch**. Compare in the spirit of constant time: strings of different length are unequal; for equal lengths, look at every character instead of stopping at the first difference.

**Precedence:** malformed, then expired, then mismatch/ok.`,
    constraints: [
      '0 ≤ header.length ≤ 10 000',
      '1 ≤ expectedSig.length ≤ 128',
      '0 ≤ now ≤ 10^10; 0 ≤ toleranceSec ≤ 10^6',
    ],
    hints: [
      'Parse first, check freshness second, compare signatures last; the precedence follows that order.',
      'Split on commas, then split each part at its first `=` only. Count the `t` parts and collect every `v1` value.',
      'For the comparison, OR together the XOR of each character pair and check the result is zero once the lengths match.',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    parSec: 1200,
    fn: {
      name: 'verifyWebhook',
      params: [
        { name: 'header', type: 'string' },
        { name: 'expectedSig', type: 'string' },
        { name: 'now', type: 'int' },
        { name: 'toleranceSec', type: 'int' },
      ],
      returns: { type: 'string' },
    },
    samples: [
      {
        args: ['t=1700000000,v1=ab12,v1=cd34', 'cd34', 1700000100, 300],
        expected: 'ok',
        explanation: 'The timestamp is 100 s old (within 300) and the second v1 value matches the expected signature.',
      },
      { args: ['t=1700000000,v1=ab12', 'ab12', 1700000301, 300], expected: 'expired' },
      { args: ['v1=ab12', 'ab12', 1700000000, 300], expected: 'malformed' },
    ],
    hidden: [
      { args: ['', 'ab', 0, 10], expected: 'malformed' },
      { args: ['t=1000,v1=aa', 'aa', 500, 499], expected: 'expired' },
      { args: ['t=1000,v1=aa', 'aa', 1300, 300], expected: 'ok' },
      { args: ['t=1000,v1=ABCD', 'abcd', 1000, 0], expected: 'mismatch' },
      { args: ['t=1000,v1=abc', 'abcd', 1000, 5], expected: 'mismatch' },
      { args: ['t=1000,t=1000,v1=aa', 'aa', 1000, 5], expected: 'malformed' },
      { args: ['t=12a4,v1=aa', 'aa', 1234, 5], expected: 'malformed' },
      { args: ['v0=zz,v1=aa,t=1000,scheme=x', 'aa', 1005, 10], expected: 'ok' },
      { args: ['t=1,v1=', 'aa', 999999, 1], expected: 'malformed' },
      { args: ['t=100,v1=aa', 'bb', 1000, 10], expected: 'expired' },
      { args: ['t=100,v1=aa,garbage', 'aa', 100, 5], expected: 'malformed' },
      { args: ['t=100, v1=aa', 'aa', 100, 5], expected: 'malformed' },
    ],
    reference: {
      code: `function verifyWebhook(header, expectedSig, now, toleranceSec) {
  let t = 0
  let tCount = 0
  const sigs = []
  for (const part of header.split(',')) {
    const eq = part.indexOf('=')
    if (eq <= 0) return 'malformed'
    const key = part.slice(0, eq)
    const value = part.slice(eq + 1)
    if (key === 't') {
      tCount++
      if (!/^[0-9]{1,10}$/.test(value)) return 'malformed'
      t = Number(value)
    } else if (key === 'v1') {
      if (value === '') return 'malformed'
      sigs.push(value)
    }
  }
  if (tCount !== 1 || sigs.length === 0) return 'malformed'
  if (Math.abs(now - t) > toleranceSec) return 'expired'
  let ok = false
  for (const s of sigs) if (safeEqual(s, expectedSig)) ok = true
  return ok ? 'ok' : 'mismatch'
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}`,
      approach:
        'Parse the header in one pass: split on commas, cut each part at its first `=`, count `t` parts and collect `v1` values, failing fast on anything malformed. Then check the timestamp window in both directions, and finally compare each candidate with an accumulate-the-XOR loop so the time does not reveal where a guess first differs. O(n) time and space in the header length.',
    },
  },
  {
    slug: 'merge-busy-schedules',
    title: 'Team busy blocks',
    kind: 'function',
    difficulty: 'easy',
    rating: 1200,
    skillId: 'sorting-searching',
    topics: ['intervals', 'sorting'],
    roles: ['backend'],
    statement: `A scheduling service wants to show when *anyone* on an on-call team is busy. The busy blocks of every team member's calendar have been concatenated into one list \`busy\` of \`[start, end]\` pairs (minutes since midnight or any other integer clock), in no particular order.

Merge them into the smallest list of disjoint blocks covering exactly the same time. Two blocks merge when they overlap **or touch**: \`[1, 3]\` and \`[3, 5]\` become \`[1, 5]\`; \`[1, 2]\` and \`[3, 4]\` stay separate. A zero-length block \`[s, s]\` is still a block.

Return the merged blocks sorted by start time.`,
    constraints: [
      '0 ≤ busy.length ≤ 100 000',
      '0 ≤ start ≤ end ≤ 10^9',
    ],
    hints: [
      'If the blocks were sorted by start, which blocks could merge with the last block you kept?',
      'Sort by start, then sweep once, keeping the current merged block.',
      'When the next start is ≤ the current end, extend the end to the larger of the two ends; otherwise start a new block.',
    ],
    complexity: { time: 'O(n log n)', space: 'O(n)' },
    parSec: 600,
    fn: {
      name: 'mergeBusy',
      params: [{ name: 'busy', type: 'int[][]' }],
      returns: { type: 'int[][]' },
    },
    samples: [
      {
        args: [
          [
            [9, 10],
            [1, 3],
            [2, 4],
            [6, 8],
            [4, 5],
          ],
        ],
        expected: [
          [1, 5],
          [6, 8],
          [9, 10],
        ],
        explanation: '[1,3] and [2,4] overlap; [4,5] touches the result, giving [1,5]. [6,8] and [9,10] stand alone.',
      },
      {
        args: [
          [
            [1, 3],
            [3, 5],
          ],
        ],
        expected: [[1, 5]],
      },
    ],
    hidden: [
      { args: [[]], expected: [] },
      { args: [[[5, 7]]], expected: [[5, 7]] },
      {
        args: [
          [
            [1, 10],
            [2, 3],
            [4, 5],
            [11, 12],
          ],
        ],
        expected: [
          [1, 10],
          [11, 12],
        ],
      },
      {
        args: [
          [
            [2, 4],
            [2, 4],
            [2, 4],
          ],
        ],
        expected: [[2, 4]],
      },
      {
        args: [
          [
            [5, 5],
            [1, 2],
            [2, 2],
            [7, 9],
            [9, 9],
          ],
        ],
        expected: [
          [1, 2],
          [5, 5],
          [7, 9],
        ],
      },
      {
        args: [
          [
            [0, 1],
            [2, 3],
            [4, 5],
          ],
        ],
        expected: [
          [0, 1],
          [2, 3],
          [4, 5],
        ],
      },
      {
        args: [
          [
            [8, 12],
            [0, 3],
            [3, 8],
            [20, 25],
            [12, 13],
          ],
        ],
        expected: [
          [0, 13],
          [20, 25],
        ],
      },
      {
        args: [
          [
            [0, 1000000000],
            [999999999, 1000000000],
          ],
        ],
        expected: [[0, 1000000000]],
      },
    ],
    scale: { args: [{ t: 'intervals', maxLen: 8 }] },
    reference: {
      code: `function mergeBusy(busy) {
  const sorted = busy.map((b) => [b[0], b[1]]).sort((a, b) => a[0] - b[0])
  const out = []
  for (const [s, e] of sorted) {
    const last = out[out.length - 1]
    if (last && s <= last[1]) last[1] = Math.max(last[1], e)
    else out.push([s, e])
  }
  return out
}`,
      approach:
        'Sort the blocks by start. Sweep once: a block whose start is at most the current end (overlapping or touching) extends that end; otherwise it opens a new merged block. Sorting dominates: O(n log n) time, O(n) space.',
    },
  },
  {
    slug: 'flatten-json-keys',
    title: 'Flatten a JSON payload',
    kind: 'function',
    difficulty: 'medium',
    rating: 1380,
    skillId: 'api-design',
    topics: ['parsing', 'strings'],
    roles: ['apis', 'backend'],
    statement: `A reporting export needs nested JSON payloads as flat key/value rows. Flatten \`doc\` (a JSON object or array) into a single object whose keys are dotted paths:

- An object member \`k\` adds \`k\` to the path: \`{ "order": { "id": 7 } }\` → \`"order.id": 7\`.
- An array element at index \`i\` adds the decimal index: \`{ "items": [{ "sku": "A1" }] }\` → \`"items.0.sku": "A1"\`.
- Leaves are strings, numbers, booleans and \`null\`; each leaf becomes one entry, with its value unchanged (\`null\` stays \`null\`).
- **Empty objects and empty arrays are omitted** entirely (they have no leaves), so \`{ "meta": {}, "tags": [] }\` flattens to \`{}\`.
- A top-level array uses its indices as the first path segment: \`[{ "id": "a" }]\` → \`"0.id": "a"\`.

Object keys are non-empty and never contain a dot. Return the flat object; the order of its keys does not matter.`,
    constraints: [
      'The document has at most 100 000 values in total.',
      'Nesting depth ≤ 50.',
      'Keys are non-empty and contain no ".".',
    ],
    hints: [
      'Think of the document as a tree whose leaves are the scalar values.',
      'Walk it recursively (or with an explicit stack), carrying the path built so far.',
      'At a container, recurse into each child with `path + "." + key` (or just `key` at the top); at a scalar, write `out[path] = value`. An empty container simply has no children to visit.',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    parSec: 1200,
    fn: {
      name: 'flattenKeys',
      params: [{ name: 'doc', type: 'any', tsType: 'Record<string, unknown> | unknown[]' }],
      returns: { type: 'object', tsType: 'Record<string, string | number | boolean | null>' },
    },
    samples: [
      {
        args: [
          {
            order: { id: 'ord-7', total: 1250, items: [{ sku: 'A1', qty: 2 }, { sku: 'B9', qty: 1 }] },
            paid: true,
          },
        ],
        expected: {
          'order.id': 'ord-7',
          'order.total': 1250,
          'order.items.0.sku': 'A1',
          'order.items.0.qty': 2,
          'order.items.1.sku': 'B9',
          'order.items.1.qty': 1,
          paid: true,
        },
        explanation: 'Every scalar becomes one entry keyed by its path; array positions appear as 0, 1, ….',
      },
      { args: [{ meta: {}, tags: [], note: null }], expected: { note: null } },
    ],
    hidden: [
      { args: [{}], expected: {} },
      { args: [{ a: 1 }], expected: { a: 1 } },
      { args: [{ a: { b: { c: { d: 'x' } } } }], expected: { 'a.b.c.d': 'x' } },
      { args: [{ grid: [[1, 2], [], [3]] }], expected: { 'grid.0.0': 1, 'grid.0.1': 2, 'grid.2.0': 3 } },
      {
        args: [{ x: null, y: false, z: 0, w: '', v: { u: [null] } }],
        expected: { x: null, y: false, z: 0, w: '', 'v.u.0': null },
      },
      { args: [{ list: [{}, [], { k: 'v' }] }], expected: { 'list.2.k': 'v' } },
      {
        args: [{ ids: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }],
        expected: {
          'ids.0': 0,
          'ids.1': 1,
          'ids.2': 2,
          'ids.3': 3,
          'ids.4': 4,
          'ids.5': 5,
          'ids.6': 6,
          'ids.7': 7,
          'ids.8': 8,
          'ids.9': 9,
          'ids.10': 10,
          'ids.11': 11,
        },
      },
      { args: [{ codes: { '404': 'not found', '500': 'error' } }], expected: { 'codes.404': 'not found', 'codes.500': 'error' } },
      { args: [[{ id: 'a' }, { id: 'b', tags: ['x'] }]], expected: { '0.id': 'a', '1.id': 'b', '1.tags.0': 'x' } },
    ],
    scale: {
      args: [
        {
          t: 'objs',
          fields: {
            id: { t: 'seq', prefix: 'evt-' },
            amountCents: { t: 'int', min: 1, max: 100000 },
            status: { t: 'pick', values: ['paid', 'failed', null, true] },
          },
        },
      ],
    },
    reference: {
      code: `function flattenKeys(doc) {
  const out = {}
  const walk = (value, path) => {
    if (value !== null && typeof value === 'object') {
      const entries = Array.isArray(value) ? value.map((x, i) => [String(i), x]) : Object.entries(value)
      for (const [k, child] of entries) walk(child, path === '' ? k : path + '.' + k)
    } else {
      out[path] = value
    }
  }
  walk(doc, '')
  return out
}`,
      approach:
        'Depth-first walk carrying the dotted path. Containers recurse into each child with the key (or index) appended; scalars are written to the output under their path. Empty containers have no children, so they vanish naturally. Each value is visited once: O(n) time and O(n) space (plus O(depth) recursion).',
    },
  },
  {
    slug: 'access-log-summary',
    title: 'Access log route report',
    kind: 'function',
    difficulty: 'hard',
    rating: 1750,
    skillId: 'observability',
    topics: ['parsing', 'hashing', 'sorting'],
    roles: ['backend'],
    statement: `Build a per-route latency report from raw access-log lines such as:

\`2026-03-01T10:00:00Z GET /api/orders?page=2 200 123ms\`

A line is **valid** only when splitting it on single spaces gives exactly 5 parts (so double spaces, leading/trailing spaces and extra fields make it invalid) and:

1. the timestamp has the shape \`YYYY-MM-DDTHH:MM:SSZ\` (digits in the digit positions; the values themselves are not checked);
2. the method is one of \`GET\`, \`POST\`, \`PUT\`, \`PATCH\`, \`DELETE\` (uppercase);
3. the target starts with \`/\`;
4. the status is exactly 3 digits between 100 and 599;
5. the duration is 1 to 9 decimal digits followed by \`ms\` (leading zeros allowed, so \`007ms\` is 7).

Skip invalid lines silently. For each valid line the **route** is \`method + " " + path\`, where the path is the target with any query string (from the first \`?\` on) removed: \`/api/orders?page=2\` → \`GET /api/orders\`.

Return one object per route, sorted by \`route\` in plain character-by-character string order (uppercase letters sort before lowercase):

\`{ route, count, errors, p95Ms }\`

- \`count\`: valid lines for the route;
- \`errors\`: lines with status ≥ 500;
- \`p95Ms\`: the **nearest-rank** 95th percentile: sort the route's durations ascending and take the element at 1-based rank \`⌈95 × count / 100⌉\` (compute it with integers).`,
    constraints: [
      '0 ≤ lines.length ≤ 100 000',
      'Each line has at most 500 characters.',
      'Durations fit in 9 digits.',
    ],
    hints: [
      'Validate each field separately; a simple pattern per field is easier to get right than one giant regular expression.',
      'Group durations and error counts per route in a hash map keyed by "METHOD /path".',
      'At the end sort each route\'s durations, take index `ceil(95 × count / 100) − 1`, then sort the routes by name.',
    ],
    complexity: { time: 'O(n log n)', space: 'O(n)' },
    parSec: 1800,
    fn: {
      name: 'summarizeAccessLog',
      params: [{ name: 'lines', type: 'string[]' }],
      returns: { type: 'object[]', tsType: 'Array<{ route: string; count: number; errors: number; p95Ms: number }>' },
    },
    samples: [
      {
        args: [
          [
            '2026-03-01T10:00:00Z GET /api/orders 200 120ms',
            '2026-03-01T10:00:01Z GET /api/orders?page=2 503 900ms',
            '2026-03-01T10:00:02Z POST /api/refunds 201 45ms',
            'not a log line',
            '2026-03-01T10:00:03Z GET /api/orders 200 80ms',
          ],
        ],
        expected: [
          { route: 'GET /api/orders', count: 3, errors: 1, p95Ms: 900 },
          { route: 'POST /api/refunds', count: 1, errors: 0, p95Ms: 45 },
        ],
        explanation:
          'GET /api/orders has durations 80, 120, 900; rank ⌈95 × 3 / 100⌉ = 3 gives 900. The 503 counts as an error. The junk line is skipped.',
      },
      {
        args: [
          [
            '2026-03-01T10:00:00Z FETCH /api 200 5ms',
            '2026-03-01T10:00:00Z GET api 200 5ms',
            '2026-03-01T10:00:00Z GET /api 200 5.5ms',
          ],
        ],
        expected: [],
      },
    ],
    hidden: [
      { args: [[]], expected: [] },
      { args: [healthLines], expected: [{ route: 'GET /health', count: 20, errors: 1, p95Ms: 19 }] },
      {
        args: [['2026-03-01T10:00:00Z PUT /x 200 5ms', '2026-03-01T10:00:09Z PUT /x 200 1000ms']],
        expected: [{ route: 'PUT /x', count: 2, errors: 0, p95Ms: 1000 }],
      },
      {
        args: [
          [
            '2026-03-01T10:00:00Z GET /a 200 5ms extra',
            '2026-03-01T10:00:00Z  GET /a 200 5ms',
            '2026-03-01T10:00:00Z get /a 200 5ms',
            '2026-03-01T10:00:00Z GET /a 600 5ms',
            '2026-03-01T10:00:00Z GET /a 99 5ms',
            '2026-03-01T10:00:00Z GET /a 200 5',
            '2026-03-01T10:00:00Z GET /a 200 -5ms',
            '2026-03-01 10:00:00Z GET /a 200 5ms',
            '2026-03-01T10:00Z GET /a 200 5ms',
            '2026-03-01T10:00:00Z GET /a 599 7ms',
            '',
          ],
        ],
        expected: [{ route: 'GET /a', count: 1, errors: 1, p95Ms: 7 }],
      },
      {
        args: [
          [
            '2026-03-01T10:00:00Z POST /api/orders 201 1ms',
            '2026-03-01T10:00:01Z GET /api/orders 200 2ms',
            '2026-03-01T10:00:02Z DELETE /api/orders/9 500 3ms',
            '2026-03-01T10:00:03Z GET /api/Orders 200 4ms',
          ],
        ],
        expected: [
          { route: 'DELETE /api/orders/9', count: 1, errors: 1, p95Ms: 3 },
          { route: 'GET /api/Orders', count: 1, errors: 0, p95Ms: 4 },
          { route: 'GET /api/orders', count: 1, errors: 0, p95Ms: 2 },
          { route: 'POST /api/orders', count: 1, errors: 0, p95Ms: 1 },
        ],
      },
      {
        args: [
          [
            '2026-03-01T10:00:00Z GET /search?q=a 200 10ms',
            '2026-03-01T10:00:01Z GET /search? 200 30ms',
            '2026-03-01T10:00:02Z GET /search 200 20ms',
            '2026-03-01T10:00:03Z GET /search/?q=b 200 5ms',
          ],
        ],
        expected: [
          { route: 'GET /search', count: 3, errors: 0, p95Ms: 30 },
          { route: 'GET /search/', count: 1, errors: 0, p95Ms: 5 },
        ],
      },
      {
        args: [['2026-03-01T10:00:00Z PATCH /z 204 0ms', '2026-03-01T10:00:01Z PATCH /z 502 0007ms']],
        expected: [{ route: 'PATCH /z', count: 2, errors: 1, p95Ms: 7 }],
      },
    ],
    reference: {
      code: `function summarizeAccessLog(lines) {
  const TS = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/
  const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
  const routes = new Map()
  for (const line of lines) {
    const parts = line.split(' ')
    if (parts.length !== 5) continue
    const [ts, method, target, status, dur] = parts
    if (!TS.test(ts) || !METHODS.includes(method) || target[0] !== '/') continue
    if (!/^[1-5][0-9]{2}$/.test(status) || !/^[0-9]{1,9}ms$/.test(dur)) continue
    const q = target.indexOf('?')
    const route = method + ' ' + (q === -1 ? target : target.slice(0, q))
    let r = routes.get(route)
    if (!r) {
      r = { durations: [], errors: 0 }
      routes.set(route, r)
    }
    r.durations.push(Number(dur.slice(0, -2)))
    if (Number(status) >= 500) r.errors++
  }
  const names = [...routes.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return names.map((route) => {
    const r = routes.get(route)
    const sorted = r.durations.sort((a, b) => a - b)
    const count = sorted.length
    const rank = Math.floor((95 * count + 99) / 100)
    return { route, count, errors: r.errors, p95Ms: sorted[rank - 1] }
  })
}`,
      approach:
        'Validate each line field by field and skip anything that fails. Group by `METHOD /path` (query string stripped) in a hash map, collecting durations and an error count. Finally sort each group\'s durations and pick the nearest-rank element at `⌈95·count/100⌉` (integer ceiling), then sort the routes. Sorting dominates: O(n log n) time, O(n) space.',
    },
  },
  {
    slug: 'split-bill-cents',
    title: 'Split a bill to the cent',
    kind: 'function',
    difficulty: 'easy',
    rating: 1080,
    skillId: 'arrays-hashing',
    topics: ['math', 'arrays'],
    roles: ['payments'],
    statement: `A group dinner of \`totalCents\` is split evenly across \`parts\` cards. Amounts must be whole cents and the shares must add up to **exactly** \`totalCents\`: no cent may be lost or invented.

Give every share \`floor(totalCents / parts)\` cents, then hand the leftover cents out one each to the **first** shares. Return the list of \`parts\` shares in order.`,
    constraints: ['0 ≤ totalCents ≤ 10^12', '1 ≤ parts ≤ 100 000'],
    hints: [
      'How many cents are left after giving everyone the same whole amount?',
      'The leftover is `totalCents mod parts`, which is always smaller than `parts`.',
      'Share `i` is `floor(totalCents / parts) + (i < leftover ? 1 : 0)`.',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    parSec: 600,
    fn: {
      name: 'splitBill',
      params: [
        { name: 'totalCents', type: 'int' },
        { name: 'parts', type: 'int' },
      ],
      returns: { type: 'int[]' },
    },
    samples: [
      { args: [1000, 3], expected: [334, 333, 333], explanation: '1000 = 3 × 333 + 1, so the first share gets the extra cent.' },
      { args: [5, 7], expected: [1, 1, 1, 1, 1, 0, 0] },
    ],
    hidden: [
      { args: [0, 3], expected: [0, 0, 0] },
      { args: [999, 1], expected: [999] },
      { args: [1200, 4], expected: [300, 300, 300, 300] },
      { args: [101, 2], expected: [51, 50] },
      { args: [1000000000, 6], expected: [166666667, 166666667, 166666667, 166666667, 166666666, 166666666] },
      { args: [10, 10], expected: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
      { args: [11, 10], expected: [2, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
    ],
    scale: { args: [{ t: 'const', value: 987654321 }, { t: 'n' }] },
    reference: {
      code: `function splitBill(totalCents, parts) {
  const base = Math.floor(totalCents / parts)
  const leftover = totalCents - base * parts
  const out = []
  for (let i = 0; i < parts; i++) out.push(base + (i < leftover ? 1 : 0))
  return out
}`,
      approach:
        'Integer division gives the common share and the remainder gives the leftover cents, which is always less than `parts`. Hand one extra cent to each of the first `leftover` shares, so the sum is exact. O(parts) time and space for the output.',
    },
  },
  {
    slug: 'outbox-dispatch-order',
    title: 'Outbox relay ordering',
    kind: 'function',
    difficulty: 'hard',
    rating: 1750,
    skillId: 'queues-messaging',
    topics: ['hashing', 'reliability', 'design'],
    roles: ['backend'],
    statement: `A transactional-outbox relay forwards domain events to a message broker. Events arrive as \`{ aggregate, seq, id }\` objects, possibly out of order and possibly duplicated by retries. Consumers require that each aggregate's events are delivered **in \`seq\` order starting at 1, without gaps**.

Process the events in arrival order. Each aggregate starts expecting \`seq = 1\`. For an arriving event:

- If its \`seq\` is lower than the aggregate's next expected \`seq\` (already delivered), or an event with the same \`aggregate\` and \`seq\` is already waiting in the buffer, it is a **duplicate**: drop it (the first arrival wins, even if the ids differ).
- If its \`seq\` equals the next expected one, deliver it, then keep delivering buffered events of that aggregate while the next \`seq\` is waiting.
- Otherwise (a gap) buffer it.

Return \`{ delivered, stuck }\`:

- \`delivered\`: the ids in delivery order.
- \`stuck\`: one object \`{ aggregate, nextSeq, buffered }\` for each aggregate that still has buffered events at the end, where \`nextSeq\` is the seq it is waiting for and \`buffered\` is how many events are waiting. Sorted by \`aggregate\` in plain character-by-character string order. Both keys are always present.`,
    constraints: [
      '0 ≤ events.length ≤ 100 000',
      '1 ≤ seq ≤ 10^9',
      'Aggregate names and ids are non-empty strings.',
    ],
    hints: [
      'Per aggregate you need the next expected seq and the set of events waiting for a gap to close.',
      'Keep a map aggregate → next seq and a map aggregate → (seq → id) for the buffer.',
      'After delivering the expected seq, loop: while the buffer holds `next`, deliver it, remove it and advance `next`. Every event is buffered and flushed at most once, so the whole run stays linear.',
    ],
    complexity: { time: 'O(n log n)', space: 'O(n)' },
    parSec: 1800,
    fn: {
      name: 'dispatchOutbox',
      params: [{ name: 'events', type: 'object[]', tsType: 'Array<{ aggregate: string; seq: number; id: string }>' }],
      returns: {
        type: 'object',
        tsType: '{ delivered: string[]; stuck: Array<{ aggregate: string; nextSeq: number; buffered: number }> }',
      },
    },
    samples: [
      {
        args: [
          [
            { aggregate: 'order-1', seq: 1, id: 'e1' },
            { aggregate: 'order-2', seq: 2, id: 'e2' },
            { aggregate: 'order-1', seq: 3, id: 'e3' },
            { aggregate: 'order-1', seq: 2, id: 'e4' },
            { aggregate: 'order-2', seq: 2, id: 'e5' },
            { aggregate: 'order-1', seq: 1, id: 'e6' },
          ],
        ],
        expected: { delivered: ['e1', 'e4', 'e3'], stuck: [{ aggregate: 'order-2', nextSeq: 1, buffered: 1 }] },
        explanation:
          'e3 waits until e4 (seq 2) arrives, then both go out. e5 duplicates the buffered seq 2 of order-2 and e6 repeats a delivered seq; both are dropped. order-2 never receives seq 1.',
      },
      {
        args: [
          [
            { aggregate: 'a', seq: 1, id: 'x' },
            { aggregate: 'a', seq: 2, id: 'y' },
          ],
        ],
        expected: { delivered: ['x', 'y'], stuck: [] },
      },
    ],
    hidden: [
      { args: [[]], expected: { delivered: [], stuck: [] } },
      {
        args: [
          [
            { aggregate: 'a', seq: 3, id: 'c' },
            { aggregate: 'a', seq: 2, id: 'b' },
            { aggregate: 'a', seq: 1, id: 'a1' },
          ],
        ],
        expected: { delivered: ['a1', 'b', 'c'], stuck: [] },
      },
      {
        args: [
          [
            { aggregate: 'acct-9', seq: 2, id: 'p' },
            { aggregate: 'acct-9', seq: 3, id: 'q' },
            { aggregate: 'acct-9', seq: 5, id: 'r' },
          ],
        ],
        expected: { delivered: [], stuck: [{ aggregate: 'acct-9', nextSeq: 1, buffered: 3 }] },
      },
      {
        args: [
          [
            { aggregate: 'b', seq: 1, id: 'b1' },
            { aggregate: 'a', seq: 2, id: 'a2' },
            { aggregate: 'b', seq: 3, id: 'b3' },
            { aggregate: 'a', seq: 1, id: 'a1' },
            { aggregate: 'b', seq: 2, id: 'b2' },
            { aggregate: 'c', seq: 1, id: 'c1' },
          ],
        ],
        expected: { delivered: ['b1', 'a1', 'a2', 'b2', 'b3', 'c1'], stuck: [] },
      },
      {
        args: [
          [
            { aggregate: 'a', seq: 2, id: 'first' },
            { aggregate: 'a', seq: 2, id: 'second' },
            { aggregate: 'a', seq: 1, id: 'one' },
          ],
        ],
        expected: { delivered: ['one', 'first'], stuck: [] },
      },
      {
        args: [
          [
            { aggregate: 'z', seq: 1, id: 'z1' },
            { aggregate: 'z', seq: 3, id: 'z3' },
            { aggregate: 'm', seq: 1, id: 'm1' },
            { aggregate: 'm', seq: 4, id: 'm4' },
            { aggregate: 'm', seq: 2, id: 'm2' },
            { aggregate: 'z', seq: 4, id: 'z4' },
          ],
        ],
        expected: {
          delivered: ['z1', 'm1', 'm2'],
          stuck: [
            { aggregate: 'm', nextSeq: 3, buffered: 1 },
            { aggregate: 'z', nextSeq: 2, buffered: 2 },
          ],
        },
      },
      {
        args: [
          [
            { aggregate: 'a', seq: 1, id: 'x1' },
            { aggregate: 'a', seq: 1, id: 'x1' },
            { aggregate: 'a', seq: 2, id: 'x2' },
            { aggregate: 'a', seq: 1, id: 'x3' },
          ],
        ],
        expected: { delivered: ['x1', 'x2'], stuck: [] },
      },
    ],
    scale: {
      args: [
        {
          t: 'objs',
          fields: {
            aggregate: { t: 'pick', values: ['agg-0', 'agg-1', 'agg-2', 'agg-3', 'agg-4', 'agg-5', 'agg-6', 'agg-7'] },
            seq: { t: 'int', min: 1, max: 64 },
            id: { t: 'seq', prefix: 'ev-' },
          },
        },
      ],
    },
    reference: {
      code: `function dispatchOutbox(events) {
  const next = new Map()
  const pending = new Map()
  const delivered = []
  for (const e of events) {
    if (!next.has(e.aggregate)) {
      next.set(e.aggregate, 1)
      pending.set(e.aggregate, new Map())
    }
    const buf = pending.get(e.aggregate)
    let want = next.get(e.aggregate)
    if (e.seq < want || buf.has(e.seq)) continue
    if (e.seq > want) {
      buf.set(e.seq, e.id)
      continue
    }
    delivered.push(e.id)
    want++
    while (buf.has(want)) {
      delivered.push(buf.get(want))
      buf.delete(want)
      want++
    }
    next.set(e.aggregate, want)
  }
  const stuck = [...pending.entries()]
    .filter(([, buf]) => buf.size > 0)
    .map(([aggregate, buf]) => ({ aggregate, nextSeq: next.get(aggregate), buffered: buf.size }))
    .sort((x, y) => (x.aggregate < y.aggregate ? -1 : x.aggregate > y.aggregate ? 1 : 0))
  return { delivered, stuck }
}`,
      approach:
        'Track, per aggregate, the next expected seq and a hash map of buffered seq → id. A seq below the expected one or already buffered is a duplicate; the expected seq is delivered and then the buffer is drained while it holds the following seq; anything else waits. Each event is buffered and drained at most once, so processing is O(n); sorting the stuck aggregates adds O(k log k), O(n log n) in the worst case, with O(n) space.',
    },
  },
  {
    slug: 'cursor-pagination',
    title: 'Keyset pagination cursor',
    kind: 'function',
    difficulty: 'hard',
    rating: 1720,
    skillId: 'api-design',
    topics: ['sorting', 'binary-search', 'parsing'],
    roles: ['apis', 'backend'],
    statement: `An invoices endpoint lists records newest first and pages with a **cursor** instead of an offset, so rows inserted or deleted between requests never shift a page.

Records are \`{ id, createdAt }\` (ids unique, given in any order). The listing order is \`createdAt\` **descending**, ties broken by \`id\` **ascending** in plain character-by-character string order.

A cursor is the string \`"<createdAt>_<id>"\` of the last record on the previous page. Parse it by splitting at the **first** \`_\`: the left side must be 1 or more decimal digits and the right side must be non-empty. Write \`fetchPage(records, pageSize, cursor)\`:

- \`cursor = null\`: the page starts at the first record in listing order.
- Valid cursor \`(c, i)\`: the page starts at the first record that sorts strictly **after** \`(c, i)\`, i.e. \`createdAt < c\`, or \`createdAt = c\` and \`id > i\`. The cursor's record does not need to exist any more (it may have been deleted).
- Malformed cursor: return \`{ "items": [], "nextCursor": null }\`.

Return \`{ items, nextCursor }\`: \`items\` holds the ids of up to \`pageSize\` records from the start position; \`nextCursor\` is the cursor of the last item when more records follow the page, otherwise \`null\`.`,
    constraints: [
      '0 ≤ records.length ≤ 100 000',
      '1 ≤ pageSize ≤ 1 000',
      '0 ≤ createdAt ≤ 10^12; ids are non-empty and contain no "_"',
    ],
    hints: [
      'Sort once by the listing order; then the page is a contiguous slice.',
      'Find the slice start by comparing each record with the cursor under the same ordering; the "is after the cursor" test is monotone along the sorted list.',
      'Binary search for the first record after the cursor, slice `pageSize` items, and emit a next cursor only if records remain beyond the slice.',
    ],
    complexity: { time: 'O(n log n)', space: 'O(n)' },
    parSec: 1800,
    fn: {
      name: 'fetchPage',
      params: [
        { name: 'records', type: 'object[]', tsType: 'Array<{ id: string; createdAt: number }>' },
        { name: 'pageSize', type: 'int' },
        { name: 'cursor', type: 'any', tsType: 'string | null' },
      ],
      returns: { type: 'object', tsType: '{ items: string[]; nextCursor: string | null }' },
    },
    samples: [
      {
        args: [
          [
            { id: 'inv-3', createdAt: 300 },
            { id: 'inv-1', createdAt: 100 },
            { id: 'inv-4', createdAt: 300 },
            { id: 'inv-2', createdAt: 200 },
          ],
          2,
          null,
        ],
        expected: { items: ['inv-3', 'inv-4'], nextCursor: '300_inv-4' },
        explanation: 'Listing order is inv-3, inv-4 (both 300, ids ascending), inv-2, inv-1. Two more records follow the page.',
      },
      {
        args: [
          [
            { id: 'inv-3', createdAt: 300 },
            { id: 'inv-1', createdAt: 100 },
            { id: 'inv-4', createdAt: 300 },
            { id: 'inv-2', createdAt: 200 },
          ],
          2,
          '300_inv-4',
        ],
        expected: { items: ['inv-2', 'inv-1'], nextCursor: null },
      },
      {
        args: [
          [
            { id: 'inv-3', createdAt: 300 },
            { id: 'inv-1', createdAt: 100 },
            { id: 'inv-2', createdAt: 200 },
          ],
          1,
          '300_inv-4',
        ],
        expected: { items: ['inv-2'], nextCursor: '200_inv-2' },
        explanation: 'inv-4 was deleted, but the cursor still marks a position: inv-3 sorts before it, so the page starts at inv-2.',
      },
    ],
    hidden: [
      { args: [[], 5, null], expected: { items: [], nextCursor: null } },
      { args: [[], 5, '100_x'], expected: { items: [], nextCursor: null } },
      { args: [[{ id: 'a', createdAt: 1 }], 1, 'abc'], expected: { items: [], nextCursor: null } },
      { args: [[{ id: 'a', createdAt: 1 }], 1, '12_'], expected: { items: [], nextCursor: null } },
      { args: [[{ id: 'a', createdAt: 1 }], 1, '_a'], expected: { items: [], nextCursor: null } },
      {
        args: [
          [
            { id: 'c', createdAt: 5 },
            { id: 'a', createdAt: 5 },
            { id: 'b', createdAt: 9 },
          ],
          3,
          null,
        ],
        expected: { items: ['b', 'a', 'c'], nextCursor: null },
      },
      {
        args: [
          [
            { id: 'a', createdAt: 10 },
            { id: 'b', createdAt: 20 },
          ],
          2,
          '5_zzz',
        ],
        expected: { items: [], nextCursor: null },
      },
      {
        args: [
          [
            { id: 'a', createdAt: 10 },
            { id: 'b', createdAt: 20 },
          ],
          1,
          '99_a',
        ],
        expected: { items: ['b'], nextCursor: '20_b' },
      },
      {
        args: [
          [
            { id: 'x-10', createdAt: 7 },
            { id: 'x-2', createdAt: 7 },
            { id: 'x-1', createdAt: 7 },
            { id: 'x-3', createdAt: 7 },
          ],
          2,
          '7_x-10',
        ],
        expected: { items: ['x-2', 'x-3'], nextCursor: null },
      },
      {
        args: [
          [
            { id: 'a', createdAt: 3 },
            { id: 'b', createdAt: 2 },
            { id: 'c', createdAt: 1 },
          ],
          10,
          '3_a',
        ],
        expected: { items: ['b', 'c'], nextCursor: null },
      },
      {
        args: [
          [
            { id: 'e', createdAt: 50 },
            { id: 'd', createdAt: 40 },
            { id: 'c', createdAt: 30 },
            { id: 'b', createdAt: 20 },
            { id: 'a', createdAt: 10 },
          ],
          2,
          '40_d',
        ],
        expected: { items: ['c', 'b'], nextCursor: '20_b' },
      },
    ],
    scale: {
      args: [
        { t: 'objs', fields: { id: { t: 'seq', prefix: 'r-' }, createdAt: { t: 'int', min: 0, max: 1000 } } },
        { t: 'const', value: 10 },
        { t: 'const', value: '500_r-5' },
      ],
    },
    reference: {
      code: `function fetchPage(records, pageSize, cursor) {
  const byId = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
  const sorted = [...records].sort((a, b) => b.createdAt - a.createdAt || byId(a.id, b.id))
  let start = 0
  if (cursor !== null) {
    const cut = cursor.indexOf('_')
    const left = cut === -1 ? '' : cursor.slice(0, cut)
    const right = cut === -1 ? '' : cursor.slice(cut + 1)
    if (!/^[0-9]+$/.test(left) || right === '') return { items: [], nextCursor: null }
    const c = Number(left)
    let lo = 0
    let hi = sorted.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      const r = sorted[mid]
      const after = r.createdAt < c || (r.createdAt === c && r.id > right)
      if (after) hi = mid
      else lo = mid + 1
    }
    start = lo
  }
  const page = sorted.slice(start, start + pageSize)
  const more = start + pageSize < sorted.length
  const last = page[page.length - 1]
  return { items: page.map((r) => r.id), nextCursor: more && last ? last.createdAt + '_' + last.id : null }
}`,
      approach:
        'Sort the records by (createdAt desc, id asc). The predicate "sorts after the cursor" is false for a prefix and true for the rest of that order, so a binary search finds the first record of the page even if the cursor\'s own record is gone. Slice `pageSize` items and emit the last item\'s cursor only if records remain. Sorting dominates: O(n log n) time, O(n) space.',
    },
  },
]
