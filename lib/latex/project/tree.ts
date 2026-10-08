// A file tree for flat path lists: the editor's Files panel and the zip
// import review. Folders come first in each folder, like Overleaf.

export type TreeRow =
  | { type: 'folder'; path: string; name: string; depth: number }
  | { type: 'file'; path: string; name: string; depth: number }

interface Node {
  folders: Map<string, Node>
  files: string[]
}

function emptyNode(): Node {
  return { folders: new Map(), files: [] }
}

/**
 * Rows in display order: every folder (once, before its contents) and every
 * file, with its depth. `compareFiles` orders files inside one folder
 * (default: by name).
 */
export function treeRows(
  paths: readonly string[],
  compareFiles: (a: string, b: string) => number = (a, b) => a.localeCompare(b),
): TreeRow[] {
  const root = emptyNode()
  for (const path of paths) {
    const segments = path.split('/')
    let node = root
    for (const seg of segments.slice(0, -1)) {
      let next = node.folders.get(seg)
      if (!next) {
        next = emptyNode()
        node.folders.set(seg, next)
      }
      node = next
    }
    node.files.push(path)
  }
  const rows: TreeRow[] = []
  const walk = (node: Node, prefix: string, depth: number) => {
    for (const name of [...node.folders.keys()].sort((a, b) => a.localeCompare(b))) {
      const path = prefix ? `${prefix}/${name}` : name
      rows.push({ type: 'folder', path, name, depth })
      walk(node.folders.get(name)!, path, depth + 1)
    }
    for (const path of [...node.files].sort(compareFiles)) {
      rows.push({ type: 'file', path, name: path.slice(path.lastIndexOf('/') + 1), depth })
    }
  }
  walk(root, '', 0)
  return rows
}

/** Rows left visible when the given folders are collapsed. */
export function visibleRows(rows: readonly TreeRow[], collapsed: ReadonlySet<string>): TreeRow[] {
  if (collapsed.size === 0) return [...rows]
  return rows.filter((r) => {
    const parts = r.path.split('/')
    for (let i = 1; i < parts.length; i++) if (collapsed.has(parts.slice(0, i).join('/'))) return false
    return true
  })
}
