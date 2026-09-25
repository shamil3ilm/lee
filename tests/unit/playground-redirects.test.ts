import { describe, it, expect } from 'vitest'
import nextConfig from '@/next.config'

describe('next.config redirects (v17 §0 Playground rename)', () => {
  it('permanently redirects the retired /learn and /lab routes', async () => {
    const redirects = (await nextConfig.redirects?.()) ?? []
    expect(redirects).toEqual(
      expect.arrayContaining([
        { source: '/learn', destination: '/playground', permanent: true },
        { source: '/lab/:path*', destination: '/playground/models/:path*', permanent: true },
      ]),
    )
  })
})
