import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A fake `fetch` for aiu.bamboohr.com: /careers/list and /careers/{id}/detail
 * from the fixtures (no network). Records every URL asked for.
 */
export const AIU_LIST = JSON.parse(readFileSync(join(__dirname, 'aiu-list.json'), 'utf8')) as { result: Array<{ id: string }> }
const DETAILS = JSON.parse(readFileSync(join(__dirname, 'aiu-details.json'), 'utf8')) as Record<string, Record<string, unknown>>

export interface FakeBamboo {
  fetch: typeof fetch
  calls: string[]
}

export function fakeBamboo(): FakeBamboo {
  const calls: string[] = []
  const impl = async (input: RequestInfo | URL): Promise<Response> => {
    const url = new URL(String(input instanceof Request ? input.url : input))
    calls.push(url.toString())
    if (url.hostname !== 'aiu.bamboohr.com') return new Response('not found', { status: 404 })
    if (url.pathname === '/careers/list') return Response.json(AIU_LIST)
    const m = /^\/careers\/(\d+)\/detail$/.exec(url.pathname)
    const listing = m ? AIU_LIST.result.find((r) => r.id === m[1]) : undefined
    const detail = m ? DETAILS[m[1]!] : undefined
    if (!listing || !detail) return new Response('not found', { status: 404 })
    return Response.json({
      result: {
        jobOpening: {
          ...listing,
          jobOpeningShareUrl: `https://aiu.bamboohr.com/careers/${m![1]}`,
          jobOpeningStatus: 'Open',
          location: { city: 'Jahrah', state: 'Kuwait', postalCode: '15003', addressCountry: 'Kuwait' },
          ...detail,
        },
        formFields: {},
      },
    })
  }
  return { fetch: impl as typeof fetch, calls }
}
