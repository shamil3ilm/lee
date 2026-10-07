import type { ProblemSource } from '@/lib/academy/problems/schema'

/**
 * Stacks and strings. Original problems written for lee: classic ideas,
 * our own stories, wording, examples and tests.
 */
export const STACKS_STRINGS: readonly ProblemSource[] = [
  {
    slug: 'balanced-config-template',
    title: 'Balanced config template',
    kind: 'function',
    difficulty: 'easy',
    rating: 1100,
    skillId: 'arrays-hashing',
    topics: ['stack', 'strings'],
    roles: ['backend'],
    statement: `Before a deploy renders a config template, a lint step checks that its brackets line up. The template \`template\` may contain round \`()\`, square \`[]\` and curly \`{}\` brackets mixed with any other characters, which are ignored.

Return \`true\` when the brackets are balanced: every opening bracket is closed by a bracket of the same kind, and pairs are properly nested (a pair never closes while a pair opened inside it is still open). Otherwise return \`false\`.

A template with no brackets at all (including the empty string) is balanced.`,
    constraints: [
      '0 ≤ template.length ≤ 100 000',
      'template contains printable ASCII characters.',
    ],
    hints: [
      'The bracket that must close next is always the most recently opened one that is still open.',
      'Keep the open brackets in a stack; a closing bracket must match the top.',
      'Push openers, pop on closers and fail on a mismatch or an empty stack; at the end the stack must be empty.',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    parSec: 600,
    fn: {
      name: 'isBalancedTemplate',
      params: [{ name: 'template', type: 'string' }],
      returns: { type: 'bool' },
    },
    samples: [
      {
        args: ['server { listen [80, 443] (tls) }'],
        expected: true,
        explanation: 'The square and round pairs both open and close inside the curly pair.',
      },
      { args: ['{{ env.PORT }'], expected: false },
    ],
    hidden: [
      { args: [''], expected: true },
      { args: [']'], expected: false },
      { args: ['([)]'], expected: false },
      { args: ['a(b[c{d}e]f)g'], expected: true },
      { args: ['(((('], expected: false },
      { args: ['{[()()]}{}'], expected: true },
      { args: ['}{'], expected: false },
      { args: ['no brackets here'], expected: true },
    ],
    scale: { args: [{ t: 'str', alphabet: '([{' }] },
    reference: {
      code: `function isBalancedTemplate(template) {
  const opener = { ')': '(', ']': '[', '}': '{' }
  const stack = []
  for (const ch of template) {
    if (ch === '(' || ch === '[' || ch === '{') stack.push(ch)
    else if (ch === ')' || ch === ']' || ch === '}') {
      if (stack.length === 0 || stack.pop() !== opener[ch]) return false
    }
  }
  return stack.length === 0
}`,
      approach:
        'Scan once, pushing every opening bracket onto a stack. A closing bracket must match the opener on top of the stack, otherwise the template is unbalanced; other characters are skipped. The template is balanced when the stack is empty at the end. O(n) time and O(n) space for the stack.',
    },
  },
  {
    slug: 'postfix-fee-formula',
    title: 'Postfix fee formula',
    kind: 'function',
    difficulty: 'medium',
    rating: 1400,
    skillId: 'arrays-hashing',
    topics: ['stack', 'parsing', 'math'],
    roles: ['payments'],
    statement: `The pricing service stores each merchant's fee formula in postfix form (operator after its two operands), already split into tokens. For example \`["250", "3", "*", "40", "+"]\` means \`250 * 3 + 40\`.

Each token in \`tokens\` is either an integer literal (it may be negative, like \`"-7"\`) or one of the operators \`+\`, \`-\`, \`*\`, \`/\`. An operator applies to the two values before it: the earlier one is the left operand.

Division is integer division that **truncates toward zero** (so \`-7 / 2\` is \`-3\`, not \`-4\`).

Return the value of the formula as an integer.`,
    constraints: [
      '1 ≤ tokens.length ≤ 10 000',
      'The formula is always valid and never divides by zero.',
      'Every literal, intermediate value and the result fit within ±10^9.',
    ],
    hints: [
      'When you read an operator, its two operands are the two most recent values not yet used.',
      'Keep a stack of values: push numbers, and for an operator pop two values, combine them and push the result.',
      'Pop the right operand first, then the left. Truncate division toward zero explicitly; a floor division is wrong for negative results.',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    parSec: 1200,
    fn: {
      name: 'evalFeeFormula',
      params: [{ name: 'tokens', type: 'string[]' }],
      returns: { type: 'int' },
    },
    samples: [
      {
        args: [['250', '3', '*', '40', '+']],
        expected: 790,
        explanation: '250 × 3 = 750, then 750 + 40 = 790.',
      },
      { args: [['1000', '7', '/', '2', '-']], expected: 140 },
    ],
    hidden: [
      { args: [['42']], expected: 42 },
      { args: [['-7', '2', '/']], expected: -3 },
      { args: [['7', '-2', '/']], expected: -3 },
      { args: [['5', '1', '2', '+', '4', '*', '+', '3', '-']], expected: 14 },
      { args: [['3', '10', '-']], expected: -7 },
      { args: [['0', '5', '/', '9', '+']], expected: 9 },
      { args: [['100', '20', '5', '/', '/']], expected: 25 },
      { args: [['-4', '-6', '*']], expected: 24 },
    ],
    scale: { args: [{ t: 'strs', wordLen: 1, alphabet: '123456789' }] },
    reference: {
      code: `function evalFeeFormula(tokens) {
  const stack = []
  for (const tok of tokens) {
    if (tok === '+' || tok === '-' || tok === '*' || tok === '/') {
      const right = stack.pop()
      const left = stack.pop()
      if (tok === '+') stack.push(left + right)
      else if (tok === '-') stack.push(left - right)
      else if (tok === '*') stack.push(left * right)
      else stack.push(Math.trunc(left / right))
    } else {
      stack.push(parseInt(tok, 10))
    }
  }
  return stack.length ? stack[stack.length - 1] : 0
}`,
      approach:
        'Postfix needs no precedence rules: keep a stack of values, push each literal, and for an operator pop the right then the left operand and push the combined value. Division truncates toward zero. A valid formula leaves exactly one value on the stack. O(n) time, O(n) space.',
    },
  },
  {
    slug: 'days-until-higher-price',
    title: 'Days until a higher price',
    kind: 'function',
    difficulty: 'medium',
    rating: 1500,
    skillId: 'complexity',
    topics: ['stack', 'arrays'],
    roles: ['data'],
    statement: `A treasury desk records one closing price per day in \`prices\` (in cents). For every day, analysts want to know how many days they would have to wait to see a **strictly** higher closing price.

Return an array \`wait\` of the same length where \`wait[i]\` is \`j - i\` for the first day \`j > i\` with \`prices[j] > prices[i]\`, or \`0\` if no later day is higher.`,
    constraints: [
      '0 ≤ prices.length ≤ 100 000',
      '-10^9 ≤ prices[i] ≤ 10^9',
    ],
    hints: [
      'Checking every later day for every day is O(n²). Which days are still waiting for their answer at any moment?',
      'The days still waiting always have non-increasing prices, so they fit in a stack.',
      'Keep a stack of indices. When today beats the price on top, pop it and record today minus that index; repeat, then push today.',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    parSec: 1200,
    fn: {
      name: 'daysUntilHigher',
      params: [{ name: 'prices', type: 'int[]' }],
      returns: { type: 'int[]' },
    },
    samples: [
      {
        args: [[500, 480, 510, 470, 530]],
        expected: [2, 1, 2, 1, 0],
        explanation: 'Day 0 (500) first sees a higher price on day 2 (510); day 2 waits for day 4 (530); nothing beats 530.',
      },
      { args: [[300, 300, 300]], expected: [0, 0, 0] },
    ],
    hidden: [
      { args: [[]], expected: [] },
      { args: [[9]], expected: [0] },
      { args: [[1, 2, 3, 4]], expected: [1, 1, 1, 0] },
      { args: [[4, 3, 2, 1]], expected: [0, 0, 0, 0] },
      { args: [[5, 1, 1, 1, 6]], expected: [4, 3, 2, 1, 0] },
      { args: [[2, 5, 3, 4, 1, 6]], expected: [1, 4, 1, 2, 1, 0] },
      { args: [[-3, -5, -1]], expected: [2, 1, 0] },
      { args: [[7, 7, 8, 7, 7]], expected: [2, 1, 0, 0, 0] },
    ],
    scale: { args: [{ t: 'ints', min: 1, max: 1000000 }] },
    reference: {
      code: `function daysUntilHigher(prices) {
  const wait = new Array(prices.length).fill(0)
  const stack = []
  for (let i = 0; i < prices.length; i++) {
    while (stack.length && prices[stack[stack.length - 1]] < prices[i]) {
      const day = stack.pop()
      wait[day] = i - day
    }
    stack.push(i)
  }
  return wait
}`,
      approach:
        'Keep a monotonic stack of day indices whose higher price has not appeared yet; their prices never increase from bottom to top. Each new day pops every waiting day with a lower price and records the distance, then waits itself. Every index is pushed and popped at most once, so the scan is O(n) time and O(n) space.',
    },
  },
  {
    slug: 'largest-reservation-block',
    title: 'Largest reservation block',
    kind: 'function',
    difficulty: 'hard',
    rating: 1850,
    skillId: 'complexity',
    topics: ['stack', 'arrays'],
    roles: ['backend'],
    statement: `A batch cluster publishes its free worker capacity per hour as \`free\`, where \`free[i]\` is the number of free units in hour \`i\`.

A reservation books the **same** number of units \`u\` for a run of consecutive hours \`l..r\`. It fits only if every hour in the run has at least \`u\` free units. Its size is \`u × (r - l + 1)\` unit-hours.

Return the size of the largest reservation that fits, or \`0\` if \`free\` is empty or all zeros.`,
    constraints: [
      '0 ≤ free.length ≤ 100 000',
      '0 ≤ free[i] ≤ 10 000',
    ],
    hints: [
      'For a best reservation, u equals the smallest free value in its run. Try each hour as that smallest hour.',
      'For hour i as the minimum, the run extends left and right until a strictly smaller value. A stack finds those boundaries.',
      'Keep a stack of indices with increasing values. When a smaller (or final sentinel 0) value arrives, pop: the popped hour is the minimum of the run between the new top and the current index.',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    parSec: 1800,
    fn: {
      name: 'largestReservation',
      params: [{ name: 'free', type: 'int[]' }],
      returns: { type: 'int' },
    },
    samples: [
      {
        args: [[3, 5, 4, 1, 6]],
        expected: 9,
        explanation: 'Hours 0 to 2 all have at least 3 free units, so 3 units for 3 hours fits: 9 unit-hours. Nothing larger fits.',
      },
      { args: [[2, 0, 2]], expected: 2 },
    ],
    hidden: [
      { args: [[]], expected: 0 },
      { args: [[7]], expected: 7 },
      { args: [[4, 4, 4, 4]], expected: 16 },
      { args: [[1, 2, 3, 4, 5]], expected: 9 },
      { args: [[5, 4, 3, 2, 1]], expected: 9 },
      { args: [[0, 0, 0]], expected: 0 },
      { args: [[3, 8, 7, 8, 2, 9, 9]], expected: 21 },
      { args: [[10000, 10000]], expected: 20000 },
      { args: [[2, 1, 2, 1, 2]], expected: 5 },
    ],
    scale: { args: [{ t: 'ints', min: 0, max: 10000 }] },
    reference: {
      code: `function largestReservation(free) {
  const stack = []
  let best = 0
  for (let i = 0; i <= free.length; i++) {
    const h = i === free.length ? 0 : free[i]
    while (stack.length && free[stack[stack.length - 1]] >= h) {
      const top = stack.pop()
      const left = stack.length ? stack[stack.length - 1] + 1 : 0
      best = Math.max(best, free[top] * (i - left))
    }
    stack.push(i)
  }
  return best
}`,
      approach:
        'The best reservation uses the minimum of its run as `u`, so for each hour find the widest run where it is the minimum. A stack of indices with increasing values gives both boundaries: when a value no larger than the top arrives, the popped hour spans from just after the new top to just before the current index. A sentinel 0 at the end flushes the stack. Each index is pushed and popped once: O(n) time, O(n) space.',
    },
  },
  {
    slug: 'compare-release-versions',
    title: 'Compare release versions',
    kind: 'function',
    difficulty: 'easy',
    rating: 1150,
    skillId: 'arrays-hashing',
    topics: ['strings', 'parsing'],
    roles: ['backend', 'apis'],
    statement: `A client sends its SDK version and the API decides whether it is older than the minimum supported one. Versions are dot-separated non-negative integers such as \`"1.10.2"\`.

Compare \`a\` and \`b\` segment by segment from the left, as numbers (so \`10\` is greater than \`9\`, and \`"01"\` equals \`"1"\`). A missing segment counts as \`0\`, so \`"2"\` equals \`"2.0.0"\`.

Return \`-1\` if \`a\` is older than \`b\`, \`1\` if \`a\` is newer, and \`0\` if they are the same version.`,
    constraints: [
      '1 ≤ a.length, b.length ≤ 500',
      'Each version is digits separated by single dots, with no leading or trailing dot.',
      'A segment may have leading zeros and can be longer than a 32-bit integer.',
    ],
    hints: [
      'Split both versions on dots and walk the segments in step.',
      'Pad the shorter list with "0" segments.',
      'Compare segments numerically: strip leading zeros, then the longer digit string is larger; equal lengths compare character by character.',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    parSec: 600,
    fn: {
      name: 'compareVersions',
      params: [
        { name: 'a', type: 'string' },
        { name: 'b', type: 'string' },
      ],
      returns: { type: 'int' },
    },
    samples: [
      { args: ['1.10.2', '1.9'], expected: 1, explanation: 'The first segments tie at 1; then 10 is greater than 9, so a is newer.' },
      { args: ['2.0.0', '2'], expected: 0 },
    ],
    hidden: [
      { args: ['1.0.1', '1.0.10'], expected: -1 },
      { args: ['3.01', '3.1'], expected: 0 },
      { args: ['0.9', '1'], expected: -1 },
      { args: ['4.2.0.0.1', '4.2'], expected: 1 },
      { args: ['7', '7.0.0.0'], expected: 0 },
      { args: ['10.0', '9.99.99'], expected: 1 },
      { args: ['1.2.3', '1.2.3'], expected: 0 },
      { args: ['0.0.1', '0.1'], expected: -1 },
      { args: ['1.12345678901234567890', '1.12345678901234567891'], expected: -1 },
    ],
    scale: { args: [{ t: 'str', alphabet: '0.' }, { t: 'str', alphabet: '0.' }] },
    reference: {
      code: `function compareVersions(a, b) {
  const pa = a.split('.')
  const pb = b.split('.')
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = stripZeros(i < pa.length ? pa[i] : '0')
    const y = stripZeros(i < pb.length ? pb[i] : '0')
    if (x.length !== y.length) return x.length < y.length ? -1 : 1
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

function stripZeros(s) {
  let i = 0
  while (i < s.length - 1 && s[i] === '0') i++
  const out = s.slice(i)
  return out === '' ? '0' : out
}`,
      approach:
        'Split both versions on dots and compare segment by segment, treating missing segments as "0". Each segment is compared as a number without parsing it: after stripping leading zeros the longer digit string is larger, and equal lengths compare lexicographically. The first difference decides. O(n) time, O(n) space for the split.',
    },
  },
  {
    slug: 'compress-log-line',
    title: 'Compress a log line',
    kind: 'function',
    difficulty: 'easy',
    rating: 1050,
    skillId: 'arrays-hashing',
    topics: ['strings'],
    roles: ['backend'],
    statement: `To save space in a noisy access log, each line is stored with runs of repeated characters compressed.

Replace every maximal run of the same character in \`line\` by that character followed by the run length, but only when the run is longer than one character. Single characters stay as they are. Characters are case-sensitive (\`a\` and \`A\` are different) and spaces are characters like any other.

Return the compressed line. The input never contains digits.`,
    constraints: [
      '0 ≤ line.length ≤ 100 000',
      'line contains printable ASCII characters other than digits.',
    ],
    hints: [
      'Walk the line and count how long the current run is.',
      'When the character changes (or the line ends), write out the finished run.',
      'Build the output in a list of pieces and join it once, rather than concatenating in a loop in languages where that is quadratic.',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    parSec: 600,
    fn: {
      name: 'compressLogLine',
      params: [{ name: 'line', type: 'string' }],
      returns: { type: 'string' },
    },
    samples: [
      {
        args: ['ERR!!! timeout....'],
        expected: 'ER2!3 timeout.4',
        explanation: 'RR becomes R2, !!! becomes !3 and .... becomes .4; every other character is a run of one.',
      },
      { args: ['abc'], expected: 'abc' },
    ],
    hidden: [
      { args: [''], expected: '' },
      { args: ['a'], expected: 'a' },
      { args: ['zzzzzzzzzzzz'], expected: 'z12' },
      { args: ['aaAA'], expected: 'a2A2' },
      { args: ['  x  '], expected: ' 2x 2' },
      { args: ['abba'], expected: 'ab2a' },
      { args: ['--==--'], expected: '-2=2-2' },
    ],
    scale: { args: [{ t: 'str', alphabet: 'ab ' }] },
    reference: {
      code: `function compressLogLine(line) {
  const out = []
  let i = 0
  while (i < line.length) {
    let j = i
    while (j < line.length && line[j] === line[i]) j++
    out.push(j - i > 1 ? line[i] + String(j - i) : line[i])
    i = j
  }
  return out.join('')
}`,
      approach:
        'Walk the line with two indices: `i` marks the start of a run and `j` advances while the character repeats. Emit the character, plus the run length when it is above one, then continue from `j`. Each character is visited once: O(n) time, O(n) space for the output.',
    },
  },
  {
    slug: 'expand-repeat-template',
    title: 'Expand a repeat template',
    kind: 'function',
    difficulty: 'hard',
    rating: 1700,
    skillId: 'arrays-hashing',
    topics: ['strings', 'stack', 'parsing'],
    roles: ['backend'],
    statement: `A load-test tool describes request bodies with a compact repeat syntax. In \`template\`:

- a lowercase letter stands for itself;
- \`k[body]\` stands for \`body\` written \`k\` times in a row, where \`k\` is a positive integer of one or more digits and \`body\` is itself a template (so repeats can nest).

For example \`x2[y3[z]]\` expands to \`xyzzzyzzz\`.

Return the fully expanded string. The empty template expands to the empty string.`,
    constraints: [
      '0 ≤ template.length ≤ 1 000',
      'The template is always well formed: every [ follows a number, brackets match and every body is non-empty.',
      '1 ≤ k ≤ 300, and the expanded string has at most 100 000 characters.',
    ],
    hints: [
      'When you reach a closing bracket, you need the text built since its matching opening bracket and the count written before it.',
      'Use a stack: on [ save the text built so far and the pending count, then start fresh.',
      'On ] pop the saved prefix and count, and set the current text to prefix + current repeated count times. Accumulate multi-digit counts as you read digits.',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    parSec: 1800,
    fn: {
      name: 'expandTemplate',
      params: [{ name: 'template', type: 'string' }],
      returns: { type: 'string' },
    },
    samples: [
      { args: ['3[ab]'], expected: 'ababab', explanation: 'The body ab is written 3 times.' },
      { args: ['x2[y3[z]]'], expected: 'xyzzzyzzz' },
    ],
    hidden: [
      { args: [''], expected: '' },
      { args: ['abc'], expected: 'abc' },
      { args: ['10[a]'], expected: 'aaaaaaaaaa' },
      { args: ['2[a2[b]c]'], expected: 'abbcabbc' },
      { args: ['1[q]r'], expected: 'qr' },
      { args: ['a2[b]3[cd]e'], expected: 'abbcdcdcde' },
      { args: ['2[2[2[k]]]'], expected: 'kkkkkkkk' },
      { args: ['ab12[c]'], expected: 'abcccccccccccc' },
    ],
    scale: { args: [{ t: 'str', alphabet: 'abcdef' }] },
    reference: {
      code: `function expandTemplate(template) {
  const counts = []
  const prefixes = []
  let cur = ''
  let num = 0
  for (const ch of template) {
    if (ch >= '0' && ch <= '9') {
      num = num * 10 + (ch.charCodeAt(0) - 48)
    } else if (ch === '[') {
      counts.push(num)
      prefixes.push(cur)
      cur = ''
      num = 0
    } else if (ch === ']') {
      const k = counts.pop()
      cur = prefixes.pop() + cur.repeat(k)
    } else {
      cur += ch
    }
  }
  return cur
}`,
      approach:
        'Read left to right, building the current text and accumulating digits into a pending count. An opening bracket pushes the text so far and the count, then starts a fresh body; a closing bracket pops them and replaces the current text with prefix + body repeated. Work is proportional to the input plus the expanded output, which is linear in the output size.',
    },
  },
]
