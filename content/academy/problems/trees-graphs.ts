import type { ProblemSource } from '@/lib/academy/problems/schema'

/**
 * Trees and graphs. Original problems written for lee: classic ideas,
 * our own stories, wording, examples and tests.
 */

interface Node {
  val: number
  left: Node | null
  right: Node | null
}

/** A tree node literal: { val, left, right } (missing children are null). */
function node(val: number, left: Node | null = null, right: Node | null = null): Node {
  return { val, left, right }
}

export const TREES_GRAPHS: readonly ProblemSource[] = [
  {
    slug: 'org-chart-depth',
    title: 'Depth of an org chart',
    kind: 'function',
    difficulty: 'easy',
    rating: 1100,
    skillId: 'trees-graphs',
    topics: ['trees'],
    roles: ['backend'],
    statement: `An internal directory stores a reporting chart as a binary tree: each node is an employee id \`val\` with up to two direct reports \`left\` and \`right\` (either may be \`null\`).

Return the number of levels in the chart: the number of nodes on the longest path from the root down to any node. An empty chart (\`root\` is \`null\`) has 0 levels.`,
    constraints: [
      '0 ≤ number of nodes ≤ 10 000',
      '-10^9 ≤ val ≤ 10^9',
    ],
    hints: [
      'How does the depth of a tree relate to the depths of its two subtrees?',
      'depth(node) = 1 + the larger of depth(left) and depth(right), with depth(null) = 0.',
      'Recursion works, or walk the tree level by level with a queue and count the levels.',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    parSec: 600,
    fn: {
      name: 'orgChartDepth',
      params: [{ name: 'root', type: 'tree' }],
      returns: { type: 'int' },
    },
    samples: [
      {
        args: [node(1, node(2, node(4)), node(3))],
        expected: 3,
        explanation: 'The longest chain is 1 → 2 → 4, which spans 3 levels.',
      },
      { args: [null], expected: 0 },
    ],
    hidden: [
      { args: [node(5)], expected: 1 },
      { args: [node(1, node(2, node(3, node(4))))], expected: 4 },
      { args: [node(1, null, node(2, null, node(3)))], expected: 3 },
      { args: [node(10, node(5, node(2), node(7)), node(15, null, node(20, node(17))))], expected: 4 },
      { args: [node(0, node(0), node(0))], expected: 2 },
      { args: [node(-1, node(-2, null, node(-3, node(-4))), node(-5))], expected: 4 },
    ],
    scale: { args: [{ t: 'tree' }] },
    reference: {
      code: `function orgChartDepth(root) {
  if (!root) return 0
  let depth = 0
  let level = [root]
  while (level.length) {
    depth++
    const next = []
    for (const n of level) {
      if (n.left) next.push(n.left)
      if (n.right) next.push(n.right)
    }
    level = next
  }
  return depth
}`,
      approach:
        'Walk the tree one level at a time: start with the root, and build each next level from the children of the current one, counting levels until none remain. Iteration avoids deep recursion on a skewed chart. Every node is visited once: O(n) time and O(n) space for the widest level.',
    },
  },
  {
    slug: 'category-tree-levels',
    title: 'Category tree by level',
    kind: 'function',
    difficulty: 'medium',
    rating: 1400,
    skillId: 'trees-graphs',
    topics: ['trees'],
    roles: ['apis'],
    statement: `A storefront API returns its product category tree as a binary tree of category ids. The navigation menu shows categories one level at a time.

Return the ids level by level: a list whose first entry holds the root's id, the second entry the ids one level down, and so on. Within a level, list ids from left to right. Return \`[]\` when \`root\` is \`null\`.`,
    constraints: [
      '0 ≤ number of nodes ≤ 10 000',
      '-10^9 ≤ val ≤ 10^9 (ids may repeat)',
    ],
    hints: [
      'Visiting nodes in order of distance from the root is breadth-first search.',
      'Use a queue. Before processing a level, note how many nodes are in the queue: exactly those nodes form the level.',
      'For each level, pop that many nodes, record their values, and enqueue their children left first, then right.',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    parSec: 1200,
    fn: {
      name: 'categoryLevels',
      params: [{ name: 'root', type: 'tree' }],
      returns: { type: 'int[][]' },
    },
    samples: [
      {
        args: [node(1, node(2, node(4), node(5)), node(3, null, node(6)))],
        expected: [[1], [2, 3], [4, 5, 6]],
        explanation: 'Level 0 is the root 1; level 1 holds 2 and 3; level 2 holds 4, 5 (under 2) and 6 (under 3), left to right.',
      },
      { args: [node(8)], expected: [[8]] },
    ],
    hidden: [
      { args: [null], expected: [] },
      { args: [node(1, node(2, node(3)))], expected: [[1], [2], [3]] },
      { args: [node(1, null, node(2, node(3)))], expected: [[1], [2], [3]] },
      { args: [node(7, node(3, node(1), node(5)), node(9, node(8), node(12)))], expected: [[7], [3, 9], [1, 5, 8, 12]] },
      { args: [node(4, node(4), node(4, node(4)))], expected: [[4], [4, 4], [4]] },
      { args: [node(-1, node(2, null, node(-3)), node(4, node(5)))], expected: [[-1], [2, 4], [-3, 5]] },
    ],
    scale: { args: [{ t: 'tree' }] },
    reference: {
      code: `function categoryLevels(root) {
  const out = []
  if (!root) return out
  let level = [root]
  while (level.length) {
    out.push(level.map((n) => n.val))
    const next = []
    for (const n of level) {
      if (n.left) next.push(n.left)
      if (n.right) next.push(n.right)
    }
    level = next
  }
  return out
}`,
      approach:
        'Breadth-first search, one level at a time: record the values of the current level, then build the next level from its children, left child before right. Each node is handled once, so the walk is O(n) time and O(n) space.',
    },
  },
  {
    slug: 'valid-invoice-search-tree',
    title: 'Valid invoice search tree',
    kind: 'function',
    difficulty: 'medium',
    rating: 1450,
    skillId: 'trees-graphs',
    topics: ['trees'],
    roles: ['payments'],
    statement: `A billing service indexes invoice ids in a binary search tree. After a botched migration, you need to check whether the index is still a valid search tree.

The tree is valid when, for **every** node, all ids anywhere in its left subtree are strictly smaller than the node's id and all ids anywhere in its right subtree are strictly larger. Duplicate ids therefore make the tree invalid.

Return \`true\` if the tree is valid and \`false\` otherwise. An empty tree (\`null\`) is valid.`,
    constraints: [
      '0 ≤ number of nodes ≤ 10 000',
      '-10^9 ≤ val ≤ 10^9',
    ],
    hints: [
      'Checking only each node against its direct children is not enough: a grandchild can break the rule.',
      'Each node must lie inside an open interval (low, high) inherited from its ancestors.',
      'Walk down with bounds: the left child gets (low, node.val), the right child gets (node.val, high). Alternatively, an in-order walk must be strictly increasing.',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    parSec: 1200,
    fn: {
      name: 'isValidInvoiceTree',
      params: [{ name: 'root', type: 'tree' }],
      returns: { type: 'bool' },
    },
    samples: [
      {
        args: [node(50, node(30, node(20), node(40)), node(70, node(60), node(80)))],
        expected: true,
      },
      {
        args: [node(50, node(30, null, node(55)), node(70))],
        expected: false,
        explanation: '55 is correctly to the right of 30, but it sits in the left subtree of 50 while being larger than 50.',
      },
    ],
    hidden: [
      { args: [null], expected: true },
      { args: [node(1)], expected: true },
      { args: [node(5, node(5))], expected: false },
      { args: [node(5, null, node(5))], expected: false },
      { args: [node(10, node(5), node(15, node(6), node(20)))], expected: false },
      { args: [node(2, node(1), node(3))], expected: true },
      { args: [node(-10, node(-20, null, node(-15)), node(0))], expected: true },
      { args: [node(3, node(2, node(1, null, node(4))))], expected: false },
      { args: [node(1000000000, node(-1000000000))], expected: true },
    ],
    scale: { args: [{ t: 'tree' }] },
    reference: {
      code: `function isValidInvoiceTree(root) {
  const stack = root ? [[root, null, null]] : []
  while (stack.length) {
    const [n, low, high] = stack.pop()
    if (low !== null && n.val <= low) return false
    if (high !== null && n.val >= high) return false
    if (n.left) stack.push([n.left, low, n.val])
    if (n.right) stack.push([n.right, n.val, high])
  }
  return true
}`,
      approach:
        'Every node must fall strictly inside a range set by its ancestors. Walk the tree with an explicit stack of (node, low, high): the left child inherits (low, node.val) and the right child (node.val, high), with null meaning unbounded. Any node outside its range makes the tree invalid. O(n) time, O(n) space.',
    },
  },
  {
    slug: 'budget-path-count',
    title: 'Spending chains that hit the budget',
    kind: 'function',
    difficulty: 'hard',
    rating: 1800,
    skillId: 'trees-graphs',
    topics: ['trees', 'hashing'],
    roles: ['payments'],
    statement: `A cost-allocation tree splits spend down a hierarchy: each node holds an amount \`val\` (in cents, possibly negative for credits). A **spending chain** is a path that starts at any node and moves only downward (from a node to one of its children) for zero or more steps, so it contains at least one node.

Return how many spending chains have amounts summing to exactly \`budget\`. Chains are counted by their start and end node, so two different chains with the same sum both count. Return \`0\` for an empty tree.`,
    constraints: [
      '0 ≤ number of nodes ≤ 10 000',
      '-10^6 ≤ val ≤ 10^6',
      '-10^9 ≤ budget ≤ 10^9',
    ],
    hints: [
      'Starting a separate walk from every node is O(n²) on a long chain. Think of the root-to-node path as an array.',
      'On one root-to-node path, a chain ending at the current node sums to budget exactly when (prefix sum now) − (an earlier prefix sum) = budget.',
      'DFS with a hash map counting the prefix sums on the current path (start with {0: 1}). At each node add count[prefix − budget], recurse, then decrement the prefix when you return.',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    parSec: 1800,
    fn: {
      name: 'countBudgetPaths',
      params: [
        { name: 'root', type: 'tree' },
        { name: 'budget', type: 'int' },
      ],
      returns: { type: 'int' },
    },
    samples: [
      {
        args: [node(5, node(3, node(2), node(-1)), node(2, null, node(4))), 7],
        expected: 2,
        explanation: 'Two chains sum to 7: 5 → 2 (right child) and 5 → 3 → -1. No other downward chain does.',
      },
      { args: [null, 0], expected: 0 },
    ],
    hidden: [
      { args: [node(4), 4], expected: 1 },
      { args: [node(4), 5], expected: 0 },
      { args: [node(1, node(1, node(1))), 2], expected: 2 },
      { args: [node(0, node(0), node(0)), 0], expected: 5 },
      { args: [node(1, node(-1, node(1, node(-1)))), 0], expected: 4 },
      { args: [node(6, node(2, node(4), node(-2)), node(8, node(-6))), 8], expected: 3 },
      { args: [node(3, node(3, node(3)), node(3)), 3], expected: 4 },
      { args: [node(-5, node(5)), 0], expected: 1 },
    ],
    scale: { args: [{ t: 'tree' }, { t: 'const', value: 10 }] },
    reference: {
      code: `function countBudgetPaths(root, budget) {
  const seen = new Map([[0, 1]])
  function walk(n, prefix) {
    if (!n) return 0
    const sum = prefix + n.val
    let count = seen.get(sum - budget) || 0
    seen.set(sum, (seen.get(sum) || 0) + 1)
    count += walk(n.left, sum) + walk(n.right, sum)
    seen.set(sum, seen.get(sum) - 1)
    return count
  }
  return walk(root, 0)
}`,
      approach:
        'Treat each root-to-node path as an array of prefix sums. A downward chain ending at the current node sums to `budget` exactly when some earlier prefix on the path equals `prefix − budget`, so a hash map of prefix counts on the current path answers that in O(1). Add the current prefix before visiting the children and remove it afterwards. O(n) time, O(n) space for the map and the recursion.',
    },
  },
  {
    slug: 'count-server-clusters',
    title: 'Count server clusters',
    kind: 'function',
    difficulty: 'easy',
    rating: 1200,
    skillId: 'trees-graphs',
    topics: ['graphs'],
    roles: ['backend'],
    statement: `A data center has \`n\` servers numbered \`0\` to \`n - 1\`. Each entry \`[u, v]\` in \`links\` is a network cable between servers \`u\` and \`v\`; cables work in both directions. Servers that can reach each other through any number of cables form a cluster, and a server with no cables is a cluster on its own.

Return the number of clusters. The same cable may be listed more than once, and a cable may loop from a server back to itself.`,
    constraints: [
      '0 ≤ n ≤ 100 000',
      '0 ≤ links.length ≤ 200 000',
      '0 ≤ u, v < n',
    ],
    hints: [
      'Each cluster is a connected component of an undirected graph.',
      'Start a BFS or DFS from every server not yet visited; each start discovers one new cluster.',
      'Or use union-find: begin with n clusters and decrease the count every time a cable joins two different roots.',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    parSec: 600,
    fn: {
      name: 'countClusters',
      params: [
        { name: 'n', type: 'int' },
        { name: 'links', type: 'int[][]' },
      ],
      returns: { type: 'int' },
    },
    samples: [
      {
        args: [5, [[0, 1], [1, 2], [3, 4]]],
        expected: 2,
        explanation: 'Servers 0, 1 and 2 are cabled together, and 3 and 4 form a second cluster.',
      },
      { args: [4, []], expected: 4 },
    ],
    hidden: [
      { args: [1, []], expected: 1 },
      { args: [0, []], expected: 0 },
      { args: [3, [[0, 1], [1, 2], [2, 0]]], expected: 1 },
      { args: [6, [[0, 5], [1, 4]]], expected: 4 },
      { args: [4, [[0, 0]]], expected: 4 },
      { args: [5, [[0, 1], [0, 1], [3, 4], [4, 3]]], expected: 3 },
      { args: [7, [[6, 5], [5, 4], [4, 3], [3, 2], [2, 1], [1, 0]]], expected: 1 },
    ],
    scale: { args: [{ t: 'n' }, { t: 'edges', extra: 1 }] },
    reference: {
      code: `function countClusters(n, links) {
  const parent = Array.from({ length: n }, (_, i) => i)
  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]
      x = parent[x]
    }
    return x
  }
  let clusters = n
  for (const [u, v] of links) {
    const a = find(u)
    const b = find(v)
    if (a !== b) {
      parent[a] = b
      clusters--
    }
  }
  return clusters
}`,
      approach:
        'Union-find: every server starts as its own cluster, and each cable that joins two different roots merges them and lowers the count by one. Path halving keeps the trees shallow, so the run is close to linear in servers plus cables, with O(n) space.',
    },
  },
  {
    slug: 'fewest-service-hops',
    title: 'Fewest hops between services',
    kind: 'function',
    difficulty: 'medium',
    rating: 1450,
    skillId: 'trees-graphs',
    topics: ['graphs'],
    roles: ['backend', 'apis'],
    statement: `A service mesh has \`n\` services numbered \`0\` to \`n - 1\`. Each entry \`[u, v]\` in \`links\` means services \`u\` and \`v\` can call each other directly (both directions). A request travels from service to service along links, and each link it crosses is one hop.

Return the fewest hops needed for a request to get from service \`from\` to service \`to\`. Return \`0\` when \`from\` equals \`to\`, and \`-1\` when \`to\` cannot be reached.`,
    constraints: [
      '1 ≤ n ≤ 100 000',
      '0 ≤ links.length ≤ 200 000',
      '0 ≤ u, v, from, to < n',
    ],
    hints: [
      'All hops cost the same, so the shortest route is the one with the fewest edges.',
      'Breadth-first search explores services in order of their hop distance from the start.',
      'Build an adjacency list, BFS from `from` recording each service’s distance when first reached, and stop when you reach `to`.',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    parSec: 1200,
    fn: {
      name: 'fewestHops',
      params: [
        { name: 'n', type: 'int' },
        { name: 'links', type: 'int[][]' },
        { name: 'from', type: 'int' },
        { name: 'to', type: 'int' },
      ],
      returns: { type: 'int' },
    },
    samples: [
      {
        args: [6, [[0, 1], [1, 5], [0, 3], [3, 4], [4, 5]], 0, 5],
        expected: 2,
        explanation: 'The route 0 → 1 → 5 takes 2 hops; the other route 0 → 3 → 4 → 5 takes 3.',
      },
      { args: [3, [[0, 1]], 0, 2], expected: -1 },
    ],
    hidden: [
      { args: [1, [], 0, 0], expected: 0 },
      { args: [2, [[1, 0]], 0, 1], expected: 1 },
      { args: [5, [[0, 1], [1, 2], [2, 3], [3, 4]], 4, 0], expected: 4 },
      { args: [5, [[0, 1], [1, 2], [2, 3], [3, 4], [0, 4]], 0, 3], expected: 2 },
      { args: [4, [[0, 1], [2, 3]], 1, 3], expected: -1 },
      { args: [4, [[2, 2], [0, 1], [1, 2]], 2, 0], expected: 2 },
      { args: [6, [[0, 1], [0, 2], [0, 3], [1, 4], [2, 4], [4, 5], [3, 5]], 1, 3], expected: 2 },
    ],
    scale: { args: [{ t: 'n' }, { t: 'edges', extra: 1 }, { t: 'const', value: 0 }, { t: 'n', add: -1 }] },
    reference: {
      code: `function fewestHops(n, links, from, to) {
  if (from === to) return 0
  const adj = Array.from({ length: n }, () => [])
  for (const [u, v] of links) {
    adj[u].push(v)
    adj[v].push(u)
  }
  const dist = new Array(n).fill(-1)
  dist[from] = 0
  const queue = [from]
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head]
    for (const next of adj[cur]) {
      if (dist[next] !== -1) continue
      dist[next] = dist[cur] + 1
      if (next === to) return dist[next]
      queue.push(next)
    }
  }
  return -1
}`,
      approach:
        'Build an adjacency list and run breadth-first search from `from`. BFS reaches services in increasing hop count, so the first time `to` is reached its distance is the minimum; if the queue empties first, it is unreachable. Each service and link is processed once: O(n + m) time and space.',
    },
  },
  {
    slug: 'job-build-order',
    title: 'Build order for dependent jobs',
    kind: 'function',
    difficulty: 'hard',
    rating: 1750,
    skillId: 'trees-graphs',
    topics: ['graphs', 'heap', 'sorting'],
    roles: ['backend'],
    statement: `A CI pipeline has \`n\` build jobs numbered \`0\` to \`n - 1\`. Each entry \`[a, b]\` in \`deps\` says job \`a\` must finish before job \`b\` can start. Jobs run one at a time.

Return an order that runs every job exactly once and respects every dependency. To make the answer unique, whenever several jobs are ready to run (all their prerequisites are done), always run the one with the **smallest id** first.

If no valid order exists (the dependencies contain a cycle, including a job that depends on itself), return \`[]\`. A dependency may be listed more than once.`,
    constraints: [
      '1 ≤ n ≤ 100 000',
      '0 ≤ deps.length ≤ 200 000',
      '0 ≤ a, b < n',
    ],
    hints: [
      'A job is ready when the number of unfinished prerequisites it has reaches zero.',
      'Kahn’s algorithm: count incoming edges, start with all jobs at zero, and each time you run a job, decrement its dependents.',
      'Keep the ready jobs in a min-heap so you always take the smallest id. If fewer than n jobs ran, there is a cycle.',
    ],
    complexity: { time: 'O(n log n)', space: 'O(n)' },
    parSec: 1800,
    fn: {
      name: 'buildOrder',
      params: [
        { name: 'n', type: 'int' },
        { name: 'deps', type: 'int[][]' },
      ],
      returns: { type: 'int[]' },
    },
    samples: [
      {
        args: [4, [[1, 0], [2, 0], [3, 1]]],
        expected: [2, 3, 1, 0],
        explanation: 'Jobs 2 and 3 are ready at the start, so 2 runs first, then 3. That frees job 1, and once 1 and 2 are both done, job 0 runs.',
      },
      { args: [3, [[0, 1], [1, 2], [2, 0]]], expected: [] },
    ],
    hidden: [
      { args: [1, []], expected: [0] },
      { args: [3, []], expected: [0, 1, 2] },
      { args: [2, [[0, 0]]], expected: [] },
      { args: [5, [[4, 0], [3, 0], [0, 1], [2, 1]]], expected: [2, 3, 4, 0, 1] },
      { args: [4, [[3, 2], [2, 1], [1, 0]]], expected: [3, 2, 1, 0] },
      { args: [4, [[0, 1], [0, 1]]], expected: [0, 1, 2, 3] },
      { args: [6, [[5, 2], [5, 0], [4, 0], [4, 1], [2, 3], [3, 1]]], expected: [4, 5, 0, 2, 3, 1] },
      { args: [4, [[0, 1], [1, 2], [2, 1], [0, 3]]], expected: [] },
    ],
    scale: { args: [{ t: 'n' }, { t: 'edges' }] },
    reference: {
      code: `function buildOrder(n, deps) {
  const out = Array.from({ length: n }, () => [])
  const indeg = new Array(n).fill(0)
  for (const [a, b] of deps) {
    out[a].push(b)
    indeg[b]++
  }
  const heap = []
  function push(x) {
    heap.push(x)
    let i = heap.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heap[p] <= heap[i]) break
      const t = heap[p]; heap[p] = heap[i]; heap[i] = t
      i = p
    }
  }
  function pop() {
    const top = heap[0]
    const last = heap.pop()
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < heap.length && heap[l] < heap[m]) m = l
        if (r < heap.length && heap[r] < heap[m]) m = r
        if (m === i) break
        const t = heap[m]; heap[m] = heap[i]; heap[i] = t
        i = m
      }
    }
    return top
  }
  for (let i = 0; i < n; i++) if (indeg[i] === 0) push(i)
  const order = []
  while (heap.length) {
    const job = pop()
    order.push(job)
    for (const next of out[job]) {
      indeg[next]--
      if (indeg[next] === 0) push(next)
    }
  }
  return order.length === n ? order : []
}`,
      approach:
        'Kahn’s topological sort: count each job’s unfinished prerequisites, keep jobs with a zero count in a min-heap, and repeatedly run the smallest ready job, decrementing its dependents and adding any that become ready. If a cycle exists, its jobs never become ready and fewer than n jobs run, so return []. The heap makes it O((n + m) log n) time and O(n + m) space.',
    },
  },
  {
    slug: 'rack-occupancy-groups',
    title: 'Groups of occupied racks',
    kind: 'function',
    difficulty: 'medium',
    rating: 1400,
    skillId: 'trees-graphs',
    topics: ['graphs'],
    roles: ['backend'],
    statement: `A data hall floor plan is given as \`rows\`, a list of equal-length strings. Each character is a rack slot: \`#\` is an occupied rack and \`.\` is an empty slot.

Occupied racks that touch horizontally or vertically (not diagonally) share a power group, and so do racks connected through a chain of such touches. Return the number of power groups. An empty floor plan or one with no \`#\` has 0 groups.`,
    constraints: [
      '0 ≤ rows.length ≤ 2 000',
      '1 ≤ rows[i].length ≤ 2 000, all rows the same length',
      'rows.length × rows[i].length ≤ 2 000 000',
    ],
    hints: [
      'Treat each # as a node with edges to its up, down, left and right # neighbours.',
      'Scan every cell; an unvisited # starts a new group, then flood-fill everything it connects to.',
      'Use an explicit stack or queue for the flood fill (and a visited grid), since recursion can overflow on a large snake-shaped group.',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    parSec: 1200,
    fn: {
      name: 'countRackGroups',
      params: [{ name: 'rows', type: 'string[]' }],
      returns: { type: 'int' },
    },
    samples: [
      {
        args: [['##..#', '#...#', '..#..', '....#']],
        expected: 4,
        explanation: 'The top-left L of three racks, the pair in the right column of rows 0–1, the lone rack in the middle, and the bottom-right rack (the slot above it is empty).',
      },
      { args: [['...', '...']], expected: 0 },
    ],
    hidden: [
      { args: [[]], expected: 0 },
      { args: [['#']], expected: 1 },
      { args: [['#.#.#']], expected: 3 },
      { args: [['#', '#', '.']], expected: 1 },
      { args: [['#.', '.#']], expected: 2 },
      { args: [['###', '#.#', '###']], expected: 1 },
      { args: [['.#.', '###', '.#.']], expected: 1 },
      { args: [['#..#', '....', '#..#']], expected: 4 },
      { args: [['##.##', '#...#', '##.##']], expected: 2 },
    ],
    scale: { args: [{ t: 'strs', wordLen: 32, alphabet: '#.' }] },
    reference: {
      code: `function countRackGroups(rows) {
  const h = rows.length
  if (h === 0) return 0
  const w = rows[0].length
  const seen = new Array(h * w).fill(false)
  let groups = 0
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (rows[r][c] !== '#' || seen[r * w + c]) continue
      groups++
      seen[r * w + c] = true
      const stack = [r * w + c]
      while (stack.length) {
        const cell = stack.pop()
        const cr = Math.floor(cell / w)
        const cc = cell % w
        const around = [[cr - 1, cc], [cr + 1, cc], [cr, cc - 1], [cr, cc + 1]]
        for (const [nr, nc] of around) {
          if (nr < 0 || nr >= h || nc < 0 || nc >= w) continue
          if (rows[nr][nc] !== '#' || seen[nr * w + nc]) continue
          seen[nr * w + nc] = true
          stack.push(nr * w + nc)
        }
      }
    }
  }
  return groups
}`,
      approach:
        'Scan the grid; each occupied rack not yet visited starts a new group, and an iterative flood fill with an explicit stack marks every rack reachable through up, down, left and right neighbours. Every cell is marked and expanded at most once, so the run is O(cells) time and O(cells) space for the visited grid.',
    },
  },
]
