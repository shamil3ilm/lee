// @vitest-environment happy-dom
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }))

const { Board } = await import('@/components/board/board')

type Col = 'todo' | 'done'
interface Item {
  id: string
  title: string
}
type Result = { success: true } | { error: string }

const COLUMNS = [
  { id: 'todo' as const, title: 'To do', tone: 'neutral' as const, wipLimit: 1 },
  { id: 'done' as const, title: 'Done', tone: 'success' as const, emptyText: 'Nothing finished' },
]

function renderBoard(onMove: (item: Item, from: Col, to: Col) => Promise<Result>) {
  const items: Record<Col, Item[]> = {
    todo: [
      { id: 't1', title: 'Write cover letter' },
      { id: 't2', title: 'Email recruiter' },
    ],
    done: [],
  }
  return render(
    createElement(Board<Col, Item>, {
      id: 'test',
      label: 'Test board',
      columns: COLUMNS,
      items,
      itemLabel: (i: Item) => i.title,
      renderCard: (i: Item) => createElement('span', null, i.title),
      onMove,
    }),
  )
}

/** The drag layer swaps in after its chunk loads; interact once it's there. */
async function dndReady(): Promise<void> {
  await waitFor(() => expect(document.querySelector('[id^="DndLiveRegion"]')).not.toBeNull())
}

async function moveViaMenu(title: string, target: string): Promise<void> {
  const trigger = screen.getAllByRole('button', { name: `Actions for ${title}` })[0]!
  fireEvent.keyDown(trigger, { key: 'Enter' })
  const item = await screen.findByRole('menuitem', { name: target })
  fireEvent.click(item)
}

function column(name: string): HTMLElement {
  return screen.getByRole('group', { name })
}

afterEach(() => {
  cleanup()
  toast.success.mockClear()
  toast.error.mockClear()
  window.localStorage.clear()
})

describe('Board', () => {
  it('renders columns, counts, the WIP warning and empty copy', () => {
    renderBoard(async () => ({ success: true }))
    expect(screen.getByRole('region', { name: 'Test board' })).toBeInTheDocument()
    expect(within(column('To do')).getByText('2/1')).toBeInTheDocument()
    expect(within(column('To do')).getByText(/Over the soft limit of 1/)).toBeInTheDocument()
    expect(within(column('Done')).getByText('Nothing finished')).toBeInTheDocument()
  })

  it('moves optimistically, persists, toasts and announces', async () => {
    const onMove = vi.fn(async (): Promise<Result> => ({ success: true }))
    renderBoard(onMove)
    await dndReady()
    await act(async () => moveViaMenu('Email recruiter', 'Done'))
    expect(within(column('Done')).getByText('Email recruiter')).toBeInTheDocument()
    expect(onMove).toHaveBeenCalledWith({ id: 't2', title: 'Email recruiter' }, 'todo', 'done')
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Moved to Done'))
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('Moved Email recruiter to Done.')
  })

  it('rolls back with a friendly toast when the server action fails', async () => {
    let settle: (v: Result) => void = () => undefined
    const onMove = vi.fn(() => new Promise<Result>((r) => (settle = r)))
    renderBoard(onMove)
    await dndReady()
    await act(async () => moveViaMenu('Write cover letter', 'Done'))
    // Optimistic: already in Done while the action is in flight.
    expect(within(column('Done')).getByText('Write cover letter')).toBeInTheDocument()
    await act(async () => settle({ error: 'Could not update todo.' }))
    await waitFor(() =>
      expect(within(column('To do')).getByText('Write cover letter')).toBeInTheDocument(),
    )
    expect(within(column('Done')).queryByText('Write cover letter')).toBeNull()
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('move Write cover letter'))
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('back in To do.')
  })

  it('refuses a vetoed move without calling the server', async () => {
    const onMove = vi.fn(async (): Promise<Result> => ({ success: true }))
    render(
      createElement(Board<Col, Item>, {
        id: 'veto',
        label: 'Veto board',
        columns: COLUMNS,
        items: { todo: [{ id: 'x', title: 'Locked card' }], done: [] },
        itemLabel: (i: Item) => i.title,
        renderCard: (i: Item) => createElement('span', null, i.title),
        onMove,
        canMove: () => 'This card is locked.',
      }),
    )
    await dndReady()
    await act(async () => moveViaMenu('Locked card', 'Done'))
    expect(onMove).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('This card is locked.')
    expect(within(column('To do')).getByText('Locked card')).toBeInTheDocument()
  })

  it('collapses and expands a column, remembering the choice', async () => {
    renderBoard(async () => ({ success: true }))
    await dndReady()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Done column' }))
    expect(await screen.findByRole('button', { name: 'Expand Done column' })).toBeInTheDocument()
    expect(window.localStorage.getItem('lee.board.test.done.collapsed')).toBe('1')
    fireEvent.click(screen.getByRole('button', { name: 'Expand Done column' }))
    expect(await screen.findByRole('button', { name: 'Collapse Done column' })).toBeInTheDocument()
  })
})
