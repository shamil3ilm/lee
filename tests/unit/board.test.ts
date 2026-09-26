import { describe, expect, it } from 'vitest'
import { findColumn, findItem, groupBy, groupedKey, moveItem, wipState } from '@/lib/board/move'
import { parseBoardView, viewHref } from '@/lib/board/view'

type Col = 'todo' | 'doing' | 'done'
const COLS: readonly Col[] = ['todo', 'doing', 'done']
interface Item {
  id: string
  version?: string
  status: Col
}

const grouped = (): Record<Col, Item[]> => ({
  todo: [
    { id: 'a', status: 'todo' },
    { id: 'b', status: 'todo' },
  ],
  doing: [{ id: 'c', status: 'doing' }],
  done: [],
})

describe('board move helpers', () => {
  it('finds the column and item', () => {
    const g = grouped()
    expect(findColumn(g, COLS, 'c')).toBe('doing')
    expect(findColumn(g, COLS, 'zzz')).toBeNull()
    expect(findItem(g, COLS, 'b')).toEqual({ item: g.todo[1], column: 'todo' })
    expect(findItem(g, COLS, 'zzz')).toBeNull()
  })

  it('moves immutably to the top of the target column and applies the transform', () => {
    const g = grouped()
    const next = moveItem(g, 'b', 'todo', 'doing', (i, to) => ({ ...i, status: to }))
    expect(next.todo.map((i) => i.id)).toEqual(['a'])
    expect(next.doing.map((i) => i.id)).toEqual(['b', 'c'])
    expect(next.doing[0]!.status).toBe('doing')
    // Input untouched.
    expect(g.todo.map((i) => i.id)).toEqual(['a', 'b'])
    expect(g.todo[1]!.status).toBe('todo')
    expect(next.done).toBe(g.done)
  })

  it('is a no-op for same-column moves and unknown ids', () => {
    const g = grouped()
    expect(moveItem(g, 'a', 'todo', 'todo')).toBe(g)
    expect(moveItem(g, 'nope', 'todo', 'done')).toBe(g)
    expect(moveItem(g, 'c', 'todo', 'done')).toBe(g)
  })

  it('builds a key that changes with ids, columns and versions', () => {
    const g = grouped()
    const k = groupedKey(g, COLS)
    expect(groupedKey(grouped(), COLS)).toBe(k)
    expect(groupedKey(moveItem(g, 'a', 'todo', 'done'), COLS)).not.toBe(k)
    const versioned = { ...g, doing: [{ id: 'c', status: 'doing' as const, version: '2' }] }
    expect(groupedKey(versioned, COLS)).not.toBe(k)
  })

  it('groups a flat list and drops unknown columns', () => {
    const out = groupBy(
      [
        { id: '1', s: 'todo' },
        { id: '2', s: 'weird' },
        { id: '3', s: 'done' },
      ],
      COLS,
      (x) => ((COLS as readonly string[]).includes(x.s) ? (x.s as Col) : null),
    )
    expect(out.todo.map((x) => x.id)).toEqual(['1'])
    expect(out.doing).toEqual([])
    expect(out.done.map((x) => x.id)).toEqual(['3'])
  })

  it('classifies WIP state', () => {
    expect(wipState(3, undefined)).toBe('none')
    expect(wipState(3, 0)).toBe('none')
    expect(wipState(2, 3)).toBe('ok')
    expect(wipState(3, 3)).toBe('at')
    expect(wipState(4, 3)).toBe('over')
  })
})

describe('board view param', () => {
  it('parses ?view= against a default', () => {
    expect(parseBoardView('board', 'list')).toEqual({ view: 'board', explicit: true })
    expect(parseBoardView('list', 'board')).toEqual({ view: 'list', explicit: true })
    expect(parseBoardView(undefined, 'list')).toEqual({ view: 'list', explicit: false })
    expect(parseBoardView('grid', 'board')).toEqual({ view: 'board', explicit: false })
    expect(parseBoardView(['board'], 'list')).toEqual({ view: 'list', explicit: false })
  })

  it('builds hrefs keeping filters and dropping the page', () => {
    expect(viewHref('/todos', { filter: 'week', page: '3', view: 'list' }, 'board')).toBe(
      '/todos?filter=week&view=board',
    )
    expect(viewHref('/contacts', {}, 'list')).toBe('/contacts?view=list')
  })
})
