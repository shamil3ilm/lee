/**
 * Client-safe. The "Send to lee" bookmarklet: one explicit click on a page
 * the user is viewing sends THE USER'S CURRENT TEXT SELECTION and the page
 * URL to lee, in a POST form opened in a new window (never in a query
 * string). It reads nothing else from the page: no DOM scraping, no
 * scrolling, nothing in the background. The user reviews on lee before
 * anything is imported.
 */

export const CAPTURE_WINDOW = 'lee_capture'
export const MAX_SELECTION = 4_000

/** The bookmarklet's JavaScript (without the `javascript:` scheme). */
export function bookmarkletSource(origin: string, key: string): string {
  const action = JSON.stringify(`${origin.replace(/\/+$/, '')}/api/capture`)
  return [
    '(function(){',
    `var s=String(window.getSelection?window.getSelection():'').slice(0,${MAX_SELECTION});`,
    "if(!s.trim()&&!confirm('No text selected. Send only this page link to lee?'))return;",
    `window.open('about:blank',${JSON.stringify(CAPTURE_WINDOW)});`,
    "var f=document.createElement('form');",
    `f.method='post';f.action=${action};f.target=${JSON.stringify(CAPTURE_WINDOW)};f.acceptCharset='utf-8';f.style.display='none';`,
    `[['k',${JSON.stringify(key)}],['text',s],['url',location.href]].forEach(function(p){var i=document.createElement('input');i.type='hidden';i.name=p[0];i.value=p[1];f.appendChild(i);});`,
    'document.body.appendChild(f);f.submit();f.remove();',
    '})();',
  ].join('')
}

/** The bookmark's address: `javascript:` + the encoded source. */
export function bookmarkletHref(origin: string, key: string): string {
  return `javascript:${encodeURIComponent(bookmarkletSource(origin, key))}`
}
