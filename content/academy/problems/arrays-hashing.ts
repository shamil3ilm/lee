import type { ProblemSource } from '@/lib/academy/problems/schema'

/**
 * Arrays and hashing. Original problems written for lee: classic ideas,
 * our own stories, wording, examples and tests.
 */
export const ARRAYS_HASHING: readonly ProblemSource[] = [
  {
    slug: 'refund-pair',
    title: 'Refund pair',
    kind: 'function',
    difficulty: 'easy',
    rating: 1150,
    skillId: 'arrays-hashing',
    topics: ['arrays', 'hashing'],
    roles: ['payments'],
    statement: `A customer disputes a charge of \`target\` cents. Support wants to cover it with exactly two refunds from the list of open refund amounts \`amounts\`.

Return the indices \`[i, j]\` (with \`i < j\`) of the two refunds whose amounts add up to \`target\`. Every input has exactly one such pair.`,
    constraints: [
      '2 ≤ amounts.length ≤ 100 000',
      '-10^9 ≤ amounts[i], target ≤ 10^9',
      'Exactly one pair adds up to target.',
    ],
    hints: [
      'For each amount, which other amount would complete the pair?',
      'Remember amounts you have already seen, with their index, in a hash map.',
      'One pass: look up target − amount before storing the current amount.',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    parSec: 600,
    fn: {
      name: 'refundPair',
      params: [
        { name: 'amounts', type: 'int[]' },
        { name: 'target', type: 'int' },
      ],
      returns: { type: 'int[]' },
    },
    samples: [
      { args: [[700, 250, 1300, 450], 1150], expected: [0, 3], explanation: '700 + 450 = 1150.' },
      { args: [[40, 60, 60], 120], expected: [1, 2] },
    ],
    hidden: [
      { args: [[5, -5], 0], expected: [0, 1] },
      { args: [[1, 2, 3, 4, 5, 6], 11], expected: [4, 5] },
      { args: [[-3, 8, 14, -9, 2], 5], expected: [0, 1] },
      { args: [[0, 7, 0], 0], expected: [0, 2] },
      { args: [[1000000000, -1000000000, 3], 0], expected: [0, 1] },
      { args: [[9, 1, 4, 6, 3], 10], expected: [0, 1] },
    ],
    scale: { args: [{ t: 'ints', min: 1, max: 1000000000, distinct: true }, { t: 'const', value: -1 }] },
    reference: {
      code: `function refundPair(amounts, target) {
  const seen = new Map()
  for (let i = 0; i < amounts.length; i++) {
    const need = target - amounts[i]
    if (seen.has(need)) return [seen.get(need), i]
    seen.set(amounts[i], i)
  }
  return []
}`,
      approach:
        'Walk the list once. For each amount, the partner it needs is `target − amount`; if that partner was seen earlier, its stored index and the current index are the answer. Otherwise remember the current amount. Each lookup is O(1) on average, so the pass is O(n) time and O(n) space.',
    },
  },
  {
    slug: 'repeated-transaction-ids',
    title: 'Repeated transaction ids',
    kind: 'function',
    difficulty: 'easy',
    rating: 1100,
    skillId: 'arrays-hashing',
    topics: ['arrays', 'hashing'],
    roles: ['payments', 'backend'],
    statement: `A payment processor replays its settlement file after a network timeout, so some transaction ids show up more than once in \`ids\`.

Return every id that appears **two or more times**, each listed once, in the order of its **first** appearance in \`ids\`. Ids are case-sensitive (\`"TX-1"\` and \`"tx-1"\` are different). If nothing repeats, return an empty list.`,
    constraints: [
      '0 ≤ ids.length ≤ 100 000',
      '1 ≤ ids[i].length ≤ 32',
      'Ids are compared exactly (case-sensitive).',
    ],
    hints: [
      'Counting how often each id occurs answers "does it repeat?".',
      'A hash map from id to count needs one pass; a second pass over `ids` gives you the first-appearance order.',
      'In the second pass, emit an id when its count is above one and you have not emitted it yet.',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    parSec: 600,
    fn: {
      name: 'repeatedIds',
      params: [{ name: 'ids', type: 'string[]' }],
      returns: { type: 'string[]' },
    },
    samples: [
      {
        args: [['tx-104', 'tx-221', 'tx-104', 'tx-300', 'tx-221', 'tx-104']],
        expected: ['tx-104', 'tx-221'],
        explanation: 'tx-104 appears three times and tx-221 twice; tx-104 was seen first, so it comes first. tx-300 appears once.',
      },
      { args: [['a1', 'b2', 'c3']], expected: [] },
    ],
    hidden: [
      { args: [[]], expected: [] },
      { args: [['x']], expected: [] },
      { args: [['x', 'x']], expected: ['x'] },
      { args: [['b', 'a', 'a', 'b']], expected: ['b', 'a'] },
      { args: [['t9', 't1', 't2', 't1', 't9', 't3', 't3']], expected: ['t9', 't1', 't3'] },
      { args: [['TX-1', 'tx-1', 'TX-1']], expected: ['TX-1'] },
      { args: [['q', 'q', 'q', 'q']], expected: ['q'] },
      { args: [['m', 'n', 'o', 'p', 'm']], expected: ['m'] },
    ],
    scale: { args: [{ t: 'strs', wordLen: 6, alphabet: '0123456789abcdef' }] },
    reference: {
      code: `function repeatedIds(ids) {
  const count = new Map()
  for (const id of ids) count.set(id, (count.get(id) || 0) + 1)
  const out = []
  const emitted = new Set()
  for (const id of ids) {
    if (count.get(id) > 1 && !emitted.has(id)) {
      emitted.add(id)
      out.push(id)
    }
  }
  return out
}`,
      approach:
        'Count every id in a hash map, then walk `ids` again and emit each id whose count is above one the first time it is met. Two linear passes with O(1) average map operations: O(n) time and O(n) space.',
    },
  },
  {
    slug: 'balance-range-changes',
    title: 'Net change over date ranges',
    kind: 'function',
    difficulty: 'easy',
    rating: 1200,
    skillId: 'arrays-hashing',
    topics: ['arrays', 'math'],
    roles: ['payments', 'data'],
    statement: `An account's daily ledger is summarised as \`deltas\`, where \`deltas[d]\` is the net movement in cents on day \`d\` (deposits minus withdrawals). Finance asks many questions of the form "how much did the balance change from day \`from\` to day \`to\`, both inclusive?", given as \`ranges\`, a list of \`[from, to]\` pairs.

Return a list with one number per range, in the same order as \`ranges\`: the sum of \`deltas[from..to]\`. An empty \`ranges\` gives an empty list.`,
    constraints: [
      '1 ≤ deltas.length ≤ 100 000',
      '0 ≤ ranges.length ≤ 100 000',
      '-10^9 ≤ deltas[i] ≤ 10^9',
      '0 ≤ from ≤ to < deltas.length',
    ],
    hints: [
      'Summing each range from scratch is O(n) per question. Can one pass up front make every question cheap?',
      'Keep running totals: prefix[i] = sum of the first i deltas.',
      'The change over [from, to] is prefix[to + 1] − prefix[from].',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    parSec: 600,
    fn: {
      name: 'rangeChanges',
      params: [
        { name: 'deltas', type: 'int[]' },
        { name: 'ranges', type: 'int[][]' },
      ],
      returns: { type: 'int[]' },
    },
    samples: [
      {
        args: [[500, -200, 1200, -50, 300], [[0, 2], [1, 3], [4, 4]]],
        expected: [1500, 950, 300],
        explanation: 'Days 0–2: 500 − 200 + 1200 = 1500. Days 1–3: −200 + 1200 − 50 = 950. Day 4 alone: 300.',
      },
      { args: [[100], [[0, 0], [0, 0]]], expected: [100, 100] },
    ],
    hidden: [
      { args: [[10, 20, 30], []], expected: [] },
      { args: [[-5, -5, -5, -5], [[0, 3], [1, 2]]], expected: [-20, -10] },
      { args: [[0, 0, 7, 0], [[0, 1], [2, 2], [3, 3], [0, 3]]], expected: [0, 7, 0, 7] },
      { args: [[1000000000, 1000000000, -1000000000], [[0, 2], [0, 1]]], expected: [1000000000, 2000000000] },
      { args: [[3, 1, 4, 1, 5, 9, 2, 6], [[2, 5], [0, 7], [6, 7]]], expected: [19, 31, 8] },
      { args: [[7, -7, 7, -7], [[0, 1], [1, 2], [0, 0], [3, 3]]], expected: [0, 0, 7, -7] },
    ],
    scale: {
      args: [
        { t: 'ints', min: -1000, max: 1000 },
        { t: 'const', value: [[0, 0], [0, 255], [100, 200]] },
      ],
    },
    reference: {
      code: `function rangeChanges(deltas, ranges) {
  const prefix = [0]
  for (let i = 0; i < deltas.length; i++) prefix.push(prefix[i] + deltas[i])
  return ranges.map(([from, to]) => prefix[to + 1] - prefix[from])
}`,
      approach:
        'Build prefix sums once, where `prefix[i]` is the total of the first `i` days. Each range is then a single subtraction, `prefix[to + 1] − prefix[from]`. Building is O(n) and every query is O(1), so the whole call is O(n + q) time with O(n) extra space.',
    },
  },
  {
    slug: 'noisiest-error-codes',
    title: 'Noisiest error codes',
    kind: 'function',
    difficulty: 'medium',
    rating: 1400,
    skillId: 'arrays-hashing',
    topics: ['hashing', 'sorting', 'arrays'],
    roles: ['backend', 'apis'],
    statement: `The on-call dashboard shows the error codes an API returned in the last hour as \`codes\` (one entry per failed request). It should highlight the \`k\` codes that occurred most often.

Return exactly \`k\` distinct codes ordered by occurrence count, **highest first**. When two codes have the same count, the **numerically smaller** code comes first.`,
    constraints: [
      '1 ≤ codes.length ≤ 100 000',
      '100 ≤ codes[i] ≤ 999',
      '1 ≤ k ≤ number of distinct codes',
    ],
    hints: [
      'First find how many times each code occurred.',
      'A hash map gives the counts in one pass; then you only need to order the distinct codes.',
      'Sort the (code, count) pairs by count descending, then code ascending, and take the first k.',
    ],
    complexity: { time: 'O(n log n)', space: 'O(n)' },
    parSec: 1200,
    fn: {
      name: 'topErrorCodes',
      params: [
        { name: 'codes', type: 'int[]' },
        { name: 'k', type: 'int' },
      ],
      returns: { type: 'int[]' },
    },
    samples: [
      {
        args: [[503, 500, 503, 404, 500, 503, 429], 2],
        expected: [503, 500],
        explanation: '503 occurs 3 times and 500 twice; 404 and 429 occur once each.',
      },
      { args: [[404, 429, 404, 429, 500], 3], expected: [404, 429, 500] },
    ],
    hidden: [
      { args: [[500], 1], expected: [500] },
      { args: [[502, 502, 502], 1], expected: [502] },
      { args: [[429, 404, 500, 503], 2], expected: [404, 429] },
      { args: [[500, 404, 500, 404, 503, 503, 503], 3], expected: [503, 404, 500] },
      { args: [[401, 403, 401, 403, 401, 404, 404, 404, 404], 2], expected: [404, 401] },
      { args: [[599, 400, 599, 400], 1], expected: [400] },
      { args: [[418, 418, 500, 500, 500, 418, 302], 3], expected: [418, 500, 302] },
    ],
    scale: { args: [{ t: 'ints', min: 400, max: 599 }, { t: 'const', value: 5 }] },
    reference: {
      code: `function topErrorCodes(codes, k) {
  const count = new Map()
  for (const c of codes) count.set(c, (count.get(c) || 0) + 1)
  const entries = [...count.entries()]
  entries.sort((a, b) => b[1] - a[1] || a[0] - b[0])
  return entries.slice(0, k).map((e) => e[0])
}`,
      approach:
        'Count each code in a hash map in one pass. Sort the distinct codes by count descending and break ties by the smaller code, then keep the first `k`. Counting is O(n) and the sort is O(u log u) for `u` distinct codes, so O(n log n) at worst with O(n) space.',
    },
  },
  {
    slug: 'shuffled-sku-groups',
    title: 'Shuffled SKU groups',
    kind: 'function',
    difficulty: 'medium',
    rating: 1450,
    skillId: 'arrays-hashing',
    topics: ['hashing', 'strings'],
    roles: ['backend', 'data'],
    statement: `A warehouse import mixed up character order in some SKUs: \`"AB12"\` might arrive as \`"21BA"\` or \`"B1A2"\`. To review them, group together SKUs that use exactly the same characters the same number of times (one is a rearrangement of the other). Characters are case-sensitive.

Return the list of groups. Every SKU in \`skus\` belongs to exactly one group, and a SKU that appears twice appears twice in its group. **Any order is accepted**, both for the groups and for the SKUs inside a group. An empty input gives an empty list.`,
    constraints: [
      '0 ≤ skus.length ≤ 50 000',
      '1 ≤ skus[i].length ≤ 12',
      'SKUs contain only letters A–Z, a–z and digits 0–9.',
    ],
    hints: [
      'Two rearrangements of each other must share some fingerprint that ignores order.',
      'Sorting a SKU\'s characters (or counting them) gives the same key for every rearrangement.',
      'Map each key to the list of SKUs with that key; the map\'s values are the groups.',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    parSec: 1200,
    fn: {
      name: 'groupSkus',
      params: [{ name: 'skus', type: 'string[]' }],
      returns: { type: 'string[][]' },
    },
    compare: { mode: 'unordered', unorderedInner: true },
    samples: [
      {
        args: [['AB12', '21BA', 'C3', 'B1A2', '3C', 'Z9']],
        expected: [['AB12', '21BA', 'B1A2'], ['C3', '3C'], ['Z9']],
        explanation: 'AB12, 21BA and B1A2 all use A, B, 1 and 2 once; C3 and 3C share C and 3; Z9 stands alone.',
      },
    ],
    hidden: [
      { args: [[]], expected: [] },
      { args: [['X']], expected: [['X']] },
      { args: [['ab', 'AB', 'ba']], expected: [['ab', 'ba'], ['AB']] },
      { args: [['K1', 'K1', '1K']], expected: [['K1', 'K1', '1K']] },
      { args: [['A11', '1A1', '11A', 'A1']], expected: [['A11', '1A1', '11A'], ['A1']] },
      { args: [['ABC', 'ABD', 'CAB', 'DBA', 'BAD']], expected: [['ABC', 'CAB'], ['ABD', 'DBA', 'BAD']] },
      { args: [['P', 'Q', 'R']], expected: [['P'], ['Q'], ['R']] },
    ],
    scale: { args: [{ t: 'strs', wordLen: 4, alphabet: 'ABC123' }] },
    reference: {
      code: `function groupSkus(skus) {
  const groups = new Map()
  for (const sku of skus) {
    const key = sku.split('').sort().join('')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(sku)
  }
  return [...groups.values()]
}`,
      approach:
        'Rearrangements share the same sorted character sequence, so that sorted string is a key. Put every SKU into a hash map under its key and return the map\'s lists. With SKUs at most 12 characters long each key costs O(1), so the pass is O(n) time and O(n) space.',
    },
  },
  {
    slug: 'order-run-one-backorder',
    title: 'Longest order run with one backorder',
    kind: 'function',
    difficulty: 'hard',
    rating: 1750,
    skillId: 'arrays-hashing',
    topics: ['hashing', 'arrays'],
    roles: ['backend', 'data'],
    statement: `\`orders\` holds the order numbers a shop has shipped, in no particular order and possibly with duplicates. Operations wants the longest **run** of shipped order numbers, where a run may jump over **at most one** missing order number (that order is on backorder).

Formally, a run is a set of distinct shipped order numbers that, sorted ascending, increase by exactly 1 at every step, except that **at most one** step may increase by exactly 2. Return the size of the largest run (the number of shipped order numbers in it; the missing one is not counted). Return 0 for an empty list.

For example, 101, 102, 104, 105 is a run of size 4 (103 is the single backorder), but 1, 2, 4, 5, 7 is not one run, because it skips two numbers.`,
    constraints: [
      '0 ≤ orders.length ≤ 100 000',
      '-10^9 ≤ orders[i] ≤ 10^9',
      'Target O(n): sorting is not required.',
    ],
    hints: [
      'Without the backorder rule, this is "longest block of consecutive numbers". How do you find those blocks in O(n) with a hash set?',
      'A block starts at x exactly when x − 1 is not in the set; from there walk x + 1, x + 2, … to find its end. Each number is walked once.',
      'A run with one gap is two blocks where the second starts at (end of the first) + 2. Store each block\'s length by its start, then for every block look up the block starting at end + 2.',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    parSec: 1800,
    fn: {
      name: 'longestRunWithGap',
      params: [{ name: 'orders', type: 'int[]' }],
      returns: { type: 'int' },
    },
    samples: [
      {
        args: [[104, 101, 102, 107, 105, 110]],
        expected: 4,
        explanation: '101, 102, (103 missing), 104, 105 is a run of 4. Extending to 107 would need a second gap at 106.',
      },
      { args: [[7, 7, 7]], expected: 1 },
    ],
    hidden: [
      { args: [[]], expected: 0 },
      { args: [[42]], expected: 1 },
      { args: [[1, 2, 3, 4]], expected: 4 },
      { args: [[1, 3, 5, 7]], expected: 2 },
      { args: [[10, 12, 13, 14, 16, 17]], expected: 5 },
      { args: [[-3, -1, 0, 1, 5, 6, 8]], expected: 4 },
      { args: [[20, 19, 18, 30, 31, 32, 33, 22, 22]], expected: 4 },
      { args: [[1, 2, 4, 5, 7, 8]], expected: 4 },
      { args: [[1000000000, 999999998, 999999999]], expected: 3 },
      { args: [[5, 5, 6, 6, 8, 8]], expected: 3 },
    ],
    scale: { args: [{ t: 'ints', min: 1, max: 100000 }] },
    reference: {
      code: `function longestRunWithGap(orders) {
  const present = new Set(orders)
  const blockLen = new Map()
  for (const x of present) {
    if (present.has(x - 1)) continue
    let end = x
    while (present.has(end + 1)) end++
    blockLen.set(x, end - x + 1)
  }
  let best = 0
  for (const [start, len] of blockLen) {
    const next = blockLen.get(start + len + 1) || 0
    best = Math.max(best, len + next)
  }
  return best
}`,
      approach:
        'Put the order numbers in a hash set and find every block of consecutive numbers: a block starts where `x − 1` is absent, and walking forward from each start touches every number once. A run with one backorder is a block followed by the block that starts two past its end, so look that block up by its start and add the lengths. Everything is O(n) time and O(n) space.',
    },
  },
]
