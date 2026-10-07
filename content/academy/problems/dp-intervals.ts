import type { ProblemSource } from '@/lib/academy/problems/schema'

/**
 * Dynamic programming and intervals. Original problems written for lee:
 * classic ideas, our own stories, wording, examples and tests.
 */
export const DP_INTERVALS: readonly ProblemSource[] = [
  {
    slug: 'pipeline-stage-paths',
    title: 'Deploy pipeline stage paths',
    kind: 'function',
    difficulty: 'easy',
    rating: 1100,
    skillId: 'recursion-dp',
    topics: ['dp', 'math'],
    roles: ['backend'],
    statement: `A deploy pipeline has \`stages\` stages in a row. A release starts before stage 1 and must finish exactly on the last stage. On each move the release either advances **one** stage or skips ahead **two** stages (a fast-track). Either move is allowed from any stage, as long as the release does not pass the last stage.

Return the number of different move sequences that land exactly on stage \`stages\`. The count grows very fast, so return it **modulo 1 000 000 007**.`,
    constraints: ['1 ≤ stages ≤ 100 000', 'Return the count modulo 1 000 000 007.'],
    hints: [
      'How can a release arrive at stage k? Only from stage k − 1 or stage k − 2.',
      'So ways(k) = ways(k − 1) + ways(k − 2). What are ways(0) and ways(1)?',
      'Keep just the last two values while walking k from 2 up to stages, taking the modulus at every step.',
    ],
    complexity: { time: 'O(n)', space: 'O(1)' },
    parSec: 600,
    fn: {
      name: 'pipelinePaths',
      params: [{ name: 'stages', type: 'int' }],
      returns: { type: 'int' },
    },
    samples: [
      { args: [3], expected: 3, explanation: 'The sequences are 1+1+1, 1+2 and 2+1.' },
      { args: [5], expected: 8 },
    ],
    hidden: [
      { args: [1], expected: 1 },
      { args: [2], expected: 2 },
      { args: [4], expected: 5 },
      { args: [10], expected: 89 },
      { args: [20], expected: 10946 },
      { args: [45], expected: 836311896 },
      { args: [100000], expected: 967618232 },
    ],
    scale: { args: [{ t: 'n' }] },
    reference: {
      code: `function pipelinePaths(stages) {
  const MOD = 1000000007
  let prev = 1
  let curr = 1
  for (let k = 2; k <= stages; k++) {
    const next = (prev + curr) % MOD
    prev = curr
    curr = next
  }
  return curr
}`,
      approach:
        'The last move into stage k comes from stage k − 1 or stage k − 2, so `ways(k) = ways(k − 1) + ways(k − 2)` with `ways(0) = ways(1) = 1`. Walk k upwards keeping only the previous two counts and reduce modulo 1 000 000 007 each step so numbers stay exact. O(n) time, O(1) space.',
    },
  },
  {
    slug: 'non-adjacent-payouts',
    title: 'Non-adjacent payout days',
    kind: 'function',
    difficulty: 'easy',
    rating: 1250,
    skillId: 'recursion-dp',
    topics: ['dp', 'arrays'],
    roles: ['payments'],
    statement: `A marketplace has a payout batch ready for each day in a row: \`amounts[i]\` is the batch for day \`i\`, in cents. A risk rule says the treasury may never release batches on **two consecutive days**. Batches that are not released are simply dropped from this cycle.

Return the largest total, in cents, that can be released while respecting the rule. Releasing nothing is allowed (total 0).`,
    constraints: ['0 ≤ amounts.length ≤ 100 000', '0 ≤ amounts[i] ≤ 10^6'],
    hints: [
      'For each day you either release its batch or you do not.',
      'If you release day i, day i − 1 must be skipped; if you skip day i, the best total is the best up to day i − 1.',
      'best(i) = max(best(i − 1), best(i − 2) + amounts[i]); keep two running values.',
    ],
    complexity: { time: 'O(n)', space: 'O(1)' },
    parSec: 600,
    fn: {
      name: 'maxPayouts',
      params: [{ name: 'amounts', type: 'int[]' }],
      returns: { type: 'int' },
    },
    samples: [
      { args: [[300, 200, 500, 100]], expected: 800, explanation: 'Release days 0 and 2: 300 + 500 = 800.' },
      { args: [[200, 900, 200]], expected: 900 },
    ],
    hidden: [
      { args: [[]], expected: 0 },
      { args: [[450]], expected: 450 },
      { args: [[5, 5]], expected: 5 },
      { args: [[100, 1, 1, 100]], expected: 200 },
      { args: [[0, 0, 0]], expected: 0 },
      { args: [[6, 7, 1, 30, 8, 2, 4]], expected: 41 },
      { args: [[2, 1, 1, 2]], expected: 4 },
      { args: [[1000000, 1000000, 1000000]], expected: 2000000 },
    ],
    scale: { args: [{ t: 'ints', min: 0, max: 10000 }] },
    reference: {
      code: `function maxPayouts(amounts) {
  let skipPrev = 0
  let best = 0
  for (const a of amounts) {
    const next = Math.max(best, skipPrev + a)
    skipPrev = best
    best = next
  }
  return best
}`,
      approach:
        'Let `best(i)` be the largest total using days 0..i. Day i is either skipped (`best(i − 1)`) or released, which forces day i − 1 to be skipped (`best(i − 2) + amounts[i]`). Only the last two values are needed, so one pass gives O(n) time and O(1) space.',
    },
  },
  {
    slug: 'fewest-notes-exact',
    title: 'Fewest notes for an exact payout',
    kind: 'function',
    difficulty: 'medium',
    rating: 1400,
    skillId: 'recursion-dp',
    topics: ['dp'],
    roles: ['payments'],
    statement: `A cash-out kiosk dispenses notes in the denominations listed in \`notes\` (distinct positive values, unlimited supply of each). A customer asks for exactly \`amount\` units.

Return the **smallest number of notes** that add up to exactly \`amount\`, or \`-1\` if no combination does. An amount of 0 needs 0 notes.

Note that always taking the largest note that still fits does not always give the fewest notes.`,
    constraints: [
      '1 ≤ notes.length ≤ 12; notes are distinct',
      '1 ≤ notes[i] ≤ 10 000',
      '0 ≤ amount ≤ 100 000',
    ],
    hints: [
      'Think about the fewest notes for every smaller amount first.',
      'fewest(x) = 1 + min over notes d ≤ x of fewest(x − d), when that sub-amount is payable.',
      'Fill an array of size amount + 1 bottom-up, using a sentinel such as Infinity for unpayable amounts, and map it to -1 at the end.',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    parSec: 1200,
    fn: {
      name: 'fewestNotes',
      params: [
        { name: 'notes', type: 'int[]' },
        { name: 'amount', type: 'int' },
      ],
      returns: { type: 'int' },
    },
    samples: [
      { args: [[5, 10, 25], 40], expected: 3, explanation: '25 + 10 + 5 = 40 uses three notes; no two notes add up to 40.' },
      { args: [[4, 7], 5], expected: -1 },
    ],
    hidden: [
      { args: [[1], 0], expected: 0 },
      { args: [[3], 9], expected: 3 },
      { args: [[3], 10], expected: -1 },
      { args: [[1, 3, 4], 6], expected: 2 },
      { args: [[7, 13], 27], expected: 3 },
      { args: [[2], 1], expected: -1 },
      { args: [[9, 6, 20], 12], expected: 2 },
      { args: [[1, 5, 10, 50], 99], expected: 10 },
      { args: [[11, 1], 100000], expected: 9100 },
    ],
    scale: { args: [{ t: 'const', value: [7, 13, 29, 50, 97] }, { t: 'n', mul: 4, add: 1 }] },
    reference: {
      code: `function fewestNotes(notes, amount) {
  const best = new Array(amount + 1).fill(Infinity)
  best[0] = 0
  for (let x = 1; x <= amount; x++) {
    for (const d of notes) {
      if (d <= x && best[x - d] + 1 < best[x]) best[x] = best[x - d] + 1
    }
  }
  return best[amount] === Infinity ? -1 : best[amount]
}`,
      approach:
        'Bottom-up DP over amounts: `best[x]` is the fewest notes summing to x, with `best[0] = 0`. Each amount tries every denomination d and extends `best[x − d]` by one note. That is O(amount × k) time for k denominations (linear in the amount for a fixed note set) and O(amount) space; unreachable amounts stay at infinity and become -1.',
    },
  },
  {
    slug: 'sku-edit-distance',
    title: 'SKU code edit distance',
    kind: 'function',
    difficulty: 'hard',
    rating: 1700,
    skillId: 'recursion-dp',
    topics: ['dp', 'strings'],
    roles: ['backend', 'data'],
    statement: `The catalogue team migrates product codes and wants to flag codes that changed a lot. Given the old code \`oldCode\` and the new code \`newCode\`, return the **minimum number of single-character edits** that turn \`oldCode\` into \`newCode\`.

An edit is one of:
- insert one character anywhere,
- delete one character,
- replace one character with a different character.

Comparison is case-sensitive. Either code may be empty.`,
    constraints: [
      '0 ≤ oldCode.length, newCode.length ≤ 2 000',
      'Codes contain uppercase letters, digits and hyphens.',
    ],
    hints: [
      'Consider the answer for every pair of prefixes: the first i characters of oldCode and the first j of newCode.',
      'If the last characters match, no edit is needed for them; otherwise the last step was an insert, a delete or a replace.',
      'd[i][j] = d[i−1][j−1] when oldCode[i−1] = newCode[j−1], else 1 + min(d[i−1][j], d[i][j−1], d[i−1][j−1]). Keep only one previous row to save memory.',
    ],
    complexity: { time: 'O(n^2)', space: 'O(n)' },
    parSec: 1800,
    fn: {
      name: 'skuEditDistance',
      params: [
        { name: 'oldCode', type: 'string' },
        { name: 'newCode', type: 'string' },
      ],
      returns: { type: 'int' },
    },
    samples: [
      {
        args: ['KT-450', 'KT450X'],
        expected: 2,
        explanation: 'Delete the hyphen and append X. One edit is not enough because the codes differ in more than one position.',
      },
      { args: ['', 'ABC'], expected: 3 },
    ],
    hidden: [
      { args: ['SKU1', 'SKU1'], expected: 0 },
      { args: ['A', ''], expected: 1 },
      { args: ['ABC', 'XYZ'], expected: 3 },
      { args: ['BOX-12', 'BOX-21'], expected: 2 },
      { args: ['PEN', 'OPEN'], expected: 1 },
      { args: ['MUG-RED-L', 'MUG-BLUE-L'], expected: 4 },
      { args: ['ZX9', 'X9Z'], expected: 2 },
      { args: ['AAAA', 'AA'], expected: 2 },
    ],
    scale: {
      args: [
        { t: 'str', alphabet: 'ABC12-' },
        { t: 'str', alphabet: 'ABC12-' },
      ],
    },
    reference: {
      code: `function skuEditDistance(oldCode, newCode) {
  const m = oldCode.length
  const n = newCode.length
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const curr = new Array(n + 1)
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      if (oldCode[i - 1] === newCode[j - 1]) curr[j] = prev[j - 1]
      else curr[j] = 1 + Math.min(prev[j], curr[j - 1], prev[j - 1])
    }
    prev = curr
  }
  return prev[n]
}`,
      approach:
        'Let `d[i][j]` be the edits needed to turn the first i characters of `oldCode` into the first j of `newCode`; an empty prefix needs j inserts or i deletes. Matching last characters cost nothing, otherwise take one plus the best of delete, insert or replace. Each cell needs only the previous row, so time is O(m × n) and space O(n).',
    },
  },
  {
    slug: 'longest-revenue-climb',
    title: 'Longest revenue climb',
    kind: 'function',
    difficulty: 'hard',
    rating: 1800,
    skillId: 'recursion-dp',
    topics: ['dp', 'binary-search'],
    roles: ['data'],
    statement: `\`revenue[i]\` is a store's revenue for month \`i\`, in cents. An analyst wants the longest "climb": a set of months, kept in their original order but not necessarily consecutive, whose revenues are **strictly increasing**.

Return the length of the longest climb. An empty list has a climb of length 0; any single month is a climb of length 1.

Aim for O(n log n): the input can be long.`,
    constraints: ['0 ≤ revenue.length ≤ 100 000', '-10^9 ≤ revenue[i] ≤ 10^9 (adjustments can make months negative)'],
    hints: [
      'An O(n^2) DP works: for each month, the longest climb ending there extends some earlier, smaller month.',
      'For each climb length L, only the smallest possible last value matters. Those smallest tails form a sorted list.',
      'For each month, binary-search the first tail ≥ the value: replace it, or append if none. The answer is the number of tails.',
    ],
    complexity: { time: 'O(n log n)', space: 'O(n)' },
    parSec: 1800,
    fn: {
      name: 'longestClimb',
      params: [{ name: 'revenue', type: 'int[]' }],
      returns: { type: 'int' },
    },
    samples: [
      {
        args: [[120, 90, 150, 130, 200, 180, 210]],
        expected: 4,
        explanation: 'For example 120, 150, 200, 210 or 90, 130, 180, 210. No five months climb strictly.',
      },
      { args: [[500, 500, 500]], expected: 1 },
    ],
    hidden: [
      { args: [[]], expected: 0 },
      { args: [[42]], expected: 1 },
      { args: [[1, 2, 3, 4, 5]], expected: 5 },
      { args: [[5, 4, 3, 2, 1]], expected: 1 },
      { args: [[3, 1, 4, 1, 5, 9, 2, 6]], expected: 4 },
      { args: [[-5, -3, -10, 0, -1, 2]], expected: 4 },
      { args: [[2, 2, 3, 3, 4, 4]], expected: 3 },
      { args: [[10, 1, 11, 2, 12, 3, 13, 4]], expected: 4 },
    ],
    scale: { args: [{ t: 'ints', min: -1000000000, max: 1000000000 }] },
    reference: {
      code: `function longestClimb(revenue) {
  const tails = []
  for (const v of revenue) {
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (tails[mid] < v) lo = mid + 1
      else hi = mid
    }
    tails[lo] = v
  }
  return tails.length
}`,
      approach:
        '`tails[L]` holds the smallest last value of any strictly increasing climb of length L + 1; it is always sorted. For each value, binary-search the first tail that is ≥ it and overwrite it (or append when the value beats every tail). The number of tails is the answer: O(n log n) time, O(n) space.',
    },
  },
  {
    slug: 'interview-room-count',
    title: 'Interview rooms needed',
    kind: 'function',
    difficulty: 'medium',
    rating: 1450,
    skillId: 'sorting-searching',
    topics: ['intervals', 'sorting', 'greedy'],
    roles: ['backend'],
    statement: `A hiring day has interviews \`slots[i] = [start, end]\`, in minutes since midnight. Each interview needs its own room for the half-open range \`[start, end)\`: a room freed at minute 600 can host an interview starting at minute 600.

Return the **minimum number of rooms** needed so that every interview gets a room. With no interviews, return 0. Slots are not sorted.`,
    constraints: ['0 ≤ slots.length ≤ 100 000', '0 ≤ start < end ≤ 10^6'],
    hints: [
      'The answer is the largest number of interviews running at the same moment.',
      'Sort the start times and the end times separately.',
      'Walk the starts in order; if the earliest unfinished end is ≤ the current start, a room is reused (advance the end pointer), otherwise open a new room.',
    ],
    complexity: { time: 'O(n log n)', space: 'O(n)' },
    parSec: 1200,
    fn: {
      name: 'roomsNeeded',
      params: [{ name: 'slots', type: 'int[][]' }],
      returns: { type: 'int' },
    },
    samples: [
      {
        args: [[[540, 600], [570, 630], [600, 660]]],
        expected: 2,
        explanation: 'From 570 to 600 two interviews overlap. At 600 the first room frees up just as the third interview starts.',
      },
      { args: [[[60, 120], [0, 30]]], expected: 1 },
    ],
    hidden: [
      { args: [[]], expected: 0 },
      { args: [[[0, 10]]], expected: 1 },
      { args: [[[0, 10], [0, 10], [0, 10]]], expected: 3 },
      { args: [[[0, 5], [5, 10], [10, 15]]], expected: 1 },
      { args: [[[1, 10], [2, 3], [4, 5], [6, 7]]], expected: 2 },
      { args: [[[0, 30], [5, 10], [15, 20], [8, 16]]], expected: 3 },
      { args: [[[100, 200], [150, 250], [180, 190], [185, 195], [300, 400]]], expected: 4 },
    ],
    scale: { args: [{ t: 'intervals', maxLen: 1000 }] },
    reference: {
      code: `function roomsNeeded(slots) {
  const starts = slots.map((s) => s[0]).sort((a, b) => a - b)
  const ends = slots.map((s) => s[1]).sort((a, b) => a - b)
  let rooms = 0
  let j = 0
  for (const start of starts) {
    if (j < ends.length && ends[j] <= start) j++
    else rooms++
  }
  return rooms
}`,
      approach:
        'Sort starts and ends separately. Sweep the starts in order: if the earliest end not yet used is at or before this start, that room is free and gets reused; otherwise a new room opens. The room count equals the peak overlap. Sorting dominates: O(n log n) time, O(n) space.',
    },
  },
  {
    slug: 'insert-maintenance-window',
    title: 'Insert a maintenance window',
    kind: 'function',
    difficulty: 'medium',
    rating: 1400,
    skillId: 'sorting-searching',
    topics: ['intervals', 'arrays'],
    roles: ['backend'],
    statement: `An ops calendar holds planned maintenance windows \`windows[i] = [start, end]\` (inclusive minutes, \`start ≤ end\`). The list is sorted by start, and no two windows overlap or touch.

A new window \`add = [start, end]\` is scheduled. Insert it and return the updated calendar: sorted by start, with every pair of windows that **overlap or touch** (one ends at the minute the other starts, or later) merged into a single window. Do not modify the input arrays.`,
    constraints: [
      '0 ≤ windows.length ≤ 100 000',
      '0 ≤ start ≤ end ≤ 10^9',
      'windows is sorted by start; its windows neither overlap nor touch.',
    ],
    hints: [
      'Windows split into three groups: entirely before add, overlapping or touching add, and entirely after add.',
      'A window is entirely before add when its end < add.start, and entirely after when its start > add.end.',
      'Copy the first group, fold the middle group into one window with min start and max end, then copy the rest. One pass.',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    parSec: 1200,
    fn: {
      name: 'insertWindow',
      params: [
        { name: 'windows', type: 'int[][]' },
        { name: 'add', type: 'int[]' },
      ],
      returns: { type: 'int[][]' },
    },
    samples: [
      {
        args: [[[60, 120], [300, 360], [600, 660]], [100, 320]],
        expected: [[60, 360], [600, 660]],
        explanation: '[100, 320] overlaps both [60, 120] and [300, 360], so all three become [60, 360].',
      },
      { args: [[], [5, 10]], expected: [[5, 10]] },
    ],
    hidden: [
      { args: [[[10, 20]], [30, 40]], expected: [[10, 20], [30, 40]] },
      { args: [[[30, 40]], [10, 20]], expected: [[10, 20], [30, 40]] },
      { args: [[[10, 20], [30, 40]], [20, 30]], expected: [[10, 40]] },
      { args: [[[10, 20], [30, 40], [50, 60]], [0, 100]], expected: [[0, 100]] },
      { args: [[[10, 20], [50, 60]], [25, 30]], expected: [[10, 20], [25, 30], [50, 60]] },
      { args: [[[10, 20]], [12, 15]], expected: [[10, 20]] },
      { args: [[[0, 5], [10, 15], [20, 25], [30, 35]], [12, 22]], expected: [[0, 5], [10, 25], [30, 35]] },
      { args: [[[100, 200]], [200, 200]], expected: [[100, 200]] },
    ],
    scale: { args: [{ t: 'intervals', maxLen: 3 }, { t: 'const', value: [5, 50] }] },
    reference: {
      code: `function insertWindow(windows, add) {
  const out = []
  let i = 0
  while (i < windows.length && windows[i][1] < add[0]) {
    out.push([windows[i][0], windows[i][1]])
    i++
  }
  let start = add[0]
  let end = add[1]
  while (i < windows.length && windows[i][0] <= end) {
    start = Math.min(start, windows[i][0])
    end = Math.max(end, windows[i][1])
    i++
  }
  out.push([start, end])
  while (i < windows.length) {
    out.push([windows[i][0], windows[i][1]])
    i++
  }
  return out
}`,
      approach:
        'Because the calendar is sorted and disjoint, one pass suffices: copy windows that end before the new one starts, absorb every window that starts at or before the growing merged end (taking the min start and max end), then copy the remainder. O(n) time and O(n) space for the new list.',
    },
  },
  {
    slug: 'max-room-bookings',
    title: 'Most bookings in one room',
    kind: 'function',
    difficulty: 'medium',
    rating: 1500,
    skillId: 'sorting-searching',
    topics: ['intervals', 'greedy', 'sorting'],
    roles: ['backend'],
    statement: `A co-working space has a single meeting room and a list of booking requests \`requests[i] = [start, end]\`, each occupying the half-open range \`[start, end)\`. Back-to-back bookings are fine (one may end at 11 and the next start at 11), but accepted bookings may not overlap.

Return the **largest number of requests** that can be accepted. Requests are not sorted; with no requests, return 0.`,
    constraints: ['0 ≤ requests.length ≤ 100 000', '0 ≤ start < end ≤ 10^9'],
    hints: [
      'Which booking should you accept first to leave the most room for the rest?',
      'The booking that ends earliest never hurts: any optimal plan can swap its first booking for it.',
      'Sort by end time and accept each request whose start is ≥ the end of the last accepted one.',
    ],
    complexity: { time: 'O(n log n)', space: 'O(n)' },
    parSec: 1200,
    fn: {
      name: 'maxBookings',
      params: [{ name: 'requests', type: 'int[][]' }],
      returns: { type: 'int' },
    },
    samples: [
      {
        args: [[[9, 12], [10, 11], [11, 14], [13, 15]]],
        expected: 2,
        explanation: 'Accept [10, 11] then [11, 14]. Every set of three overlaps somewhere.',
      },
      { args: [[[1, 2], [2, 3], [3, 4]]], expected: 3 },
    ],
    hidden: [
      { args: [[]], expected: 0 },
      { args: [[[5, 6]]], expected: 1 },
      { args: [[[0, 100], [1, 2], [3, 4], [5, 6]]], expected: 3 },
      { args: [[[1, 5], [1, 5], [1, 5]]], expected: 1 },
      { args: [[[1, 3], [2, 4], [3, 5], [4, 6]]], expected: 2 },
      { args: [[[7, 9], [1, 4], [4, 7], [2, 3], [3, 8]]], expected: 3 },
      { args: [[[0, 10], [10, 20], [5, 15], [15, 25], [20, 30]]], expected: 3 },
    ],
    scale: { args: [{ t: 'intervals', maxLen: 1000 }] },
    reference: {
      code: `function maxBookings(requests) {
  const sorted = [...requests].sort((a, b) => a[1] - b[1])
  let count = 0
  let lastEnd = -Infinity
  for (const [start, end] of sorted) {
    if (start >= lastEnd) {
      count++
      lastEnd = end
    }
  }
  return count
}`,
      approach:
        'Greedy by earliest end: sort a copy of the requests by end time and accept each one that starts at or after the end of the last accepted booking. Choosing the earliest-ending booking first is always safe by an exchange argument. Sorting makes it O(n log n) time with O(n) space for the copy.',
    },
  },
]
