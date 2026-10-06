/**
 * v1.1 — build a tiny, valid PDF in memory (Helvetica text at given
 * positions + optional URI link annotations) so tests can exercise the real
 * unpdf path: positioned items, wrapped lines and link annotations.
 */

export interface PdfTextLine {
  text: string
  x: number
  y: number
  size?: number
}

export interface PdfLink {
  url: string
  rect: [number, number, number, number]
}

const WIN_ANSI: Record<string, string> = { '–': '\\226', '—': '\\227', '•': '\\225', '’': '\\222' }

function pdfString(s: string): string {
  let out = ''
  for (const ch of s) {
    if (ch === '(' || ch === ')' || ch === '\\') out += `\\${ch}`
    else out += WIN_ANSI[ch] ?? ch
  }
  return `(${out})`
}

export function buildPdf(lines: PdfTextLine[], links: PdfLink[] = []): Uint8Array {
  const content = lines
    .map((l) => `BT /F1 ${l.size ?? 10} Tf 1 0 0 1 ${l.x} ${l.y} Tm ${pdfString(l.text)} Tj ET`)
    .join('\n')
  const annotIds = links.map((_, i) => 6 + i)
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R${
      annotIds.length ? ` /Annots [${annotIds.map((id) => `${id} 0 R`).join(' ')}]` : ''
    } >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    ...links.map(
      (l) => `<< /Type /Annot /Subtype /Link /Rect [${l.rect.join(' ')}] /Border [0 0 0] /A << /S /URI /URI ${pdfString(l.url)} >> >>`,
    ),
  ]
  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(body, 'latin1'))
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`
  })
  const xrefAt = Buffer.byteLength(body, 'latin1')
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) body += `${String(off).padStart(10, '0')} 00000 n \n`
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`
  return new Uint8Array(Buffer.from(body, 'latin1'))
}
