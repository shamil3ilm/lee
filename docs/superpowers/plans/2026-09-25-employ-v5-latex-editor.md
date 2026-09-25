# Employ v5 LaTeX Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`.

**Goal:** Ship v5 — Overleaf-like LaTeX editor for CVs and cover letters, with live PDF preview via `latexonline.cc`, template library, and AI seeding.

**Spec:** `docs/superpowers/specs/2026-09-25-employ-v5-latex-editor-design.md`
**Depends on:** v1-v4 all shipped.

**Working dir:** `employ`

---

## Phase L1 — Types + templates

**Files:**
- Modify: `lib/documents/types.ts` — add `latexDocumentContentSchema`
- Create: `lib/latex/templates/moderncv-classic.tex`, `awesome-cv.tex`, `altacv-tw.tex` (each a full valid `.tex` file with `{{PLACEHOLDER}}` markers)
- Create: `lib/latex/templates/index.ts` — TEMPLATES array + `fillTemplate(templateId, master)` function
- Modify: `lib/db/queries/documents.ts` — extend `DocumentKind` with `'latex_cv' | 'latex_cover_letter'`

- [ ] Zod schema for `LatexDocumentContent` (`source`, optional `templateId`, `compiledAt`, `compileError`, `compileLog`)
- [ ] Three `.tex` templates with placeholder markers matching MasterCV shape (`{{name}}`, `{{headline}}`, `{{summary}}`, `{{experience_block}}`, `{{projects_block}}`, `{{education_block}}`, `{{skills_block}}`, `{{contact_line}}`)
- [ ] `fillTemplate(templateId, master): string` — reads the template file, does string replacement with MasterCV fields, returns filled source. Complex fields (experience[], projects[]) get their own tex-rendering helpers per template style.

Commit: `feat(latex): types + 3 seeded templates`

## Phase L2 — Compilation route

**Files:**
- Create: `app/api/latex/compile/route.ts`
- Test: `tests/unit/latex-compile.test.ts` (mocked fetch to latexonline.cc)

- [ ] Route accepts POST with JSON body `{source: string}`. Streams `.tex` as multipart to `https://latexonline.cc/data?target=main.tex&command=pdflatex`. Returns PDF bytes on success, `{error, log}` JSON on failure (422).
- [ ] Auth via `auth()` — return 401 JSON on unsigned.
- [ ] Update document row's `compiledAt`, clear `compileError` on success; on failure set `compileError` + `compileLog`. Requires documentId in body: extend request shape to `{documentId, source}`.
- [ ] `dynamic='force-dynamic'`, `runtime='nodejs'`, `maxDuration=30`

Commit: `feat(latex): server-side compile route via latexonline.cc`

## Phase L3 — PDF preview route override

**Files:**
- Modify: `app/api/documents/[id]/pdf/route.ts` — for `kind='latex_cv'` or `'latex_cover_letter'`, look up latest cached PDF if compile succeeded; else invoke compile route inline

Simplest approach: after L2, we always have a compiled PDF cached OR the compile route stores the compiled bytes somewhere. Since we don't have blob storage, either:
- **Option A**: Recompile on every GET (slow, expensive)
- **Option B**: Store the compiled PDF bytes as base64 in the document content (bloats DB rows to ~200KB each)
- **Option C**: Return the last successful `compiledAt` metadata + a link to trigger recompile

Go with **Option A but with `Cache-Control: public, max-age=60`** — Vercel edge caches for a minute per document. Recompile happens on preview iframe refresh after edit.

Commit: `feat(latex): pdf route dispatches to compile for latex docs`

## Phase L4 — AI seeding

**Files:**
- Modify: `lib/ai/types.ts` — add `generateLatexCV` method
- Modify: `lib/ai/gemini.ts`, `lib/ai/groq.ts`, `lib/ai/fixtures.ts` — implement
- Create: `lib/ai/prompts/generate-latex-cv.ts`

- [ ] Interface + Zod schema for `{source: string}`
- [ ] Prompt instructs: produce complete valid LaTeX using pdflatex-compatible packages, style hint by templateId, fill with master CV content, output ONLY .tex source, strip any ```latex fencing
- [ ] Provider implementations use existing generate + parse pattern
- [ ] Fixture returns hardcoded minimal `\documentclass{article}\begin{document}Test\end{document}` for tests

Commit: `feat(ai): generateLatexCV method`

## Phase L5 — Document creation flow

**Files:**
- Create: `app/(authed)/documents/new/latex/page.tsx` — template picker
- Create: `app/(authed)/documents/new/latex/actions.ts` — `createLatexDoc(templateId | 'blank' | 'ai')` server action
- Modify: `components/documents-table.tsx` — add "+ LaTeX CV" button in the header (in addition to any existing new-doc affordances)

- [ ] Grid of 3 template cards + "Blank" + "Generate from master CV" — click creates a `documents` row (kind='latex_cv', content filled from template or AI, applicationId=null), redirects to `/documents/[id]/edit`
- [ ] AI generation server action awaits `ai.generateLatexCV`, retries once if the source doesn't start with `\documentclass`

Commit: `feat(latex): template picker + doc creation`

## Phase L6 — Editor page

**Files:**
- Install: `pnpm add @monaco-editor/react`
- Create: `app/(authed)/documents/[id]/edit/page.tsx` — server page loads document
- Create: `components/latex-editor.tsx` — client component with split-pane Monaco + PDF preview
- Modify: `next.config.ts` — externalize `@monaco-editor/react` if bundling issues

**LatexEditor client component:**
- Dynamic import Monaco (avoid SSR issues): `const Monaco = dynamic(() => import('@monaco-editor/react'), { ssr: false })`
- Load monaco from CDN via loader config to avoid worker bundling
- Local state: `source: string`, `compiling: boolean`, `error: string | null`, `previewKey: number` (cache-buster)
- On mount, `source` initialized from `document.content.source`
- On edit: update local state, debounce 1500ms → POST to `/api/latex/compile` with `{documentId, source}`; on success increment previewKey to refresh iframe; on error set error state
- Save button: POST to save action which persists source to documents.content
- Compile button: manual trigger (bypass debounce)
- Download button: `Blob([source], {type:'application/x-tex'})` → object URL → download

**Header bar:** Title (editable inline), Template dropdown (if templateId set, disabled — no template swap in v5), Save button, Compile button, Download button

**Preview iframe:** `<iframe src={/api/documents/${id}/pdf?v=${previewKey}} className="w-full h-full" />`

**Error panel:** slides up from bottom of preview when `error` is set; shows first 500 chars of error log with monospace font

Commit: `feat(latex): monaco editor + live pdf preview`

## Phase L7 — Documents library integration

**Files:**
- Modify: `components/documents-table.tsx`:
  - Extend `DocumentKind` union with `latex_cv`, `latex_cover_letter`
  - Kind badges: `latex_cv` → "LaTeX CV" indigo; `latex_cover_letter` → "LaTeX Letter" indigo
  - Filter chips extend with "LaTeX" (matches both kinds)
  - "Edit" action for LaTeX kinds opens `/documents/[id]/edit`
- Modify: `app/(authed)/documents/page.tsx` — update filter narrowing to include `latex` group

Commit: `feat(ui): document library latex integration`

## Verification

- `pnpm typecheck` clean
- `pnpm test` — 275+ passing (~10 new)
- `pnpm build` succeeds — Monaco should NOT balloon main bundle (verify with build output size)
- Manual smoke test after deploy:
  1. `/documents/new/latex` → pick moderncv → editor opens
  2. Preview compiles PDF in <5s
  3. Edit source → preview auto-updates
  4. Break syntax → error panel shows LaTeX log
  5. Download .tex → file has correct content

## Push cadence

Per-phase commits, push at end of each or batch as convenient. Vercel auto-deploys.
