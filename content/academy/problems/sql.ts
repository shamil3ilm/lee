import type { ProblemSource } from '@/lib/academy/problems/schema'

/**
 * SQL problems, run in the browser with PGlite (Postgres). Original problems
 * written for lee. Each test is a seed script loaded after the schema; the
 * expected result lists column names (in order) and rows.
 */

const PAYMENTS_SCHEMA = `CREATE TABLE merchants (
  id integer PRIMARY KEY,
  name text NOT NULL,
  country text NOT NULL
);
CREATE TABLE payments (
  id integer PRIMARY KEY,
  merchant_id integer NOT NULL REFERENCES merchants(id),
  amount_cents integer NOT NULL,
  status text NOT NULL CHECK (status IN ('succeeded', 'failed', 'refunded')),
  created_on date NOT NULL
);`

const CUSTOMERS_SCHEMA = `CREATE TABLE customers (
  id integer PRIMARY KEY,
  name text NOT NULL,
  city text NOT NULL
);
CREATE TABLE orders (
  id integer PRIMARY KEY,
  customer_id integer NOT NULL REFERENCES customers(id),
  total_cents integer NOT NULL,
  placed_on date NOT NULL
);`

const WEBHOOKS_SCHEMA = `CREATE TABLE webhook_deliveries (
  id integer PRIMARY KEY,
  event_id text NOT NULL,
  endpoint text NOT NULL,
  received_at timestamp NOT NULL
);`

const INVOICES_SCHEMA = `CREATE TABLE invoices (
  id integer PRIMARY KEY,
  region text NOT NULL,
  customer text NOT NULL,
  amount_cents integer NOT NULL,
  issued_on date NOT NULL
);`

const CHARGES_SCHEMA = `CREATE TABLE charges (
  id integer PRIMARY KEY,
  merchant text NOT NULL,
  amount_cents integer NOT NULL,
  created_on date NOT NULL,
  refunded boolean NOT NULL DEFAULT false
);`

const LEDGER_SCHEMA = `CREATE TABLE ledger_entries (
  id integer PRIMARY KEY,
  account text NOT NULL,
  posted_on date NOT NULL,
  amount_cents integer NOT NULL
);`

export const SQL_PROBLEMS: readonly ProblemSource[] = [
  {
    slug: 'merchant-volume',
    title: 'Merchant settled volume',
    kind: 'sql',
    difficulty: 'easy',
    rating: 1150,
    skillId: 'sql-querying',
    topics: ['sql'],
    roles: ['payments', 'data'],
    statement: `Finance needs each merchant's settled volume: the sum of \`amount_cents\` over that merchant's **succeeded** payments.

Return \`name\` and \`settled_cents\` for every merchant with at least one succeeded payment, largest volume first; break ties by name A→Z.`,
    constraints: ['Failed and refunded payments do not count.', 'Merchants with no succeeded payment are left out.'],
    hints: [
      'Filter to succeeded payments before you aggregate.',
      'JOIN merchants to payments, then GROUP BY the merchant.',
      'ORDER BY settled_cents DESC, name ASC.',
    ],
    complexity: { time: 'O(n log n)', space: 'O(n)' },
    parSec: 480,
    schema: PAYMENTS_SCHEMA,
    ordered: true,
    samples: [
      {
        seed: `INSERT INTO merchants VALUES (1, 'Corner Bakery', 'AE'), (2, 'Desert Books', 'SA'), (3, 'Quiet Cafe', 'IN');
INSERT INTO payments VALUES
  (1, 1, 1200, 'succeeded', '2026-03-01'),
  (2, 1, 800, 'failed', '2026-03-01'),
  (3, 2, 5000, 'succeeded', '2026-03-02'),
  (4, 1, 300, 'succeeded', '2026-03-03'),
  (5, 3, 999, 'refunded', '2026-03-03');`,
        expected: { columns: ['name', 'settled_cents'], rows: [['Desert Books', 5000], ['Corner Bakery', 1500]] },
        explanation: 'Quiet Cafe has only a refunded payment, so it is left out.',
      },
    ],
    hidden: [
      {
        seed: `INSERT INTO merchants VALUES (1, 'Alpha', 'AE'), (2, 'Beta', 'AE');
INSERT INTO payments VALUES (1, 1, 100, 'succeeded', '2026-01-01'), (2, 2, 100, 'succeeded', '2026-01-02');`,
        expected: { columns: ['name', 'settled_cents'], rows: [['Alpha', 100], ['Beta', 100]] },
      },
      {
        seed: `INSERT INTO merchants VALUES (1, 'Only Failed', 'IN');
INSERT INTO payments VALUES (1, 1, 100, 'failed', '2026-01-01');`,
        expected: { columns: ['name', 'settled_cents'], rows: [] },
      },
      {
        seed: `INSERT INTO merchants VALUES (1, 'Zed', 'SA'), (2, 'Amy', 'SA'), (3, 'Max', 'AE');
INSERT INTO payments VALUES
  (1, 1, 10, 'succeeded', '2026-02-01'),
  (2, 1, 20, 'succeeded', '2026-02-02'),
  (3, 2, 30, 'succeeded', '2026-02-03'),
  (4, 3, 5, 'succeeded', '2026-02-03'),
  (5, 3, 500, 'refunded', '2026-02-04');`,
        expected: { columns: ['name', 'settled_cents'], rows: [['Amy', 30], ['Zed', 30], ['Max', 5]] },
      },
    ],
    reference: {
      code: `SELECT m.name, SUM(p.amount_cents) AS settled_cents
FROM merchants m
JOIN payments p ON p.merchant_id = m.id
WHERE p.status = 'succeeded'
GROUP BY m.id, m.name
ORDER BY settled_cents DESC, m.name ASC;`,
      approach:
        'Join merchants to their payments, keep only succeeded rows, then aggregate per merchant. The inner join drops merchants without a succeeded payment. Sort by the total, then by name for ties.',
    },
  },
  {
    slug: 'customers-without-orders',
    title: 'Customers who never ordered',
    kind: 'sql',
    difficulty: 'easy',
    rating: 1100,
    skillId: 'sql-querying',
    topics: ['sql'],
    roles: ['data', 'backend'],
    statement: `Marketing wants to send a welcome nudge to every customer who signed up but has **never placed an order**.

Return \`id\` and \`name\` of those customers, ordered by \`id\` ascending. If every customer has ordered (or there are no customers), return no rows.`,
    constraints: ['A customer may have any number of orders.', 'Every order references an existing customer.'],
    hints: [
      'You are looking for rows in customers that have no matching row in orders.',
      'A LEFT JOIN keeps customers without orders; their order columns come back NULL.',
      'Either LEFT JOIN and keep rows WHERE o.id IS NULL, or use WHERE NOT EXISTS (SELECT 1 FROM orders ...). ORDER BY id.',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    parSec: 600,
    schema: CUSTOMERS_SCHEMA,
    ordered: true,
    samples: [
      {
        seed: `INSERT INTO customers VALUES (1, 'Blue Kettle', 'Dubai'), (2, 'Harbor Print', 'Riyadh'), (3, 'Sand Dune Gym', 'Doha'), (4, 'Olive Lane', 'Kochi');
INSERT INTO orders VALUES
  (1, 1, 2500, '2026-04-01'),
  (2, 1, 1200, '2026-04-03'),
  (3, 3, 900, '2026-04-02');`,
        expected: { columns: ['id', 'name'], rows: [[2, 'Harbor Print'], [4, 'Olive Lane']] },
        explanation: 'Blue Kettle and Sand Dune Gym have orders; Harbor Print and Olive Lane do not.',
      },
    ],
    hidden: [
      {
        seed: `INSERT INTO customers VALUES (5, 'Zeta Tools', 'Muscat'), (2, 'Alpha Prints', 'Pune');`,
        expected: { columns: ['id', 'name'], rows: [[2, 'Alpha Prints'], [5, 'Zeta Tools']] },
      },
      {
        seed: `INSERT INTO customers VALUES (1, 'Busy Bee', 'Dubai'), (2, 'Night Owl', 'Dubai');
INSERT INTO orders VALUES (1, 1, 100, '2026-01-01'), (2, 2, 200, '2026-01-02');`,
        expected: { columns: ['id', 'name'], rows: [] },
      },
      {
        seed: '',
        expected: { columns: ['id', 'name'], rows: [] },
      },
      {
        seed: `INSERT INTO customers VALUES (10, 'Tall Pines', 'Jeddah'), (3, 'Iron Gate', 'Kochi'), (7, 'Mint Desk', 'Doha');
INSERT INTO orders VALUES (1, 10, 4000, '2026-02-01'), (2, 10, 500, '2026-02-02'), (3, 10, 700, '2026-02-03');`,
        expected: { columns: ['id', 'name'], rows: [[3, 'Iron Gate'], [7, 'Mint Desk']] },
      },
    ],
    reference: {
      code: `SELECT c.id, c.name
FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id)
ORDER BY c.id;`,
      approach:
        'An anti-join: keep each customer for which no order row exists. `NOT EXISTS` (or a LEFT JOIN filtered on `o.id IS NULL`) expresses it directly, and Postgres runs it as a hash anti-join. Sort by id at the end.',
    },
  },
  {
    slug: 'duplicate-webhook-deliveries',
    title: 'Duplicate webhook deliveries',
    kind: 'sql',
    difficulty: 'easy',
    rating: 1150,
    skillId: 'sql-querying',
    topics: ['sql'],
    roles: ['backend', 'apis', 'data'],
    statement: `A payment provider retries webhooks, so the same event sometimes reaches the same endpoint more than once. A **duplicate** is an (\`event_id\`, \`endpoint\`) pair that was received more than once. The same event delivered once to each of two different endpoints is not a duplicate.

Return \`event_id\`, \`endpoint\` and \`deliveries\` (how many times that pair was received) for every duplicated pair, ordered by \`deliveries\` descending, then \`event_id\` ascending, then \`endpoint\` ascending.`,
    constraints: ['received_at differs between retries but plays no part in the answer.', 'Return no rows when nothing is duplicated.'],
    hints: [
      'Group the deliveries by the pair that identifies a delivery target.',
      'COUNT(*) per group gives the number of deliveries; filter groups, not rows.',
      'GROUP BY event_id, endpoint HAVING COUNT(*) > 1, then ORDER BY the count DESC and both keys ASC.',
    ],
    complexity: { time: 'O(n log n)', space: 'O(n)' },
    parSec: 600,
    schema: WEBHOOKS_SCHEMA,
    ordered: true,
    samples: [
      {
        seed: `INSERT INTO webhook_deliveries VALUES
  (1, 'evt_a1', '/hooks/billing', '2026-05-01 10:00:00'),
  (2, 'evt_a1', '/hooks/billing', '2026-05-01 10:00:05'),
  (3, 'evt_a1', '/hooks/crm', '2026-05-01 10:00:01'),
  (4, 'evt_b2', '/hooks/billing', '2026-05-01 11:00:00'),
  (5, 'evt_b2', '/hooks/billing', '2026-05-01 11:00:30'),
  (6, 'evt_b2', '/hooks/billing', '2026-05-01 11:01:00'),
  (7, 'evt_c3', '/hooks/crm', '2026-05-01 12:00:00');`,
        expected: {
          columns: ['event_id', 'endpoint', 'deliveries'],
          rows: [
            ['evt_b2', '/hooks/billing', 3],
            ['evt_a1', '/hooks/billing', 2],
          ],
        },
        explanation: 'evt_a1 reached /hooks/crm only once, so that pair is not a duplicate.',
      },
    ],
    hidden: [
      {
        seed: `INSERT INTO webhook_deliveries VALUES
  (1, 'evt_x', '/a', '2026-05-02 09:00:00'),
  (2, 'evt_x', '/b', '2026-05-02 09:00:00'),
  (3, 'evt_y', '/a', '2026-05-02 09:05:00');`,
        expected: { columns: ['event_id', 'endpoint', 'deliveries'], rows: [] },
      },
      {
        seed: '',
        expected: { columns: ['event_id', 'endpoint', 'deliveries'], rows: [] },
      },
      {
        seed: `INSERT INTO webhook_deliveries VALUES
  (1, 'evt_m', '/z', '2026-05-03 08:00:00'),
  (2, 'evt_m', '/z', '2026-05-03 08:01:00'),
  (3, 'evt_m', '/a', '2026-05-03 08:00:00'),
  (4, 'evt_m', '/a', '2026-05-03 08:02:00'),
  (5, 'evt_k', '/q', '2026-05-03 08:00:00'),
  (6, 'evt_k', '/q', '2026-05-03 08:03:00');`,
        expected: {
          columns: ['event_id', 'endpoint', 'deliveries'],
          rows: [
            ['evt_k', '/q', 2],
            ['evt_m', '/a', 2],
            ['evt_m', '/z', 2],
          ],
        },
      },
      {
        seed: `INSERT INTO webhook_deliveries VALUES
  (1, 'evt_z', '/hooks/ledger', '2026-05-04 07:00:00'),
  (2, 'evt_z', '/hooks/ledger', '2026-05-04 07:00:10'),
  (3, 'evt_z', '/hooks/ledger', '2026-05-04 07:00:20'),
  (4, 'evt_z', '/hooks/ledger', '2026-05-04 07:00:40'),
  (5, 'evt_w', '/hooks/ledger', '2026-05-04 07:01:00');`,
        expected: { columns: ['event_id', 'endpoint', 'deliveries'], rows: [['evt_z', '/hooks/ledger', 4]] },
      },
    ],
    reference: {
      code: `SELECT event_id, endpoint, COUNT(*) AS deliveries
FROM webhook_deliveries
GROUP BY event_id, endpoint
HAVING COUNT(*) > 1
ORDER BY deliveries DESC, event_id ASC, endpoint ASC;`,
      approach:
        'Group by the (event, endpoint) pair and count the rows in each group. `HAVING` filters groups after aggregation, keeping only pairs seen more than once. Sorting the grouped rows gives O(n log n).',
    },
  },
  {
    slug: 'second-largest-invoice',
    title: 'Second-largest invoice per region',
    kind: 'sql',
    difficulty: 'medium',
    rating: 1450,
    skillId: 'sql-querying',
    topics: ['sql'],
    roles: ['data', 'payments'],
    statement: `For each sales region, finance wants the **second-highest distinct** invoice amount. Equal amounts count once: in a region with amounts 9000, 9000 and 7000 the answer is 7000.

Return \`region\` and \`second_cents\`, ordered by \`region\` ascending. A region with fewer than two distinct amounts has no second-highest amount and is **left out** of the result (no row, not a NULL row).`,
    constraints: ['amount_cents may be zero or negative (credit notes).', 'Regions are compared exactly as stored.'],
    hints: [
      'Ranking within each region is a job for a window function partitioned by region.',
      'RANK skips numbers after ties; DENSE_RANK does not, which is what "distinct amounts" needs.',
      'DENSE_RANK() OVER (PARTITION BY region ORDER BY amount_cents DESC) in a CTE, then keep rank 2 (deduplicate with DISTINCT) and ORDER BY region.',
    ],
    complexity: { time: 'O(n log n)', space: 'O(n)' },
    parSec: 1200,
    schema: INVOICES_SCHEMA,
    ordered: true,
    samples: [
      {
        seed: `INSERT INTO invoices VALUES
  (1, 'GCC', 'Blue Kettle', 5000, '2026-03-01'),
  (2, 'GCC', 'Harbor Print', 9000, '2026-03-02'),
  (3, 'GCC', 'Sand Dune Gym', 9000, '2026-03-03'),
  (4, 'GCC', 'Olive Lane', 7000, '2026-03-04'),
  (5, 'IN', 'Mint Desk', 3000, '2026-03-01'),
  (6, 'IN', 'Iron Gate', 3000, '2026-03-05'),
  (7, 'EU', 'Tall Pines', 100, '2026-03-02'),
  (8, 'EU', 'Quiet Cafe', 200, '2026-03-03');`,
        expected: { columns: ['region', 'second_cents'], rows: [['EU', 100], ['GCC', 7000]] },
        explanation: 'GCC distinct amounts are 9000, 7000, 5000, so 7000. IN has only one distinct amount (3000) and is left out.',
      },
    ],
    hidden: [
      {
        seed: `INSERT INTO invoices VALUES (1, 'GCC', 'Lone Shop', 1200, '2026-01-01');`,
        expected: { columns: ['region', 'second_cents'], rows: [] },
      },
      {
        seed: '',
        expected: { columns: ['region', 'second_cents'], rows: [] },
      },
      {
        seed: `INSERT INTO invoices VALUES
  (1, 'APAC', 'A Co', 10, '2026-02-01'),
  (2, 'APAC', 'B Co', 10, '2026-02-01'),
  (3, 'APAC', 'C Co', 10, '2026-02-02'),
  (4, 'APAC', 'D Co', 20, '2026-02-02'),
  (5, 'LATAM', 'E Co', 50, '2026-02-03'),
  (6, 'LATAM', 'F Co', 40, '2026-02-03'),
  (7, 'LATAM', 'G Co', 30, '2026-02-04');`,
        expected: { columns: ['region', 'second_cents'], rows: [['APAC', 10], ['LATAM', 40]] },
      },
      {
        seed: `INSERT INTO invoices VALUES
  (1, 'NA', 'Credit One', -500, '2026-04-01'),
  (2, 'NA', 'Credit Two', -100, '2026-04-02'),
  (3, 'SEA', 'Zero One', 0, '2026-04-01'),
  (4, 'SEA', 'Zero Two', 0, '2026-04-02');`,
        expected: { columns: ['region', 'second_cents'], rows: [['NA', -500]] },
      },
    ],
    reference: {
      code: `WITH ranked AS (
  SELECT region, amount_cents,
         DENSE_RANK() OVER (PARTITION BY region ORDER BY amount_cents DESC) AS r
  FROM invoices
)
SELECT DISTINCT region, amount_cents AS second_cents
FROM ranked
WHERE r = 2
ORDER BY region;`,
      approach:
        '`DENSE_RANK` numbers the distinct amounts of each region 1, 2, 3, … with ties sharing a rank and no gaps, so rank 2 is exactly the second-highest distinct amount. Several invoices can share that amount, so `DISTINCT` collapses them to one row; regions without a rank 2 produce no row. The window sort is O(n log n).',
    },
  },
  {
    slug: 'daily-refund-rate',
    title: 'Daily refund rate',
    kind: 'sql',
    difficulty: 'medium',
    rating: 1400,
    skillId: 'sql-querying',
    topics: ['sql'],
    roles: ['payments', 'data'],
    statement: `Risk monitors the share of charges that end up refunded. For every day that has at least one charge, return:

- \`created_on\`: the day,
- \`charges\`: the number of charges that day,
- \`refunded\`: how many of them have \`refunded = true\`,
- \`refund_rate_pct\`: \`100 × refunded / charges\`, rounded to 2 decimals and returned as a float (for example \`ROUND(x::numeric, 2)::float\`).

Order by \`created_on\` ascending. Days without charges do not appear.`,
    constraints: ['Every charge has a created_on date.', 'Beware integer division: 1 / 3 is 0 in SQL.'],
    hints: [
      'Group the charges by day and count them.',
      'Count only refunded rows with COUNT(*) FILTER (WHERE refunded) or SUM(CASE WHEN refunded THEN 1 ELSE 0 END).',
      'Multiply by 100.0 before dividing so the division is not integer division, then ROUND(…, 2)::float.',
    ],
    complexity: { time: 'O(n log n)', space: 'O(n)' },
    parSec: 1200,
    schema: CHARGES_SCHEMA,
    ordered: true,
    samples: [
      {
        seed: `INSERT INTO charges VALUES
  (1, 'Corner Bakery', 1200, '2026-06-01', false),
  (2, 'Corner Bakery', 800, '2026-06-01', true),
  (3, 'Desert Books', 5000, '2026-06-01', false),
  (4, 'Quiet Cafe', 450, '2026-06-01', false),
  (5, 'Desert Books', 2000, '2026-06-02', true),
  (6, 'Quiet Cafe', 300, '2026-06-02', false),
  (7, 'Quiet Cafe', 300, '2026-06-02', false),
  (8, 'Corner Bakery', 900, '2026-06-03', false),
  (9, 'Desert Books', 700, '2026-06-03', false);`,
        expected: {
          columns: ['created_on', 'charges', 'refunded', 'refund_rate_pct'],
          rows: [
            ['2026-06-01', 4, 1, 25],
            ['2026-06-02', 3, 1, 33.33],
            ['2026-06-03', 2, 0, 0],
          ],
        },
        explanation: 'On 2026-06-02 one of three charges was refunded: 100 × 1 / 3 = 33.333…, rounded to 33.33.',
      },
    ],
    hidden: [
      {
        seed: '',
        expected: { columns: ['created_on', 'charges', 'refunded', 'refund_rate_pct'], rows: [] },
      },
      {
        seed: `INSERT INTO charges VALUES (1, 'Mint Desk', 100, '2026-07-04', true), (2, 'Mint Desk', 200, '2026-07-04', true);`,
        expected: { columns: ['created_on', 'charges', 'refunded', 'refund_rate_pct'], rows: [['2026-07-04', 2, 2, 100]] },
      },
      {
        seed: `INSERT INTO charges VALUES
  (1, 'Iron Gate', 100, '2026-08-03', false),
  (2, 'Iron Gate', 100, '2026-08-01', true),
  (3, 'Iron Gate', 100, '2026-08-03', true),
  (4, 'Iron Gate', 100, '2026-08-01', true),
  (5, 'Iron Gate', 100, '2026-08-03', false),
  (6, 'Iron Gate', 100, '2026-08-01', false),
  (7, 'Iron Gate', 100, '2026-08-03', false),
  (8, 'Iron Gate', 100, '2026-08-03', false),
  (9, 'Iron Gate', 100, '2026-08-03', false);`,
        expected: {
          columns: ['created_on', 'charges', 'refunded', 'refund_rate_pct'],
          rows: [
            ['2026-08-01', 3, 2, 66.67],
            ['2026-08-03', 6, 1, 16.67],
          ],
        },
      },
      {
        seed: `INSERT INTO charges VALUES
  (1, 'Tall Pines', 10, '2026-09-09', true),
  (2, 'Tall Pines', 10, '2026-09-09', false),
  (3, 'Tall Pines', 10, '2026-09-09', false),
  (4, 'Tall Pines', 10, '2026-09-09', false),
  (5, 'Tall Pines', 10, '2026-09-09', false),
  (6, 'Tall Pines', 10, '2026-09-09', false),
  (7, 'Tall Pines', 10, '2026-09-09', false);`,
        expected: { columns: ['created_on', 'charges', 'refunded', 'refund_rate_pct'], rows: [['2026-09-09', 7, 1, 14.29]] },
      },
    ],
    reference: {
      code: `SELECT created_on,
       COUNT(*) AS charges,
       COUNT(*) FILTER (WHERE refunded) AS refunded,
       ROUND(100.0 * COUNT(*) FILTER (WHERE refunded) / COUNT(*), 2)::float AS refund_rate_pct
FROM charges
GROUP BY created_on
ORDER BY created_on;`,
      approach:
        'Group by day; `COUNT(*)` gives all charges and a filtered count gives the refunded ones. Multiplying by `100.0` makes the division numeric instead of integer, and `ROUND(…, 2)::float` fixes the precision. Grouping and sorting are O(n log n).',
    },
  },
  {
    slug: 'first-overdraft-entry',
    title: 'First overdraft entry per account',
    kind: 'sql',
    difficulty: 'hard',
    rating: 1750,
    skillId: 'sql-querying',
    topics: ['sql'],
    roles: ['payments', 'backend', 'data'],
    statement: `Each ledger account starts at a balance of 0. Its entries apply in order of \`posted_on\`, then \`id\` (entries on the same day apply in id order). \`amount_cents\` is positive for credits and negative for debits.

The **running balance** after an entry is the sum of that entry and every earlier entry of the same account. For each account whose running balance ever drops **below zero**, return the first entry that takes it there:

- \`account\`, \`id\` and \`posted_on\` of that entry,
- \`balance_cents\`: the running balance right after it.

A balance of exactly 0 is not an overdraft. Accounts that never go below zero are left out. Order by \`account\` ascending.`,
    constraints: ['ids are unique, but id order and date order can disagree.', 'Later dips after the first one are ignored.'],
    hints: [
      'A running total per account is SUM(...) OVER (PARTITION BY account ORDER BY ...).',
      'Order the window by posted_on and then id so every entry has a single, well-defined position.',
      'Compute the running balance in one CTE, keep rows with balance < 0, number them per account with ROW_NUMBER in the same order, and keep row 1.',
    ],
    complexity: { time: 'O(n log n)', space: 'O(n)' },
    parSec: 1800,
    schema: LEDGER_SCHEMA,
    ordered: true,
    samples: [
      {
        seed: `INSERT INTO ledger_entries VALUES
  (1, 'acct-17', '2026-01-01', 5000),
  (2, 'acct-17', '2026-01-02', -3000),
  (3, 'acct-17', '2026-01-03', -2500),
  (4, 'acct-17', '2026-01-04', -100),
  (5, 'acct-22', '2026-01-01', 1000),
  (6, 'acct-22', '2026-01-05', -1000);`,
        expected: { columns: ['account', 'id', 'posted_on', 'balance_cents'], rows: [['acct-17', 3, '2026-01-03', -500]] },
        explanation: 'acct-17 goes 5000, 2000, -500: entry 3 is the first dip. acct-22 only reaches 0, which is not an overdraft.',
      },
    ],
    hidden: [
      {
        seed: '',
        expected: { columns: ['account', 'id', 'posted_on', 'balance_cents'], rows: [] },
      },
      {
        seed: `INSERT INTO ledger_entries VALUES
  (1, 'acct-31', '2026-02-03', 900),
  (2, 'acct-31', '2026-02-02', -700);`,
        expected: { columns: ['account', 'id', 'posted_on', 'balance_cents'], rows: [['acct-31', 2, '2026-02-02', -700]] },
      },
      {
        seed: `INSERT INTO ledger_entries VALUES
  (5, 'acct-40', '2026-03-01', -200),
  (4, 'acct-40', '2026-03-01', 300),
  (6, 'acct-41', '2026-03-01', -1),
  (7, 'acct-41', '2026-03-02', -5);`,
        expected: { columns: ['account', 'id', 'posted_on', 'balance_cents'], rows: [['acct-41', 6, '2026-03-01', -1]] },
      },
      {
        seed: `INSERT INTO ledger_entries VALUES
  (1, 'acct-a', '2026-04-01', -100),
  (2, 'acct-a', '2026-04-02', 500),
  (3, 'acct-a', '2026-04-03', -900),
  (4, 'acct-b', '2026-04-01', 100),
  (5, 'acct-b', '2026-04-02', -50),
  (6, 'acct-b', '2026-04-03', -60),
  (7, 'acct-c', '2026-04-01', 0);`,
        expected: {
          columns: ['account', 'id', 'posted_on', 'balance_cents'],
          rows: [
            ['acct-a', 1, '2026-04-01', -100],
            ['acct-b', 6, '2026-04-03', -10],
          ],
        },
      },
    ],
    reference: {
      code: `WITH running AS (
  SELECT account, id, posted_on,
         SUM(amount_cents) OVER (PARTITION BY account ORDER BY posted_on, id) AS balance_cents
  FROM ledger_entries
),
dips AS (
  SELECT account, id, posted_on, balance_cents,
         ROW_NUMBER() OVER (PARTITION BY account ORDER BY posted_on, id) AS rn
  FROM running
  WHERE balance_cents < 0
)
SELECT account, id, posted_on, balance_cents
FROM dips
WHERE rn = 1
ORDER BY account;`,
      approach:
        'A windowed `SUM` ordered by `(posted_on, id)` gives each entry its running balance; the order key is unique, so the default frame covers exactly the entries up to and including the current one. Filter to negative balances, then `ROW_NUMBER` in the same order picks the earliest dip per account. Both windows sort the rows: O(n log n).',
    },
  },
]
