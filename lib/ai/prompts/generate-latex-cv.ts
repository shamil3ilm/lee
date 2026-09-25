import type { MasterCV } from '@/lib/documents/types'

const STYLE_HINT: Record<string, string> = {
  'moderncv-classic':
    'Use the \\`moderncv\\` document class with \\`\\moderncvstyle{classic}\\` and \\`\\moderncvcolor{blue}\\`. Emit \\cventry / \\cvitem macros.',
  'awesome-cv':
    'Use a clean article layout with color accents (dark blue), \\titlesec for section headers, and enumitem for tight bullet lists. Two-line entries: role + company on one line, dates right-aligned.',
  'altacv-tw':
    'Two-column layout using the \\`paracol\\` package. Left column: skills + education. Right column: summary, experience, projects. Use a primary color (navy) with an orange accent.',
}

// v10.1 — bump on intentional edits; see lib/ai/prompts/hash.ts for rationale.
export const GENERATE_LATEX_CV_PROMPT_VERSION = '1.0.0'

export const GENERATE_LATEX_CV_SYSTEM = `You produce a COMPLETE, VALID LaTeX document that compiles with \`pdflatex\` on TeX Live 2023+.

Hard rules:
- Output ONLY the .tex source. No markdown fencing. No prose. No commentary before or after.
- Start with \\documentclass{...}. End with \\end{document}.
- Use only packages available on CTAN (moderncv, article, geometry, fontenc, inputenc, hyperref, titlesec, enumitem, xcolor, paracol, fontawesome5, lmodern, and similar). No custom .sty files.
- Escape special characters (%, &, $, #, _, {, }) in user content. Never break the compile with an unescaped character in a name or bullet.
- Fill with the REAL content from the master CV JSON below. Do NOT invent employers, dates, achievements, or skills.
- Emit ALL sections that have content in the master CV: summary, experience, projects, education, skills. Skip sections that are empty.
- Return valid JSON matching this schema: { "source": string }`

export function buildGenerateLatexCVPrompt(input: {
  master: MasterCV
  templateId: string
}): string {
  const { master, templateId } = input
  const styleHint =
    STYLE_HINT[templateId] ?? `Use a clean single-column layout consistent with a professional CV.`
  return `${GENERATE_LATEX_CV_SYSTEM}

--- STYLE HINT (templateId=${templateId}) ---
${styleHint}

--- MASTER CV ---
${JSON.stringify(master, null, 2)}

Return the .tex source in the "source" field. Nothing else.`
}
