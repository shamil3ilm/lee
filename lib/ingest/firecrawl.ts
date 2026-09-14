import { env } from '@/lib/env'

export async function firecrawlFetch(url: string): Promise<string> {
  if (!env.FIRECRAWL_API_KEY) throw new Error('FIRECRAWL_API_KEY not set')
  const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${env.FIRECRAWL_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ url, formats: ['markdown'] }),
  })
  if (!res.ok) throw new Error(`firecrawl ${res.status}`)
  const json = await res.json() as { data?: { markdown?: string } }
  return json.data?.markdown ?? ''
}
