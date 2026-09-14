import * as cheerio from 'cheerio'

export function extractMainText(html: string): string {
  const $ = cheerio.load(html)
  $('script, style, noscript, iframe, svg, nav, footer, header, form').remove()
  const main = $('main').text() || $('article').text() || $('body').text()
  return main.replace(/\s+/g, ' ').trim()
}
