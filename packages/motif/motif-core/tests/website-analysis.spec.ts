import { describe, expect, it } from 'vitest'
import { MotifBrandError } from '../src/brand-store.ts'
import { analyzeWebsite, parseWebsiteUrl } from '../src/website-analysis.ts'

const PAGE = `<!doctype html>
<html><head>
<title>Acme Coffee - Fresh daily</title>
<meta name="theme-color" content="#0F5C4B">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700&display=swap">
<style>
  :root { --brand: #1F6F8B; }
  body { font-family: "Space Grotesk", sans-serif; color: #141414; }
  .hero { background: #1F6F8B; color: #E8C57C; }
</style>
</head><body style="border-color: #1F6F8B">Hello</body></html>`

/** Build a fetch double answering one HTML page. */
function fakeFetch(html: string, init: { status?: number; type?: string; url?: string } = {}): typeof fetch {
  const response = new Response(html, {
    status: init.status ?? 200,
    headers: { 'content-type': init.type ?? 'text/html; charset=utf-8' },
  })
  Object.defineProperty(response, 'url', { value: init.url ?? 'https://acme.example/' })
  return (async () => response) as typeof fetch
}

describe('parseWebsiteUrl', () => {
  it('accepts http and https addresses', () => {
    expect(parseWebsiteUrl('https://acme.example').hostname).toBe('acme.example')
    expect(parseWebsiteUrl(' http://acme.example/page ').pathname).toBe('/page')
  })

  it('rejects text that is not a URL', () => {
    expect(() => parseWebsiteUrl('acme coffee')).toThrow(MotifBrandError)
    expect(() => parseWebsiteUrl('')).toThrow(MotifBrandError)
  })

  it('rejects non-web protocols and embedded credentials', () => {
    expect(() => parseWebsiteUrl('file:///etc/passwd')).toThrow(MotifBrandError)
    expect(() => parseWebsiteUrl('ftp://acme.example')).toThrow(MotifBrandError)
    expect(() => parseWebsiteUrl('https://user:pass@acme.example')).toThrow(MotifBrandError)
  })
})

describe('analyzeWebsite', () => {
  it('reads the title, theme color, palette, and web font from one page', async () => {
    const suggestion = await analyzeWebsite('https://acme.example', { fetch: fakeFetch(PAGE) })
    expect(suggestion.name).toBe('Acme Coffee - Fresh daily')
    expect(suggestion.identity.primary).toBe('#0F5C4B')
    expect(suggestion.identity.accent).toBe('#1F6F8B')
    expect(suggestion.identity.latinFont).toBe('Space Grotesk')
    expect(suggestion.identity.arabicFont).toBe('IBM Plex Sans Arabic')
    expect(suggestion.source).toBe('https://acme.example/')
  })

  it('falls back to the ranked palette when no theme color is declared', async () => {
    const html = PAGE.replace(/<meta name="theme-color"[^>]*>/, '')
    const suggestion = await analyzeWebsite('https://acme.example', { fetch: fakeFetch(html) })
    expect(suggestion.identity.primary).toBe('#1F6F8B')
    expect(suggestion.identity.accent).toBe('#E8C57C')
  })

  it('falls back to the form defaults when the page declares nothing', async () => {
    const suggestion = await analyzeWebsite('https://acme.example', { fetch: fakeFetch('<html><body>plain</body></html>') })
    expect(suggestion.name).toBeUndefined()
    expect(suggestion.identity.primary).toBe('#0F5C4B')
    expect(suggestion.identity.latinFont).toBe('Space Grotesk')
  })

  it('rejects an unreachable page', async () => {
    const fetcher = (async () => { throw new Error('ENOTFOUND') }) as typeof fetch
    await expect(analyzeWebsite('https://gone.example', { fetch: fetcher })).rejects.toThrow(MotifBrandError)
  })

  it('rejects a non-OK answer and a non-HTML answer', async () => {
    await expect(analyzeWebsite('https://acme.example', { fetch: fakeFetch('no', { status: 404 }) }))
      .rejects.toThrow('404')
    await expect(analyzeWebsite('https://acme.example', { fetch: fakeFetch('{}', { type: 'application/json' }) }))
      .rejects.toThrow(MotifBrandError)
  })

  it('rejects an address before any fetch happens', async () => {
    let called = 0
    const fetcher = (async () => { called++; return new Response('') }) as typeof fetch
    await expect(analyzeWebsite('not a url', { fetch: fetcher })).rejects.toThrow(MotifBrandError)
    expect(called).toBe(0)
  })
})
