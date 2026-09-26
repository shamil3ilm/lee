import { fetchWithTimeout, FIRECRAWL_TIMEOUT_MS } from '@/lib/net/timeout'

/** `apiKey` is the resolved key (Settings › AI, else FIRECRAWL_API_KEY). */
export async function firecrawlFetch(url: string, apiKey: string): Promise<string> {
  if (!apiKey) throw new Error('Firecrawl key not set')
  const res = await fetchWithTimeout(
    'https://api.firecrawl.dev/v1/scrape',
    {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${apiKey}`,
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
