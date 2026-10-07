# LaTeX editor workspace

`/documents/[id]/edit` is laid out like Overleaf. It keeps the same structure and ergonomics, uses lee's own tokens, and has no Overleaf branding. The entry point is `components/latex-editor.tsx`, and the pieces live in `components/latex/workspace/`.

## Layout

| Area | What it holds |
|---|---|
| **Top bar** (40 px) | Back; the inline-editable title, centred; the save state ("Saved", "Saving…", "Unsaved changes", "Not saved", with autosave and Ctrl/⌘+S); **Layout** (Editor & PDF, Editor only, PDF only, swap editor and PDF, PDF in a separate tab); **More** (Import file, Download .tex, Open the PDF, Save now). On narrow screens it shows Editor / PDF tabs. |
| **Rail** | Files and outline, Search in project, Assets (the existing dialog: upload, insert snippets, attach from Drive). |
| **Files panel** | main.tex and every asset in one flat list (LaTeX sees one folder). It has New file (.tex, .bib, .sty or .cls), Upload, Delete, and drag-and-drop upload. Below it is the collapsible **File outline** of the open file. Click an entry to jump to it. |
| **Search panel** | Find in project, over main.tex and the open text files, with Match case. |
| **Editor column** | File tabs, then the toolbar: undo/redo, text size, bold/italic, section/subsection, lists, table, figure, link, math, symbols, and find and replace. Then CodeMirror, with line numbers, fold arrows, soft wrap, the active line, spell-check and lint. |
| **PDF column** | The **Recompile** split button, the Auto badge, logs with an error/warning count, download, and the last-compile time ("Compiled 2:41 PM · 1.8 s"). On the right: dark PDF, previous/next, the page "1 / 2" input, and zoom −/+ with a menu (fit to width, fit to page, 50–200%). Below: the PDF, the logs view, or the empty / loading state. |

**Splits.** You can drag the side panel and the editor/PDF split, or focus a handle and use the arrow keys. The arrows on the split handle collapse either pane, and an edge button brings it back. Sizes, layout, pane order, panel, font size, Fast mode and dark PDF are remembered per viewer (`lee.latex.editorPrefs`, parsed and clamped by `lib/latex/editor-prefs.ts`).

**Responsive**, by the workspace's own width (it sits beside the app sidebar):

- 1100 px and up: panel, editor and PDF side by side.
- 720–1099 px: the panel opens over the editor from the rail.
- Under 720 px: one pane at a time, switched with the Editor / PDF tabs.

There is never a horizontal page scroll; the formatting toolbar scrolls inside itself.

## Recompile menu

| Item | Effect |
|---|---|
| Recompile (Ctrl/⌘+Enter) | Compile now. Ctrl/⌘+S saves and compiles. |
| Clear cache and recompile | Sends `fresh: true`, which skips the server's PDF cache. |
| Auto compile ✓ | "Recompiles a moment after you stop typing" (2.5 s debounce, 5 s max wait). Per viewer. |
| Compile mode: Normal / Fast (draft) | Fast uses graphicx `draft` (images drawn as boxes) and is never cached. |
| Compiler | pdfLaTeX, XeLaTeX or LuaLaTeX. Saved on the document. |
| Compile service | Automatic, Primary (latexonline.cc) or Full TeX Live (YtoTech). Saved on the document. See [latex-compile.md](latex-compile.md). |
| On errors: Stop on first error / Try to compile anyway | "Anyway" retries a failing document on YtoTech with latexmk `-f` and shows that PDF together with the error log. It is never cached, and it is disabled when the service is Primary only. |

## Errors, imports and paths

- **Logs.** The count chip opens the logs view in place of the PDF. Each problem shows its file and line; click it to jump to that line in the editor. The suggestion comes from `lib/latex/hints.ts`. Missing-package fixes have one-click actions: "Compile with full TeX Live" and "Go to the \usepackage line". Fallback notes and the collapsible raw log appear here too.
- **Import file.** From the More menu, Upload, or drag-and-drop on the file tree or the code. A `.tex` file asks whether to replace main.tex (undoable) or to be added as a separate file. Images, `.bib`, `.sty` and `.cls` files become assets, and an image dropped on the code also inserts its `\includegraphics`.
- **Path paste.** A paste, or a whole main.tex, that is only a local path (`C:\Users\…\resume.tex`, a quoted path, `/home/…/cv.tex`, `file://…`) is caught by `lib/latex/path-paste.ts`. Instead of compiling, the editor shows a banner: "That's a file path, not LaTeX. Browsers can't open files from your computer by their path. Import resume.tex instead?" It offers Import, plus Paste as text for a paste. The hint parser gives the same message, never "\Users is undefined, add a \usepackage".

## PDF viewer

`pdf-viewer.tsx` uses pdf.js, from the full build that `unpdf` already ships (`unpdf/pdfjs`), so there is no new dependency. It is lazy-loaded with the PDF pane. Each page is a canvas at the device pixel ratio with a selectable text layer (`.lee-pdf-text-layer` in `globals.css`), in a continuous scroll on a neutral background. A recompile paints each page offscreen and copies it over the old one, so there is no blank flash or layout shift. pdf.js has no cheap per-page diff, so every page is re-rendered, and a résumé is one or two pages. The browser's native PDF viewer is no longer used.

## Not included (and why)

- **History.** LaTeX documents have no version history. Résumé variants are versioned in Settings › Profile instead.
- **Visual mode.** lee has no rich-text LaTeX mode, so the Code / Visual toggle is hidden rather than shown dead.
- **SyncTeX (double-click PDF → source).** Neither compile service returns a `.synctex.gz` through the calls lee makes (latexonline.cc returns only the PDF; YtoTech's sync build returns only the PDF), so it is skipped.
- **Folders.** Both services compile one flat folder, so there is no New folder. Saving an edited text asset replaces it (delete, then upload). If the upload fails, the previous text is put back.
