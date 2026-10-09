// @vitest-environment happy-dom
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { DataCredits } from '@/components/companies/data-credits'
import PrivacyPage from '@/app/(public)/privacy/page'

afterEach(cleanup)

describe('ODbL attribution', () => {
  it('the Companies tab credits OpenStreetMap (linked to its copyright page), GLEIF and the Indian open data licence', () => {
    render(createElement(DataCredits))
    const p = screen.getByTestId('companies-attribution')
    expect(p.textContent).toContain('© OpenStreetMap contributors, ODbL')
    expect(p.querySelector('a')?.getAttribute('href')).toBe('https://www.openstreetmap.org/copyright')
    expect(p.textContent).toContain('GLEIF (CC0)')
    expect(p.textContent).toContain('Government Open Data License – India')
  })

  it('the privacy page carries the same attribution', () => {
    const html = renderToStaticMarkup(PrivacyPage())
    expect(html).toContain('© OpenStreetMap contributors, ODbL')
    expect(html).toContain('https://www.openstreetmap.org/copyright')
  })
})
