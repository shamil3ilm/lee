import { test, expect, type Locator, type Page } from '@playwright/test'

// Kanban boards: move a todo and a contact across columns with the mouse
// and with the keyboard, then reload to prove the move persisted. Acts on
// seed rows no other journey touches (tests/e2e/seed-data.ts).

test.use({ viewport: { width: 1440, height: 900 } })

async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: text }).first()).toBeVisible()
}

/** The drag layer loads after hydration; wait until dnd-kit is mounted. */
async function dndReady(page: Page, board: string): Promise<Locator> {
  const region = page.locator(`[data-board="${board}"]`)
  await expect(region).toBeVisible()
  await expect(page.locator('[id^="DndLiveRegion"]')).toHaveCount(1)
  return region
}

function card(board: Locator, text: string): Locator {
  return board.locator('[data-board-card]').filter({ hasText: text }).first()
}

function column(board: Locator, id: string): Locator {
  return board.locator(`[data-board-column="${id}"]`)
}

async function mouseDrag(page: Page, from: Locator, to: Locator): Promise<void> {
  await from.scrollIntoViewIfNeeded()
  const a = await from.boundingBox()
  const b = await to.boundingBox()
  if (!a || !b) throw new Error('drag source or target not visible')
  // Grab the card's left edge (its text, not the actions menu).
  await page.mouse.move(a.x + 16, a.y + a.height / 2)
  await page.mouse.down()
  // Cross the 4px activation distance, then travel in steps so dnd-kit
  // sees the pointer enter the target column.
  await page.mouse.move(a.x + 26, a.y + a.height / 2, { steps: 3 })
  await page.mouse.move(b.x + b.width / 2, b.y + 80, { steps: 12 })
  await page.mouse.up()
}

async function keyboardMove(page: Page, target: Locator, steps: number): Promise<void> {
  await target.focus()
  await page.keyboard.press('Space')
  // dnd-kit attaches its keyboard listeners on the next tick after lifting;
  // pause briefly so each key lands on an active drag.
  await expect(page.locator('[id^="DndLiveRegion"]')).toContainText(/Picked up|is over/)
  for (let i = 0; i < steps; i++) {
    await page.waitForTimeout(150)
    await page.keyboard.press('ArrowRight')
  }
  await page.waitForTimeout(150)
  await page.keyboard.press('Space')
}

test('todos board: drag with the mouse and move with the keyboard', async ({ page }) => {
  const mouseTodo = 'Update LinkedIn headline'
  const keyTodo = 'Review Zerodha offer letter and benefits'

  await page.goto('/todos?view=board')
  let board = await dndReady(page, 'todos')
  await expect(card(column(board, 'open'), mouseTodo)).toBeVisible()

  // Mouse: To do → In progress.
  await mouseDrag(page, card(board, mouseTodo), column(board, 'in_progress'))
  await expectToast(page, 'Moved to In progress')
  await expect(card(column(board, 'in_progress'), mouseTodo)).toBeVisible()

  // Keyboard: To do → Waiting (two columns right).
  await keyboardMove(page, card(board, keyTodo), 2)
  await expectToast(page, 'Moved to Waiting')
  await expect(card(column(board, 'waiting'), keyTodo)).toBeVisible()
  await expect(page.locator('[role="status"][aria-live="polite"]')).toContainText(`Moved ${keyTodo} to Waiting.`)

  // Persisted.
  await page.reload()
  board = await dndReady(page, 'todos')
  await expect(card(column(board, 'in_progress'), mouseTodo)).toBeVisible()
  await expect(card(column(board, 'waiting'), keyTodo)).toBeVisible()

  // The list view shows the new statuses as badges.
  await page.goto('/todos?view=list')
  const row = page.locator('li').filter({ hasText: keyTodo })
  await expect(row.getByText('Waiting', { exact: true })).toBeVisible()
})

test('contacts board: drag with the mouse and move with the keyboard', async ({ page }) => {
  const mouseContact = 'Karthik Iyer'
  const keyContact = 'Emma Walsh'

  await page.goto('/contacts?view=board')
  let board = await dndReady(page, 'contacts')
  await expect(card(column(board, 'to_contact'), mouseContact)).toBeVisible()

  // Mouse: To contact → Contacted.
  await mouseDrag(page, card(board, mouseContact), column(board, 'contacted'))
  await expectToast(page, 'Moved to Contacted')
  await expect(card(column(board, 'contacted'), mouseContact)).toBeVisible()

  // Keyboard: To contact → Replied.
  await keyboardMove(page, card(board, keyContact), 2)
  await expectToast(page, 'Moved to Replied')
  await expect(card(column(board, 'replied'), keyContact)).toBeVisible()

  // Persisted, and the list view shows the stage.
  await page.reload()
  board = await dndReady(page, 'contacts')
  await expect(card(column(board, 'contacted'), mouseContact)).toBeVisible()
  await expect(card(column(board, 'replied'), keyContact)).toBeVisible()
})

test('board view is remembered per page', async ({ page }) => {
  await page.goto('/contacts?view=board')
  await expect(page.locator('[data-board="contacts"]')).toBeVisible()
  await page.getByRole('link', { name: 'List' }).click()
  await expect(page).toHaveURL(/view=list/)
  // No explicit view: the last choice (list) wins.
  await page.goto('/contacts')
  await expect(page.locator('[data-board="contacts"]')).toHaveCount(0)
  await page.getByRole('link', { name: 'Board' }).click()
  await expect(page.locator('[data-board="contacts"]')).toBeVisible()
  await page.goto('/contacts')
  await expect(page).toHaveURL(/view=board/)
  await expect(page.locator('[data-board="contacts"]')).toBeVisible()
})
