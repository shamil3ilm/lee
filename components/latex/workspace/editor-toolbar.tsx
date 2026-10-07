'use client'
import {
  AArrowDown,
  AArrowUp,
  Bold,
  Heading1,
  Heading2,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Omega,
  Redo2,
  Search,
  Sigma,
  Table,
  Undo2,
} from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { SYMBOLS, type ToolbarCommand } from '@/lib/latex/editor-commands'
import { IconButton } from './icon-button'

interface EditorToolbarProps {
  onUndo: () => void
  onRedo: () => void
  onCommand: (command: ToolbarCommand) => void
  onSymbol: (latex: string) => void
  onFind: () => void
  fontSize: number
  onFontSize: (direction: 1 | -1) => void
}

function Divider() {
  return <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden="true" />
}

/**
 * Formatting and insert tools above the code. There is no rich "Visual"
 * mode, so no Code / Visual toggle is shown (a dead toggle would mislead).
 */
export function EditorToolbar(p: EditorToolbarProps) {
  const cmd = (c: ToolbarCommand) => () => p.onCommand(c)
  return (
    <div role="toolbar" aria-label="Formatting" className="flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-b px-1.5">
      <IconButton label="Undo" tip="Undo (Ctrl/⌘+Z)" onClick={p.onUndo}>
        <Undo2 />
      </IconButton>
      <IconButton label="Redo" tip="Redo (Ctrl/⌘+Shift+Z)" onClick={p.onRedo}>
        <Redo2 />
      </IconButton>
      <Divider />
      <IconButton label="Smaller text" tip={`Code text smaller (${p.fontSize}px)`} onClick={() => p.onFontSize(-1)}>
        <AArrowDown />
      </IconButton>
      <IconButton label="Larger text" tip={`Code text larger (${p.fontSize}px)`} onClick={() => p.onFontSize(1)}>
        <AArrowUp />
      </IconButton>
      <Divider />
      <IconButton label="Bold" tip="Bold: \textbf{…}" onClick={cmd('bold')}>
        <Bold />
      </IconButton>
      <IconButton label="Italic" tip="Italic: \textit{…}" onClick={cmd('italic')}>
        <Italic />
      </IconButton>
      <Divider />
      <IconButton label="Section" tip="Insert \section" onClick={cmd('section')}>
        <Heading1 />
      </IconButton>
      <IconButton label="Subsection" tip="Insert \subsection" onClick={cmd('subsection')}>
        <Heading2 />
      </IconButton>
      <IconButton label="Bulleted list" tip="Insert itemize" onClick={cmd('itemize')}>
        <List />
      </IconButton>
      <IconButton label="Numbered list" tip="Insert enumerate" onClick={cmd('enumerate')}>
        <ListOrdered />
      </IconButton>
      <IconButton label="Table" tip="Insert a table" onClick={cmd('table')}>
        <Table />
      </IconButton>
      <IconButton label="Figure" tip="Insert a figure" onClick={cmd('figure')}>
        <ImageIcon />
      </IconButton>
      <IconButton label="Link" tip="Insert \href{url}{text}" onClick={cmd('link')}>
        <Link2 />
      </IconButton>
      <IconButton label="Math" tip="Inline math: $…$" onClick={cmd('math')}>
        <Sigma />
      </IconButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton label="Symbol" tip="Insert a symbol">
            <Omega />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="grid w-56 grid-cols-6 gap-1 p-2">
          {SYMBOLS.map((s) => (
            <button
              key={s.latex}
              type="button"
              onClick={() => p.onSymbol(s.latex)}
              title={s.latex}
              aria-label={`Insert ${s.latex}`}
              className="flex h-8 items-center justify-center rounded text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {s.label}
            </button>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="ml-auto" />
      <IconButton label="Find and replace" tip="Find and replace (Ctrl/⌘+F)" onClick={p.onFind}>
        <Search />
      </IconButton>
    </div>
  )
}
