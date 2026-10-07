import type { ProblemSource } from '@/lib/academy/problems/schema'

/**
 * Two pointers and sliding windows. Original problems written for lee:
 * classic ideas, our own stories, wording, examples and tests.
 */
export const TWO_POINTERS_WINDOW: readonly ProblemSource[] = [
  // --- two pointers -----------------------------------------------------------
  {
    slug: 'mirrored-reference-code',
    title: 'Mirrored reference code',
    kind: 'function',
    difficulty: 'easy',
    rating: 1100,
    skillId: 'arrays-hashing',
    topics: ['two-pointers', 'strings'],
    roles: ['payments'],
    statement: `A bank's anti-typo check flags payment reference codes that read the same forwards and backwards, because operators tend to mistype them.

Given \`code\`, decide whether it is **mirrored**: keep only the ASCII letters and digits, treat upper- and lower-case letters as equal, and check whether the result reads the same in both directions. Every other character (dashes, slashes, dots, spaces, …) is ignored. A code with no letters or digits at all counts as mirrored.

Return \`true\` or \`false\`.`,
    constraints: [
      '0 ≤ code.length ≤ 200 000',
      'code contains printable ASCII characters only.',
      'Aim for O(1) extra space: do not build a cleaned copy.',
    ],
    hints: [
      'Compare the first meaningful character with the last one, then move inwards.',
      'Use one index from the left and one from the right; skip characters that are not letters or digits.',
      'Lower-case both characters before comparing; stop as soon as they differ or the indices cross.',
    ],
    complexity: { time: 'O(n)', space: 'O(1)' },
    parSec: 600,
    fn: {
      name: 'isMirroredCode',
      params: [{ name: 'code', type: 'string' }],
      returns: { type: 'bool' },
    },
    samples: [
      {
        args: ['RF-7a/A7-fr'],
        expected: true,
        explanation: 'Keeping letters and digits and lower-casing gives "rf7aa7fr", which reads the same backwards.',
      },
      { args: ['INV-2024-02'], expected: false },
    ],
    hidden: [
      { args: [''], expected: true },
      { args: ['--//'], expected: true },
      { args: ['a'], expected: true },
      { args: ['Ab'], expected: false },
      { args: ['aB-bA'], expected: true },
      { args: ['12.3.21'], expected: true },
      { args: ['123.12'], expected: false },
      { args: ['Zz'], expected: true },
      { args: ['x1y-Y1X'], expected: true },
      { args: ['0P'], expected: false },
    ],
    scale: { args: [{ t: 'str', alphabet: 'a-.' }] },
    reference: {
      code: `function isMirroredCode(code) {
  const keep = (ch) => /[A-Za-z0-9]/.test(ch)
  let i = 0
  let j = code.length - 1
  while (i < j) {
    if (!keep(code[i])) { i++; continue }
    if (!keep(code[j])) { j--; continue }
    if (code[i].toLowerCase() !== code[j].toLowerCase()) return false
    i++
    j--
  }
  return true
}`,
      approach:
        'Walk one index in from the left and one from the right, skipping characters that are not letters or digits. Compare the two kept characters case-insensitively; any mismatch means the code is not mirrored. Each character is visited at most once: O(n) time, O(1) space.',
    },
  },
  {
    slug: 'widest-rack-link',
    title: 'Widest link between two racks',
    kind: 'function',
    difficulty: 'medium',
    rating: 1400,
    skillId: 'arrays-hashing',
    topics: ['two-pointers', 'greedy', 'arrays'],
    roles: ['backend'],
    statement: `Server racks stand in a row at positions \`0 … n − 1\`. Rack \`i\` has an uplink of capacity \`caps[i]\`. A dedicated link between racks \`i < j\` is cabled along every position between them, and its throughput is limited by the weaker end and grows with the cable length:

\`throughput(i, j) = min(caps[i], caps[j]) × (j − i)\`

Return the largest throughput any single link can achieve.`,
    constraints: [
      '2 ≤ caps.length ≤ 100 000',
      '0 ≤ caps[i] ≤ 10 000',
      'Aim for better than checking every pair.',
    ],
    hints: [
      'Start with the widest possible link, between the first and last rack.',
      'Moving the end with the larger capacity inwards can never help: the length shrinks and the minimum cannot rise above the other end.',
      'Keep two pointers at the ends; record the throughput, then move the pointer at the smaller capacity inwards until they meet.',
    ],
    complexity: { time: 'O(n)', space: 'O(1)' },
    parSec: 1200,
    fn: {
      name: 'maxLinkThroughput',
      params: [{ name: 'caps', type: 'int[]' }],
      returns: { type: 'int' },
    },
    samples: [
      {
        args: [[3, 9, 4, 8, 2, 6]],
        expected: 24,
        explanation: 'Racks 1 and 5: min(9, 6) × (5 − 1) = 24. Racks 1 and 3 only give min(9, 8) × 2 = 16.',
      },
      { args: [[5, 5]], expected: 5 },
    ],
    hidden: [
      { args: [[1, 1]], expected: 1 },
      { args: [[0, 10, 0]], expected: 0 },
      { args: [[4, 4, 4, 4]], expected: 12 },
      { args: [[1, 2, 3, 4, 5]], expected: 6 },
      { args: [[10, 1, 1, 1, 1, 10]], expected: 50 },
      { args: [[2, 7, 1, 7, 2]], expected: 14 },
      { args: [[10000, 1, 10000]], expected: 20000 },
      { args: [[6, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]], expected: 11 },
    ],
    scale: { args: [{ t: 'ints', min: 1, max: 10000 }] },
    reference: {
      code: `function maxLinkThroughput(caps) {
  let i = 0
  let j = caps.length - 1
  let best = 0
  while (i < j) {
    best = Math.max(best, Math.min(caps[i], caps[j]) * (j - i))
    if (caps[i] < caps[j]) i++
    else j--
  }
  return best
}`,
      approach:
        'Start with pointers at both ends. The weaker end limits every link that keeps it while moving the other pointer inwards, so after recording the current throughput that weaker end can be discarded. Each step discards one rack: O(n) time, O(1) space.',
    },
  },
  {
    slug: 'offsetting-ledger-triples',
    title: 'Offsetting ledger triples',
    kind: 'function',
    difficulty: 'medium',
    rating: 1550,
    skillId: 'arrays-hashing',
    topics: ['two-pointers', 'sorting', 'arrays'],
    roles: ['payments'],
    statement: `An auditor looks for sets of three ledger adjustments that cancel each other out exactly. \`adjustments\` holds the adjustment amounts in cents (positive or negative, possibly repeated).

Return every **distinct** triple of values \`[a, b, c]\` with \`a ≤ b ≤ c\` and \`a + b + c = 0\`, where the three values come from three **different positions** of \`adjustments\`. Each triple must be listed with its values in ascending order and must appear only once, even if it can be formed from several positions. **Any order of the triples is accepted.** If there is none, return an empty list.`,
    constraints: [
      '0 ≤ adjustments.length ≤ 3 000',
      '-10^9 ≤ adjustments[i] ≤ 10^9',
    ],
    hints: [
      'Sorting the amounts makes both the search and the de-duplication easier.',
      'Fix the smallest value a; the other two must add up to −a. In a sorted list, how do you find all pairs with a given sum without a hash map?',
      'Two pointers after a: move the left one up when the sum is too small and the right one down when too large. Skip equal neighbours (for a, and after each found triple) to avoid duplicates.',
    ],
    complexity: { time: 'O(n^2)', space: 'O(n)' },
    parSec: 1200,
    fn: {
      name: 'zeroSumTriples',
      params: [{ name: 'adjustments', type: 'int[]' }],
      returns: { type: 'int[][]' },
    },
    compare: { mode: 'unordered' },
    samples: [
      {
        args: [[-100, 50, 50, 0, 100, -50]],
        expected: [[-100, 0, 100], [-100, 50, 50], [-50, 0, 50]],
        explanation: 'Sorted: −100, −50, 0, 50, 50, 100. −100 pairs with 0 + 100 and with 50 + 50 (two different 50s); −50 pairs with 0 + 50.',
      },
      { args: [[1, 2, -4]], expected: [] },
    ],
    hidden: [
      { args: [[0, 0, 0]], expected: [[0, 0, 0]] },
      { args: [[0, 0, 0, 0]], expected: [[0, 0, 0]] },
      { args: [[0, 0]], expected: [] },
      { args: [[]], expected: [] },
      {
        args: [[-500, 200, 300, -200, 0, 500, -300]],
        expected: [[-500, 0, 500], [-500, 200, 300], [-300, -200, 500], [-300, 0, 300], [-200, 0, 200]],
      },
      { args: [[-2, -2, 4, 1, 1]], expected: [[-2, -2, 4], [-2, 1, 1]] },
      { args: [[3, -1, -2, 5, -4, 1]], expected: [[-4, -1, 5], [-4, 1, 3], [-2, -1, 3]] },
      { args: [[1000000000, -1000000000, 0, -1, 1]], expected: [[-1000000000, 0, 1000000000], [-1, 0, 1]] },
      { args: [[5, 5, 5]], expected: [] },
    ],
    scale: { args: [{ t: 'ints', min: -1000000000, max: 1000000000 }] },
    reference: {
      code: `function zeroSumTriples(adjustments) {
  const a = [...adjustments].sort((x, y) => x - y)
  const out = []
  for (let i = 0; i < a.length - 2; i++) {
    if (i > 0 && a[i] === a[i - 1]) continue
    let lo = i + 1
    let hi = a.length - 1
    while (lo < hi) {
      const sum = a[i] + a[lo] + a[hi]
      if (sum < 0) lo++
      else if (sum > 0) hi--
      else {
        out.push([a[i], a[lo], a[hi]])
        lo++
        hi--
        while (lo < hi && a[lo] === a[lo - 1]) lo++
        while (lo < hi && a[hi] === a[hi + 1]) hi--
      }
    }
  }
  return out
}`,
      approach:
        'Sort a copy, then fix each distinct smallest value and find the pairs after it that sum to its negation with two pointers moving inwards. Skipping equal neighbours, both for the fixed value and after each match, keeps every triple unique. The sort is O(n log n) and the scans are O(n) each, so O(n^2) time and O(n) space for the copy.',
    },
  },
  {
    slug: 'backfill-under-peaks',
    title: 'Backfill under the peaks',
    kind: 'function',
    difficulty: 'hard',
    rating: 1750,
    skillId: 'arrays-hashing',
    topics: ['two-pointers', 'arrays'],
    roles: ['backend'],
    statement: `A batch scheduler plots \`load[i]\`, the number of jobs already booked for hour \`i\` of the day. Deferred jobs may be backfilled into quiet hours, but an hour may only be raised up to the **lower** of two ceilings: the highest load at or before it, and the highest load at or after it (so backfill never creates a new peak on either side).

For hour \`i\` that allows \`min(maxLeft(i), maxRight(i)) − load[i]\` extra jobs, where \`maxLeft(i)\` is the maximum of \`load[0..i]\` and \`maxRight(i)\` the maximum of \`load[i..n−1]\`. Return the total number of jobs that can be backfilled across the whole day. An empty \`load\` gives 0.`,
    constraints: [
      '0 ≤ load.length ≤ 100 000',
      '0 ≤ load[i] ≤ 10 000',
      'Aim for O(n) time and O(1) extra space.',
    ],
    hints: [
      'With two extra arrays (running maximum from the left, and from the right) the answer is a single pass. Can you avoid the arrays?',
      'Keep one pointer at each end and the best maximum seen from each side. The side with the smaller maximum already knows its ceiling.',
      'If leftMax ≤ rightMax, the left hour\'s ceiling is leftMax (the right side is at least that high): add leftMax − load[left] and move left; otherwise do the same on the right.',
    ],
    complexity: { time: 'O(n)', space: 'O(1)' },
    parSec: 1800,
    fn: {
      name: 'backfillCapacity',
      params: [{ name: 'load', type: 'int[]' }],
      returns: { type: 'int' },
    },
    samples: [
      {
        args: [[4, 1, 3, 0, 2, 5, 1]],
        expected: 10,
        explanation: 'Hours 1–4 sit under min(4, 5) = 4: they take 3 + 1 + 4 + 2 = 10. Hours 0, 5 and 6 cannot be raised.',
      },
      { args: [[1, 2, 3]], expected: 0 },
    ],
    hidden: [
      { args: [[]], expected: 0 },
      { args: [[7]], expected: 0 },
      { args: [[3, 0, 3]], expected: 3 },
      { args: [[5, 4, 3, 2, 1]], expected: 0 },
      { args: [[2, 0, 2, 0, 2]], expected: 4 },
      { args: [[0, 3, 0, 1, 0, 3, 0]], expected: 8 },
      { args: [[5, 1, 1, 1, 1, 1, 4]], expected: 15 },
      { args: [[1, 0, 0, 0, 0, 10000]], expected: 4 },
      { args: [[6, 6, 6]], expected: 0 },
      { args: [[4, 2, 0, 3, 2, 5]], expected: 9 },
    ],
    scale: { args: [{ t: 'ints', min: 0, max: 10000 }] },
    reference: {
      code: `function backfillCapacity(load) {
  let left = 0
  let right = load.length - 1
  let leftMax = 0
  let rightMax = 0
  let total = 0
  while (left <= right) {
    leftMax = Math.max(leftMax, load[left])
    rightMax = Math.max(rightMax, load[right])
    if (leftMax <= rightMax) {
      total += leftMax - load[left]
      left++
    } else {
      total += rightMax - load[right]
      right--
    }
  }
  return total
}`,
      approach:
        'Move two pointers inwards while tracking the highest load seen from each side. Whichever side has the smaller running maximum knows its exact ceiling, because the other side already has something at least as high, so add the gap for that hour and step inwards. Every hour is settled once: O(n) time and O(1) space.',
    },
  },

  // --- sliding window ---------------------------------------------------------
  {
    slug: 'busiest-minute-stretch',
    title: 'Busiest stretch of minutes',
    kind: 'function',
    difficulty: 'easy',
    rating: 1150,
    skillId: 'arrays-hashing',
    topics: ['sliding-window', 'arrays'],
    roles: ['backend', 'apis'],
    statement: `\`requests[i]\` is the number of API requests received during minute \`i\`. Capacity planning needs the busiest stretch of exactly \`k\` consecutive minutes.

Return the largest total number of requests over any \`k\` consecutive minutes.`,
    constraints: [
      '1 ≤ k ≤ requests.length ≤ 100 000',
      '0 ≤ requests[i] ≤ 10^9',
    ],
    hints: [
      'Adding up every window from scratch repeats almost all of the work.',
      'When the window slides one minute to the right, only two numbers change.',
      'Keep the window total: add the minute entering on the right, subtract the one leaving on the left, and track the maximum.',
    ],
    complexity: { time: 'O(n)', space: 'O(1)' },
    parSec: 600,
    fn: {
      name: 'busiestStretch',
      params: [
        { name: 'requests', type: 'int[]' },
        { name: 'k', type: 'int' },
      ],
      returns: { type: 'int' },
    },
    samples: [
      {
        args: [[12, 40, 7, 33, 50, 2], 3],
        expected: 90,
        explanation: 'The 3-minute totals are 59, 80, 90 and 85; minutes 2–4 (7 + 33 + 50) are the busiest.',
      },
      { args: [[5], 1], expected: 5 },
    ],
    hidden: [
      { args: [[1, 2, 3, 4], 4], expected: 10 },
      { args: [[9, 1, 1, 9], 1], expected: 9 },
      { args: [[0, 0, 0], 2], expected: 0 },
      { args: [[3, 8, 1, 9, 2], 2], expected: 11 },
      { args: [[100, 1, 1, 1, 100, 100], 2], expected: 200 },
      { args: [[1000000000, 1000000000, 1000000000], 2], expected: 2000000000 },
      { args: [[6, 2, 6, 2, 6], 3], expected: 14 },
    ],
    scale: { args: [{ t: 'ints', min: 0, max: 100000 }, { t: 'const', value: 128 }] },
    reference: {
      code: `function busiestStretch(requests, k) {
  let sum = 0
  for (let i = 0; i < k; i++) sum += requests[i]
  let best = sum
  for (let i = k; i < requests.length; i++) {
    sum += requests[i] - requests[i - k]
    if (sum > best) best = sum
  }
  return best
}`,
      approach:
        'Sum the first `k` minutes, then slide the window one minute at a time: add the new minute and subtract the one that left, keeping the best total. Each minute enters and leaves once: O(n) time, O(1) space.',
    },
  },
  {
    slug: 'longest-fresh-session',
    title: 'Longest session with no repeat page',
    kind: 'function',
    difficulty: 'medium',
    rating: 1400,
    skillId: 'arrays-hashing',
    topics: ['sliding-window', 'hashing', 'strings'],
    roles: ['backend', 'data'],
    statement: `Product analytics records the pages one visitor opened, in order, as \`pages\` (paths such as \`"/cart"\`). A **fresh stretch** is a run of consecutive entries in which no page is opened twice.

Return the length of the longest fresh stretch. Paths are compared exactly (case-sensitive). An empty list gives 0.`,
    constraints: [
      '0 ≤ pages.length ≤ 100 000',
      '1 ≤ pages[i].length ≤ 40',
    ],
    hints: [
      'If a stretch has a repeat, every longer stretch containing it also has one.',
      'Grow a window to the right; when the new page is already inside the window, shrink it from the left until it is not.',
      'Remember the last index of each page in a hash map so the left edge can jump straight past the earlier copy.',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    parSec: 1200,
    fn: {
      name: 'longestFreshStretch',
      params: [{ name: 'pages', type: 'string[]' }],
      returns: { type: 'int' },
    },
    samples: [
      {
        args: [['/home', '/cart', '/pay', '/cart', '/done', '/home']],
        expected: 4,
        explanation: 'Entries 2–5 (/pay, /cart, /done, /home) contain no repeat. Any stretch of 5 contains /cart or /home twice.',
      },
      { args: [['/a', '/a']], expected: 1 },
    ],
    hidden: [
      { args: [[]], expected: 0 },
      { args: [['/x']], expected: 1 },
      { args: [['/a', '/b', '/c']], expected: 3 },
      { args: [['/a', '/b', '/a', '/b', '/a']], expected: 2 },
      { args: [['/a', '/b', '/c', '/a', '/d', '/e']], expected: 5 },
      { args: [['/p', '/q', '/q', '/r', '/s', '/q']], expected: 3 },
      { args: [['/a', '/b', '/c', '/d', '/c', '/b', '/a']], expected: 4 },
      { args: [['/Home', '/home']], expected: 2 },
    ],
    scale: { args: [{ t: 'strs', wordLen: 2, alphabet: 'abcdefgh' }] },
    reference: {
      code: `function longestFreshStretch(pages) {
  const lastSeen = new Map()
  let left = 0
  let best = 0
  for (let right = 0; right < pages.length; right++) {
    const prev = lastSeen.get(pages[right])
    if (prev !== undefined && prev >= left) left = prev + 1
    lastSeen.set(pages[right], right)
    best = Math.max(best, right - left + 1)
  }
  return best
}`,
      approach:
        'Slide a window over the visits. A hash map stores the last index of each page; when the incoming page was last seen inside the window, move the left edge just past that copy. The window is always repeat-free and every index moves forward only: O(n) time, O(n) space.',
    },
  },
  {
    slug: 'failure-budget-run',
    title: 'Longest run within the failure budget',
    kind: 'function',
    difficulty: 'medium',
    rating: 1450,
    skillId: 'arrays-hashing',
    topics: ['sliding-window', 'arrays'],
    roles: ['backend', 'apis'],
    statement: `\`statuses\` lists the HTTP status codes of consecutive requests to a service. A request **failed** when its status is **500 or above**; everything else (2xx, 3xx, 4xx) counts as served.

An SLO report wants the longest run of consecutive requests that contains **at most \`k\`** failed requests. Return its length (0 for an empty list).`,
    constraints: [
      '0 ≤ statuses.length ≤ 100 000',
      '100 ≤ statuses[i] ≤ 599',
      '0 ≤ k ≤ 100 000',
    ],
    hints: [
      'A run that is valid stays valid if you drop its first request, so the left edge only ever needs to move right.',
      'Grow a window to the right, counting failures inside it.',
      'Whenever the window holds more than k failures, advance the left edge (decrementing the count when a failure leaves) until it is valid again; track the widest valid window.',
    ],
    complexity: { time: 'O(n)', space: 'O(1)' },
    parSec: 1200,
    fn: {
      name: 'longestTolerantRun',
      params: [
        { name: 'statuses', type: 'int[]' },
        { name: 'k', type: 'int' },
      ],
      returns: { type: 'int' },
    },
    samples: [
      {
        args: [[200, 503, 200, 200, 500, 200, 502, 200], 1],
        expected: 4,
        explanation: 'Failures are at positions 1, 4 and 6. Positions 0–3 hold one failure (length 4); so do 2–5. Any 5 consecutive requests contain two failures.',
      },
      { args: [[500, 500, 500], 0], expected: 0 },
    ],
    hidden: [
      { args: [[], 2], expected: 0 },
      { args: [[200, 201, 204], 0], expected: 3 },
      { args: [[500], 1], expected: 1 },
      { args: [[500, 200, 500, 200, 500], 2], expected: 4 },
      { args: [[200, 500, 200, 500, 200, 500, 200], 1], expected: 3 },
      { args: [[404, 429, 499, 500, 404], 0], expected: 3 },
      { args: [[503, 503, 200, 200, 200, 503, 200, 200], 2], expected: 7 },
      { args: [[200, 500, 500, 200], 5], expected: 4 },
    ],
    scale: { args: [{ t: 'ints', min: 200, max: 599 }, { t: 'const', value: 10 }] },
    reference: {
      code: `function longestTolerantRun(statuses, k) {
  let left = 0
  let failed = 0
  let best = 0
  for (let right = 0; right < statuses.length; right++) {
    if (statuses[right] >= 500) failed++
    while (failed > k) {
      if (statuses[left] >= 500) failed--
      left++
    }
    best = Math.max(best, right - left + 1)
  }
  return best
}`,
      approach:
        'Grow a window one request at a time and count the failures inside it. When the count exceeds `k`, move the left edge right until enough failures have left. Both edges only move forward, so the scan is O(n) time with O(1) space.',
    },
  },
  {
    slug: 'shortest-covering-log-slice',
    title: 'Shortest log slice covering every service',
    kind: 'function',
    difficulty: 'hard',
    rating: 1800,
    skillId: 'arrays-hashing',
    topics: ['sliding-window', 'hashing', 'strings'],
    roles: ['backend'],
    statement: `During an incident review you have a merged log where \`logs[i]\` is the name of the service that wrote line \`i\`. To reproduce the failure you need the **shortest** contiguous slice of lines that contains at least one line from **every** service in \`required\`.

Return the slice as \`[start, end]\` (0-based, both inclusive). If several slices share the shortest length, return the one with the **smallest \`start\`**. If no slice contains every required service, return an empty list \`[]\`.`,
    constraints: [
      '0 ≤ logs.length ≤ 100 000',
      '1 ≤ required.length ≤ 1 000, and its names are distinct',
      'Service names are 1–30 characters and compared exactly.',
    ],
    hints: [
      'If a slice covers every service, so does any longer slice that contains it. Think about growing on the right and shrinking on the left.',
      'Keep, for the current window, a count per required service and how many required services are still missing.',
      'Extend the right edge; whenever nothing is missing, record the window if it is strictly shorter than the best so far, then drop lines from the left until a required service goes missing again.',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    parSec: 1800,
    fn: {
      name: 'shortestCoveringSlice',
      params: [
        { name: 'logs', type: 'string[]' },
        { name: 'required', type: 'string[]' },
      ],
      returns: { type: 'int[]' },
    },
    samples: [
      {
        args: [['api', 'db', 'api', 'cache', 'queue', 'db', 'api', 'cache'], ['db', 'cache']],
        expected: [1, 3],
        explanation: 'Lines 1–3, 3–5 and 5–7 all cover db and cache in 3 lines; [1, 3] starts earliest. No 2-line slice has both.',
      },
      { args: [['api', 'api'], ['db']], expected: [] },
    ],
    hidden: [
      { args: [[], ['api']], expected: [] },
      { args: [['db'], ['db']], expected: [0, 0] },
      { args: [['a', 'b', 'c'], ['c', 'a']], expected: [0, 2] },
      { args: [['auth', 'auth', 'db', 'auth', 'db'], ['auth', 'db']], expected: [1, 2] },
      { args: [['q', 'x', 'y', 'q', 'z', 'x', 'y'], ['x', 'y', 'z']], expected: [4, 6] },
      { args: [['web', 'db', 'web', 'cache', 'db', 'web'], ['web', 'db', 'cache']], expected: [1, 3] },
      { args: [['a', 'b', 'a', 'b'], ['a', 'b', 'c']], expected: [] },
      { args: [['svc1', 'svc2', 'svc3', 'svc2', 'svc1'], ['svc3']], expected: [2, 2] },
      { args: [['x', 'y', 'z', 'x'], ['x', 'y', 'z']], expected: [0, 2] },
    ],
    scale: {
      args: [
        { t: 'strs', wordLen: 1, alphabet: 'abcdefghij' },
        { t: 'const', value: ['a', 'c', 'e', 'g'] },
      ],
    },
    reference: {
      code: `function shortestCoveringSlice(logs, required) {
  const needed = new Set(required)
  const have = new Map()
  let missing = needed.size
  let best = []
  let left = 0
  for (let right = 0; right < logs.length; right++) {
    const s = logs[right]
    if (needed.has(s)) {
      const c = (have.get(s) || 0) + 1
      have.set(s, c)
      if (c === 1) missing--
    }
    while (missing === 0) {
      if (best.length === 0 || right - left < best[1] - best[0]) best = [left, right]
      const t = logs[left]
      if (needed.has(t)) {
        const c = have.get(t) - 1
        have.set(t, c)
        if (c === 0) missing++
      }
      left++
    }
  }
  return best
}`,
      approach:
        'Slide a window over the log, counting lines per required service and tracking how many services are still missing. Each time the window covers everything, record it if it is strictly shorter (so ties keep the earliest start), then shrink from the left until a service goes missing. Both edges only move forward: O(n) time and O(n) space for the counts.',
    },
  },
]
