'use client'
import { useEffect, useState } from 'react'
import type { AssetMetadata } from '@/lib/db/queries/documentAssets'

const MAX_BIB_BYTES = 512 * 1024

/**
 * Text of every `.bib` asset of the document, for `\cite` autocomplete.
 * Fetched through the authenticated asset route; a failed or oversized file
 * is skipped (autocomplete just has fewer keys), never an error.
 */
export function useBibSources(documentId: string, assets: readonly AssetMetadata[]): string[] {
  const [loaded, setLoaded] = useState<{ key: string; texts: string[] }>({ key: '', texts: [] })
  const bibNames = assets
    .filter((a) => /\.bib$/i.test(a.filename) && a.sizeBytes <= MAX_BIB_BYTES)
    .map((a) => a.filename)
  const key = bibNames.join('\n')

  useEffect(() => {
    if (!key) return
    const names = key.split('\n')
    const controller = new AbortController()
    Promise.all(
      names.map((name) =>
        fetch(`/api/documents/${documentId}/assets/${encodeURIComponent(name)}`, {
          signal: controller.signal,
        })
          .then((res) => (res.ok ? res.text() : ''))
          .catch(() => ''),
      ),
    ).then((texts) => {
      if (!controller.signal.aborted) setLoaded({ key, texts: texts.filter(Boolean) })
    })
    return () => controller.abort()
  }, [documentId, key])

  return loaded.key === key ? loaded.texts : []
}
