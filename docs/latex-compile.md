# LaTeX compile services

lee compiles LaTeX documents (the editor, résumé variants and merged PDFs) through `lib/latex/compile.ts`. There are two free services and one bundled fallback:

| Order | Service | What it is |
|---|---|---|
| 1 | **latexonline.cc** (`services/latexonline.ts`) | Primary. Free, no key. Takes a ustar tarball (`tar.ts`). It runs **LaTeX 2017-01-01** with a trimmed TeX Live. |
| 2 | **YtoTech LaTeX-on-HTTP** (`services/ytotech.ts`) | Fallback. `latex.ytotech.com`, full **TeX Live 2026**. Takes JSON: the main file inline and assets in base64. |
| 3 | Bundled stand-ins (`shims.ts`) | Used last. A `.sty` injected into the tarball when no full TeX Live answered. |

## Automatic fallback (`fallback.ts`)

The editor's Recompile menu ([latex-editor.md](latex-editor.md)) chooses the **Compile service** (Automatic, Primary (latexonline.cc) or Full TeX Live (YtoTech)), the **Compiler** (pdfLaTeX, XeLaTeX or LuaLaTeX) and **On errors** (Stop on first error, or Try to compile anyway). The choice is saved on the document (`content.compileSettings`). The PDF route and the variant Drive export use it too.

With **Auto** (the default):

1. Compile on latexonline.cc.
2. If the log reports a missing `.sty`, `.cls` or font, or the service is down (5xx or 429), retry on YtoTech. A note says why: "latexonline.cc doesn't have package fontawesome5; compiled on YtoTech (full TeX Live) instead."
3. If YtoTech fails on the document itself, return *its* log, since it has every package and so shows the real error.
4. If YtoTech is down too and a missing package has a stand-in, retry on latexonline.cc with the stand-in .sty. The note says "fontawesome5 isn't available on the compile service; icons shown as text." A `.sty` the user uploaded is never replaced.

All attempts share one 45 s budget. Each attempt gets at most 25 s, and its timeout also covers reading the PDF body (a service that stalls mid-body counts as unavailable). The compile and PDF routes allow 60 s (`maxDuration`); the remaining 15 s cover the database round trips around the compile. When the browser gives up (closes the tab, cancels), the request signal aborts the compile call and no further attempt starts. No database transaction is held across a compile.

The response says which service compiled it (`x-lee-compile-service`) and why (`x-lee-compile-notes`). The editor shows "Compiled on YtoTech (full TeX Live)" over the preview and a one-time toast with the note. Notes from a failed compile appear in the logs view. The route logs `service`, `fallback` and the settings, never the source or the log.

**Cache.** The PDF cache key (`pdf-cache.ts`) includes the settings when they are not the default, so existing cache entries stay valid. Whichever service produced the PDF, it is cached the same way.

**YtoTech options.** By default YtoTech keeps going after errors (latexmk `-f`, nonstopmode) and can return a PDF for a broken document. lee sends `halt_on_error: true, force: false`, so a document fails there exactly when it would fail on latexonline.cc. With Try to compile anyway, a failing document is compiled again with `force: true`; that PDF is returned (as JSON `{ pdfBase64, log, notes }`) with the first attempt's log, and it is never cached. The main file is reported as `__main_document__.tex`; lee maps it back to `main.tex` for the log parser.

**Endpoints.** `LATEX_ONLINE_URL` and `LATEX_YTOTECH_URL` (server env, optional) replace the two service URLs. Only the e2e run sets them, to `tests/e2e/latex-stub.mjs`, so server-side compiles in e2e never leave the machine. The stub can answer a PDF, a LaTeX error, 503 or nothing at all (`POST /__test/mode`).

**When a service is down.** The PDF route answers 503 with `Retry-After: 30` when the failure was the service's (5xx, 429 or a timeout), and 422 when the document failed. A compile the browser abandons answers 499 internally and starts no further attempt.

## Hints for a missing package (`hints.ts`, `missing.ts`)

A `File 'x.sty' not found` error means the document **already loads** the package, so "add `\usepackage{x}`" was the wrong advice. The hint now says "The compile service doesn't have package X" and offers a fix based on how the document uses it:

- **unused** (none of its known commands appear outside comments): remove `\usepackage{x}`. The editor offers "Go to the \usepackage line". The user's own résumé is this case: it loads `fontawesome5` but uses no `\fa…` command.
- **used**: choose Compile service › Automatic or Full TeX Live. The editor offers a "Compile with full TeX Live" button. The hint also mentions the stand-in, if there is one.
- **not loaded by the document** (a class or another package needs it): switch the compile service.
- a missing `.cls`: upload it via Assets or switch the compile service. `fontspec` under pdfLaTeX: pick XeLaTeX or LuaLaTeX under Compiler.
- a pasted local file path: import the file (see [latex-editor.md](latex-editor.md)).

## Package availability (probed 2026-10-07)

This is a minimal `article` document per package, under pdfLaTeX unless noted. ✓ means a PDF was produced.

| Package / class | latexonline.cc | YtoTech |
|---|---|---|
| fontawesome5 | ✗ not found (any engine) | ✓ |
| fontawesome6 | ✗ not found | ✓ |
| fontawesome (v4) | ✓ | ✓ |
| academicons | ✗ old version needs XeLaTeX/LuaLaTeX (fontspec); under XeLaTeX the service answered 502 | ✓ (pdfLaTeX and XeLaTeX) |
| simpleicons | ✗ not found | ✓ |
| inter (font) | ✗ not found | ✓ |
| paracol, charter, XCharter, eso-pic, changepage, bookmark, needspace, iftex, etoolbox, titlesec, enumitem, tabularx, ragged2e, lastpage | ✓ | ✓ |
| xcolor `[dvipsnames]`, graphicx, hyperref, geometry, lmodern, multicol, tikz, tcolorbox, marvosym, pifont, fancyhdr, setspace, parskip, hyphenat, dashrule, sourcesanspro, roboto, ebgaramond, libertine | ✓ | ✓ |
| fontspec | ✓ under XeLaTeX and LuaLaTeX (✗ under pdfLaTeX, as everywhere) | ✓ under XeLaTeX and LuaLaTeX |
| xltxtra | needs XeLaTeX (as everywhere) | needs XeLaTeX |
| class moderncv, europasscv, curve | ✓ | ✓ |
| class altacv, awesome-cv, friggeri-cv, res | ✗ not in TeX Live; the `.cls` must be uploaded | ✗ same |

**Versions** (`\fmtversion` and package dates): latexonline.cc has LaTeX 2017-01-01, paracol 1.32 (2015) and enumitem 3.5.2 (2011). YtoTech has LaTeX 2025-11-01, paracol 1.37 (2025) and enumitem 3.11 (2025).

**Reproduction of the report.** A document with `\usepackage{fontawesome5}` returned 400 from latexonline.cc with `main.tex:3: error: File 'fontawesome5.sty' not found`. The same tarball contents on YtoTech produced a PDF. With Auto, lee now compiles it on YtoTech without the user doing anything, and the stand-in also compiles on latexonline.cc.

## Fallback choice and terms

| Option | Verdict |
|---|---|
| **YtoTech LaTeX-on-HTTP** (`latex.ytotech.com/builds/sync`) | **Chosen.** Free public instance with no key. The code is AGPL-3.0, but lee only calls the HTTP API and ships none of its code. It is labelled an "open beta": the API "is very likely to change", there is no SLA, and no rate limit or size limit is published. It takes binary assets (base64), so the résumé photo works, and it lets you choose the engine (pdflatex, xelatex, lualatex, platex, uplatex, context). It reports structured errors with the full `.log`. It runs TeX Live 2026 (service version 2026-04-10). A typical compile took about 0.9 s. The Docker image (`yoant/latexonhttp-python`) can be self-hosted if the public instance goes away. |
| texlive.net (`/cgi-bin/latexcgi`) | Works (full TeX Live, about 2 s), but its documented form posts file contents as text fields (`filecontents[]`), so there is no clean path for a binary photo. It is meant for learnlatex.org examples and has no API terms. Kept as a candidate, not wired. |
| Bundled stand-ins | Last resort: `fontawesome5` only (the package probed missing that résumé templates use most). It defines `\faIcon` and about 50 common `\fa…` macros, including the starred forms, as short text ("GitHub", "@", "Tel."). |

Both services are best-effort public services. lee sends a document only when the user compiles, and only to the services the compile settings allow.

## Classic layout check

The Classic template (`lib/latex/classic-layout.ts`) was compiled with synthetic data and compared, rendered to PNG at 1.5× (unpdf + @napi-rs/canvas), with the user's own Overleaf résumé. The personal file was read only for its structure and nothing from it is in the repo. The comparison measured the ink bands (top and height of every line and rule) on both pages:

- **Page margins:** text spans x = 84–832 px in both (2 cm on letter paper).
- **Header block:** the name, the title line and both contact lines start at the same y (85, 121, 147, 165 px), and the separators look the same (`\kern 5pt | \kern 5pt`).
- **Section rules:** heading → rule 7 px, rule → first line 8–9 px, and 18 px above each heading, the same in both.
- **Date alignment:** the right column is flush with the right margin (832 px), and dates are italic.
- **Bullet spacing:** line pitch 22 px, with the same tight `highlights` spacing.

One difference came from the service, not the template. The LaTeX of 2017 on latexonline.cc dropped the 0.14 cm `\vspace` between entries that comes right before paracol, so entries sat 6 px closer than on current TeX Live. The template's `\entrygap` uses that `\vspace` on LaTeX 2020 and later. On older LaTeX it uses an empty box of the same visual size. The entries now match within 1 px (sub-pixel rounding) on both services.
