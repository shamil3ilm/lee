'use client'
import dynamic from 'next/dynamic'

/**
 * Page boards, split out of each page's first-load bundle. Pages default to
 * their list view, so the board code (and its card renderers) only loads
 * when `?view=board` actually renders one. Still server-rendered: the
 * static board is in the HTML; its chunk loads alongside for hydration.
 * The dashboard pipeline board is always visible and imports Kanban
 * directly.
 */
export const LazyKanban = dynamic(() => import('@/components/kanban').then((m) => m.Kanban))

export const LazyTodosBoard = dynamic(() =>
  import('@/components/todos-board').then((m) => m.TodosBoard),
)

export const LazyContactsBoard = dynamic(() =>
  import('@/components/contacts-board').then((m) => m.ContactsBoard),
)

export const LazyDiscoveriesBoard = dynamic(() =>
  import('@/components/discoveries-board').then((m) => m.DiscoveriesBoard),
)

export const LazyStagesBoard = dynamic(() =>
  import('@/components/stages-board').then((m) => m.StagesBoard),
)
