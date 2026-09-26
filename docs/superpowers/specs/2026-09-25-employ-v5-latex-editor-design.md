# lee — v5 LaTeX Editor Design Spec

**Date:** 2026-09-25
**Status:** Approved — ready for implementation planning
**Scope:** Sub-project 5 of 5+ in the lee roadmap
**Depends on:** v1 + v1.5 + v2 + v3 + v4 (all shipped)

---

## 1. Overview

v5 adds an Overleaf-like LaTeX editor for CVs and cover letters — split-pane Monaco editor + live PDF preview, template library, and per-document LaTeX source storage. Complements v2's React-PDF templates (rich control over layout) rather than replacing them; users pick per-document whether to work in structured JSON (react-pdf) or freeform LaTeX.

## 2. Goals and non-goals

### In scope
- Two new document kinds: `latex_cv`, `latex_cover_letter`
- Storage: `documents.content = { source: string, compiledAt?: string, compileError?: string }`
- Editor UI at `/documents/[id]/edit` — Monaco with LaTeX syntax highlighting + auto-completion
- Split-pane preview: source on left, compiled PDF on right (iframe embed)
- Compile-on-pause: debounced 1500ms after typing stops
- Template library: 3 seeded templates (moderncv, awesome-cv, altacv-style) available when creating a new LaTeX doc
- AI seeding: "Generate LaTeX CV from master CV" button — Groq/Gemini emits complete `.tex` source based on the master CV JSON
- Download raw `.tex` source
- Compile via public LaTeX-online service — `https://latexonline.cc/` (proven, free, no auth)
- Fallback: if compile API fails, show error inline + still allow source download

### Explicitly out of scope
- Real-time collaborative editing (single user)
- Custom package uploads (`.sty` files) — templates use CTAN packages only
- BibTeX/citation manager (not relevant for CVs)
- Version diff viewer (documents already version-track via v2 pattern)
- Self-hosted compile server (too heavy for Vercel Hobby)
- Client-side WASM compilation (deferred to v5.1 — bundle size + limited package support)

### Success criteria
- Pick a template → editor opens with pre-filled LaTeX → PDF preview renders in <5s
- Edit source → PDF auto-updates on 1.5s pause
- "Generate from master CV" button produces compilable LaTeX in one shot
- Download `.tex` and compile locally in TexLive gives identical output
- Compile failures show LaTeX error inline (parse `.log` output)

## 3. Data model

Reuses existing `documents` table. Two new `kind` values (no migration needed — kind is text):
- `latex_cv`
- `latex_cover_letter`

Content shape:
```typescript
type LatexDocumentContent = {
  source: string                    // the .tex source
  templateId?: string               // which template it was seeded from
  compiledAt?: string               // ISO timestamp of last successful compile
  compileError?: string             // last error if compile failed
  compileLog?: string               // full latex log (truncated to 20k chars)
}
```

## 4. Templates

Three seeded templates in `lib/latex/templates/`:

**moderncv-classic.tex** — classic academic style, ModernCV package
**awesome-cv.tex** — GitHub-popular style with color accents
**altacv-tw.tex** — two-column with a sidebar for skills

Each template is a full valid `.tex` file with `{{PLACEHOLDER}}` markers where dynamic content goes. Placeholders map to MasterCV JSON fields.

Template metadata `lib/latex/templates/index.ts`:
```typescript
export interface LatexTemplate {
  id: string
  name: string
  description: string
  preview: string                    // static image URL (optional)
  source: string                     // template contents
  fills: (master: MasterCV) => string  // returns filled source
}

export const TEMPLATES: LatexTemplate[] = [
  { id: 'moderncv-classic', ... },
  { id: 'awesome-cv', ... },
  { id: 'altacv-tw', ... },
]
```

## 5. Compilation

**Server-side via `latexonline.cc`:**
- Route: `POST /api/latex/compile` — body `{source}`, returns PDF bytes
- Handler:
  ```typescript
  const form = new FormData()
  form.append('return_type', 'pdf')
  const file = new Blob([source], { type: 'application/x-tex' })
  form.append('file', file, 'main.tex')
  const res = await fetch('https://latexonline.cc/data?target=main.tex&command=pdflatex', {
    method: 'POST', body: form,
  })
  if (!res.ok) {
    const errText = await res.text()
    return NextResponse.json({ error: 'Compile failed', log: errText.slice(0, 20000) }, { status: 422 })
  }
  const pdf = await res.arrayBuffer()
  return new Response(pdf, {
    headers: { 'content-type': 'application/pdf', 'cache-control': 'no-store' },
  })
  ```

**Rate limits:** latexonline.cc is generous but not documented. If hit, degrade to "click to compile" instead of auto-compile on pause.

**Timeout:** 30s max (Vercel function timeout on Hobby).

## 6. AI seeding

Extend `AIProvider` interface:
```typescript
generateLatexCV(input: {
  master: MasterCV
  templateId: string       // hint the AI which style to emit
}): Promise<{ source: string }>
```

Prompt (`lib/ai/prompts/generate-latex-cv.ts`):
- Instructs: "Produce a complete valid LaTeX document that compiles with pdflatex. Use only CTAN packages listed. Style should match {templateId}. Include the user's real content from the master CV. Output ONLY the .tex source, no prose."
- Post-generation Zod validate `{source: string}`, strip any markdown fencing (```latex ... ```)

## 7. UI

### `/documents/[id]/edit` — Editor page
- **Layout:** Two-pane 50/50 (resizable), source on left, PDF preview iframe on right
- **Header bar:** Title (editable), Template dropdown (if unset), Save button, Compile button (manual override), Download .tex button
- **Editor:** `@monaco-editor/react` with `language="latex"` — Monaco has a built-in LaTeX mode. Basic autocompletion via Monaco's default token stream.
- **Preview:** `<iframe src={/api/documents/[id]/pdf}>` — refreshes on successful compile
- **Auto-compile:** 1.5s debounce after keystroke; sends POST to compile endpoint; on success updates preview iframe with cache-busting query param
- **Error surface:** if compile 422s, error panel slides up from preview, shows first 500 chars of LaTeX log with line numbers

### `/documents/new/latex` — Template picker
- Grid of template cards: name, description, tiny preview thumbnail
- On pick: creates a new `documents` row with kind=latex_cv, content filled from template, redirects to editor
- Also has "Blank" option (empty document) and "Generate from master CV" (AI-seeded)

### `/documents` library
- LaTeX docs get their own kind badge (indigo)
- Filter chips extend with "LaTeX CV" chip
- Row action "Edit" opens the LaTeX editor (existing rows for other kinds still open the view or download)

### Application detail — Outreach / Documents cards
- No changes; LaTeX docs appear as normal documents. User creates them from `/documents/new/latex` and can link to an application via the editor.

## 8. Dependencies

New deps:
- `@monaco-editor/react` (~1MB gz, lazy-loaded via dynamic import)

The Monaco worker/loader ships from CDN by default — set `loader.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@latest/min/vs' } })` to avoid bundling.

## 9. Testing

- Unit test each template's `fills()` — assert placeholders replaced, no unfilled markers left, output starts with `\documentclass`
- Unit test AI prompt builder for LaTeX generation
- Integration test compile route with mocked `latexonline.cc` fetch — success + failure paths
- Skip Monaco tests (component tests would need JSDOM + web workers; not worth the effort for a text-input widget)

## 10. Costs and risks

- **latexonline.cc dependency**: single point of failure. Mitigation: cache last-successful PDF per document; on compile failure, show cached PDF + error banner. If service disappears entirely, v5.1 swaps in SwiftLaTeX WASM.
- **Monaco bundle size**: ~1MB gzipped. Only loaded on the editor route via dynamic import; other pages unaffected.
- **AI generation quality**: LaTeX is easy to break with a rogue token. Retry once on compile failure with error appended to prompt (self-heal loop). Cap retries at 2 to avoid runaway.

## 11. What "done" looks like for v5

Live demo:
1. `/documents` → **+ New LaTeX CV** → template grid → pick "moderncv-classic"
2. Editor opens with pre-filled LaTeX using data from master CV
3. PDF preview renders on right in ~3-5s
4. Edit a section title → 1.5s later preview updates
5. Click **Generate from master CV** → AI seeds a fresh document from scratch
6. Click **Download .tex** → source file downloads
7. Break the LaTeX intentionally (`\undefinedcommand`) → preview shows error with line number
