'use client'
import type { AssetMetadata } from '@/lib/db/queries/documentAssets'
import { assetUrl } from '@/lib/latex/project/paths'

/**
 * "Download project (.zip)": the document source at its main-file path
 * plus every asset at its folder path, zipped in the browser, so the
 * project goes back to Overleaf as it came. fflate loads only now.
 */
export async function downloadProjectZip(input: {
  documentId: string
  title: string
  source: string
  mainFile: string | null
  assets: readonly AssetMetadata[]
}): Promise<void> {
  const entries = await Promise.all(
    input.assets.map(async (a) => {
      const res = await fetch(assetUrl(input.documentId, a.filename))
      if (!res.ok) throw new Error(`Could not read ${a.filename}.`)
      return { path: a.filename, bytes: new Uint8Array(await res.arrayBuffer()) }
    }),
  )
  const [{ buildProjectZip }, { projectEntries }] = await Promise.all([
    import('@/lib/latex/project/zip-write'),
    import('@/lib/latex/project/plan'),
  ])
  const zip = buildProjectZip(projectEntries(input.source, input.mainFile, entries))
  const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${input.title.replace(/[^a-z0-9\-_. ]/gi, '_').trim() || 'project'}.zip`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
