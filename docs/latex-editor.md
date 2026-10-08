# LaTeX editor workspace

`/documents/[id]/edit` is laid out like Overleaf. It keeps the same structure and ergonomics, uses lee's own tokens, and has no Overleaf branding. The entry point is `components/latex-editor.tsx`, and the pieces live in `components/latex/workspace/`.

## Layout

| Area | What it holds |
|---|---|
| **Top bar** (40 px) | Back; the inline-editable title; the save state ("Saved", "Saving…", "Unsaved changes", "Not saved", with autosave and Ctrl/⌘+S); the **Recompile** split button, the Auto badge and the logs chip with the error/warning count, in every layout; **Layout** (Editor & PDF, Editor only, PDF only, swap editor and PDF, PDF in a separate tab); **More** (Import file, Import project (.zip), Download .tex, Download project (.zip), Open the PDF, Save now). On narrow screens it shows Editor / PDF tabs, Recompile is icon-only, opening the logs switches to the PDF, and a compile started from the Editor view shows the PDF when it succeeds. |
| **Rail** | Files and outline, Search in project, Assets (the existing dialog: upload, insert snippets, attach from Drive). |
| **Files panel** | main.tex and every asset as a folder tree (folders first, collapsible). It has New file (.tex, .bib, .sty or .cls), Upload, Import project (.zip), Delete, and drag-and-drop upload (a dropped .zip is imported as a project). Below it is the collapsible **File outline** of the open file. Click an entry to jump to it. |
| **Search panel** | Find in project, over main.tex and the open text files, with Match case. |
| **Editor column** | File tabs, then the toolbar: undo/redo, text size, bold/italic, section/subsection, lists, table, figure, link, math, symbols, and find and replace. Then CodeMirror, with line numbers, fold arrows, soft wrap, the active line, spell-check and lint. |
| **PDF column** | Download and the last-compile time ("Compiled 2:41 PM · 1.8 s"). On the right: dark PDF, previous/next, the page "1 / 2" input, and zoom −/+ with a menu (fit to width, fit to page, 50–200%). Below: the PDF, the logs view, or the empty / loading state. |

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

## Project import and export (.zip)

An Overleaf project (Menu › Download › Source) or any LaTeX project zip can be imported from **Documents › New › Import project (.zip)** or by dropping the zip on the documents list (a new document), and from the editor's **More** menu or the Files panel, or by dropping it on the file tree or the code (the open document: **Replace project** or **Add files**). The code is in `lib/latex/project/` and `components/latex/project-import/`.

**In the browser.** The zip is read with fflate, which loads only with the review dialog (the bundle check fails if it reaches a route's initial JavaScript), so big uploads never pass through a function. Before anything is stored:

| Guard | Limit |
|---|---|
| The .zip file | 25 MB |
| Total uncompressed (declared sizes of the files read) | 25 MB; over it the archive is refused |
| One file | 10 MB uncompressed; bigger files are skipped with the reason |
| Entries in the central directory | 300 |
| Compression ratio | over 100× on a file of 1 MB or more is a zip bomb; the archive is refused |
| Paths | absolute paths and `..` segments (zip-slip) refuse the archive; `\` becomes `/`; `__MACOSX/`, `.DS_Store`, `Thumbs.db`, `desktop.ini` and hidden files are skipped |
| Types | .tex .bib .bst .cls .sty .bbx .cbx .def .cfg .clo .fd .txt .md .csv .dat, .png .jpg .jpeg .pdf .eps .svg, .otf .ttf. Anything else is listed as skipped with its type |

fflate inflates into a buffer of the declared size and never grows it, so a lying archive cannot use more memory than these caps. A single folder wrapping the whole project (GitHub-style zips) is removed.

**Review.** The dialog shows the file tree with sizes, the main file, the compiler, warnings (referenced files missing from the zip, with file and line; unsupported files; a project over 10 MB), what was renamed and rewritten, and what was skipped and why. Nothing is stored until **Import**.

**Main file.** A `@default_files` in latexmkrc or a `% !TEX root = …` line wins when it names a complete document (`\documentclass` and `\begin{document}` outside comments); then main.tex at the top; then the only complete document. With several and no hint, the user picks. The main file becomes the document source and compiles as main.tex at the project root. LaTeX resolves `\input` and `\includegraphics` from the working directory, as Overleaf does, so a main file from a subfolder still finds everything; its original path is kept (`content.mainFile`) for the export. A different file named main.tex is renamed main-1.tex.

**Compiler.** latexmkrc first (`$pdf_mode` 1/4/5, `$pdflatex = 'xelatex …'`, `-xelatex`/`-lualatex`), then a `% !TEX program = …` line, then the packages: fontspec, unicode-math, polyglossia, xeCJK, xltxtra or mathspec suggest XeLaTeX; luacode, luatexja, luaotfload or luatextra need LuaLaTeX. The user can change it in the review. latexmkrc itself is read, never stored (the services would run it).

**Bibliography.** `\bibliography{…}` and biblatex with `backend=bibtex` run BibTeX, which both services run. biblatex otherwise uses biber, which latexonline.cc does not run (see [latex-compile.md](latex-compile.md)), so such a project is preselected for Full TeX Live (YtoTech).

**Storage.** Folder paths are kept: both compile services take them. A path segment the storage would change (spaces, unusual characters: `my figs/a b.png` → `my_figs/a_b.png`) is renamed, a clash gets `-1`, and every `\includegraphics`, `\input`, `\include`, `\subfile`, `\includepdf`, `\bibliography`, `\addbibresource` and `\graphicspath` that pointed at it is rewritten; the review lists each rewrite. Paths are at most 100 characters and 8 levels. Each file is uploaded on its own (three at a time) through the existing asset storage: Google Drive when connected (browser-direct, 5 MB per file), otherwise Postgres through a function (4 MB per file, under the 4.5 MB body limit). The usual caps apply: 100 files per document (raised from 20 for projects) and the per-user storage quota. A file the server refuses is reported, not retried.

**After import.** The editor opens on the main file and compiles once; the missing-package fallback and hints apply as for any compile. Missing referenced files and failed uploads show above the code as a list; an entry with a line opens that file there.

**Export.** **More › Download project (.zip)** saves edited files, then zips the source (at its original main-file path) and every asset at its folder path in the browser. Importing that zip again gives the same paths and bytes; the e2e test checks the round trip.

## PDF viewer

`pdf-viewer.tsx` uses pdf.js, from the full build that `unpdf` already ships (`unpdf/pdfjs`), so there is no new dependency. It is lazy-loaded with the PDF pane. Each page is a canvas at the device pixel ratio with a selectable text layer (`.lee-pdf-text-layer` in `globals.css`), in a continuous scroll on a neutral background. A recompile paints each page offscreen and copies it over the old one, so there is no blank flash or layout shift. pdf.js has no cheap per-page diff, so every page is re-rendered, and a résumé is one or two pages. The browser's native PDF viewer is no longer used.

## Not included (and why)

- **History.** LaTeX documents have no version history. Résumé variants are versioned in Settings › Profile instead.
- **Visual mode.** lee has no rich-text LaTeX mode, so the Code / Visual toggle is hidden rather than shown dead.
- **SyncTeX (double-click PDF → source).** Neither compile service returns a `.synctex.gz` through the calls lee makes (latexonline.cc returns only the PDF; YtoTech's sync build returns only the PDF), so it is skipped.
- **New folder.** Folders come from a project import; there is no New folder button yet (a file's folder is part of its name). Saving an edited text asset replaces it (delete, then upload). If the upload fails, the previous text is put back.
