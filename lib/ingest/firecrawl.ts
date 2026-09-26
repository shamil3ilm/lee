import { env } from '@/lib/env'
import { fetchWithTimeout, FIRECRAWL_TIMEOUT_MS } from '@/lib/net/timeout'

export async function firecrawlFetch(url: string): Promise<string> {
  if (!env.FIRECRAWL_API_KEY) throw new Error('FIRECRAWL_API_KEY not set')
  const res = await fetchWithTimeout(
    'https://api.firecrawl.dev/v1/scrape',
    {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${env.FIRECRAWL_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ url, formats: ['markdown'] }),
    },
    { timeoutMs: FIRECRAWL_TIMEOUT_MS, label: 'firecrawl' },
  )
  if (!res.ok) throw new Error(`firecrawl ${res.status}`)
  const json = await res.json() as { data?: { markdown?: string } }
  return json.data?.markdown ?? ''
}
