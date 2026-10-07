// E2E only: a stand-in for both LaTeX compile services (latexonline.cc and
// YtoTech), so "Make PDF" and every other server-side compile run end to end
// without the network. The e2e dev server points lee at it with
// LATEX_ONLINE_URL / LATEX_YTOTECH_URL (tests/e2e/env.ts).
//
//   GET  /health                → 200
//   POST /latexonline/data      → a one-page PDF (or what the mode says)
//   POST /ytotech/builds/sync   → a one-page PDF (or what the mode says)
//   POST /__test/mode?mode=m    → ok (default) | fail (400 + a LaTeX log) |
//                                 down (503) | hang (never answers)
//   GET  /__test/stats          → { compiles, mode }
import { createServer } from 'node:http'

const PORT = Number(process.env.LATEX_STUB_PORT ?? 3198)
const MODES = new Set(['ok', 'fail', 'down', 'hang'])
let mode = 'ok'
let compiles = 0

/** A valid one-page PDF (same shape as tests/e2e/pdf-fixture.ts). */
function onePagePdf(lines) {
  const esc = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`)
  const stream = ['BT /F1 18 Tf 72 720 Td', ...lines.map((l, i) => `${i === 0 ? '' : '0 -24 Td '}(${esc(l)}) Tj`), 'ET'].join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let out = '%PDF-1.4\n'
  const offsets = []
  objects.forEach((body, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return out
}

const PDF = onePagePdf(['Compiled by the e2e LaTeX stub'])
const LOG = './main.tex:1: Undefined control sequence.\nl.1 \\foo\n'

function drain(req) {
  return new Promise((resolve) => {
    req.on('data', () => {})
    req.on('end', resolve)
  })
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  if (url.pathname === '/health') return json(res, 200, { ok: true })
  if (url.pathname === '/__test/stats') return json(res, 200, { compiles, mode })
  if (url.pathname === '/__test/mode' && req.method === 'POST') {
    const next = url.searchParams.get('mode') ?? 'ok'
    if (!MODES.has(next)) return json(res, 400, { error: `unknown mode ${next}` })
    mode = next
    return json(res, 200, { mode })
  }
  const service = url.pathname === '/latexonline/data' ? 'latexonline' : url.pathname === '/ytotech/builds/sync' ? 'ytotech' : null
  if (!service || req.method !== 'POST') return json(res, 404, { error: 'not found' })
  await drain(req)
  compiles += 1
  if (mode === 'hang') return // never answers: the caller's timeout must fire
  if (mode === 'down') return json(res, 503, { error: 'service unavailable' })
  if (mode === 'fail') {
    if (service === 'ytotech') return json(res, 400, { error: 'compilation failed', log_files: { '__main_document__.log': LOG } })
    res.writeHead(400, { 'content-type': 'text/plain' })
    return res.end(LOG)
  }
  res.writeHead(200, { 'content-type': 'application/pdf' })
  res.end(PDF)
}).listen(PORT, () => {
  console.log(`latex stub on ${PORT}`)
})
