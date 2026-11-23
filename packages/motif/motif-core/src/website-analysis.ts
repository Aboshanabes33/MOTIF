/**
 * Website-to-Brand suggestion: fetch one public page and read the identity it
 * already declares (theme colour, inline palette, web fonts). The suggestion
 * always lands in the Brand form for the user to review; nothing is created
 * automatically.
 *
 * @module @deepseek-ai/dsh-motif-core/website-analysis
 */

import { MotifBrandError } from './brand-store.ts'
import { fetchPublicPage } from './public-page.ts'
import type { MotifBrandIdentity, MotifWebsiteSuggestion } from './types.ts'

/** Fallbacks identical to the Brand form defaults. */
const FALLBACK: MotifBrandIdentity = {
  primary: '#0F5C4B',
  accent: '#E8C57C',
  light: '#F7F4EC',
  dark: '#141414',
  latinFont: 'Space Grotesk',
  arabicFont: 'IBM Plex Sans Arabic',
  motion: 'soft',
  caption: 'word',
}

/** Fetch deadline for one analysis. */
const TIMEOUT_MS = 10_000
/** HTML bytes considered; the identity lives in the head and early styles. */
const MAX_HTML_CHARS = 512_000
/** Declared response sizes above this are refused before reading. */
const MAX_CONTENT_LENGTH = 4_000_000

/** Host integrations replaceable by tests. */
export interface WebsiteAnalysisInternals {
  /** Override the fetch implementation. */
  readonly fetch?: typeof fetch
}

/** Parse and validate one user-entered website URL. */
export function parseWebsiteUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new MotifBrandError('Enter a full web address, like https://example.com')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new MotifBrandError('Only http and https addresses can be analyzed')
  }
  if (url.username !== '' || url.password !== '') {
    throw new MotifBrandError('Addresses with embedded credentials are not accepted')
  }
  return url
}

/** Decode the small entity set a title or style attribute realistically carries. */
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim()
}

/** Read the document title, when present and usable. */
function extractTitle(html: string): string | undefined {
  const match = /<title[^>]*>([^<]{1,200})<\/title>/i.exec(html)
  if (match === null) return undefined
  const title = decodeEntities(match[1] ?? '')
  return title === '' ? undefined : title
}

/** Read the meta theme-color, whichever attribute order the page uses. */
function extractThemeColor(html: string): string | undefined {
  const patterns = [
    /<meta[^>]+name=["']theme-color["'][^>]+content=["'](#[0-9a-f]{6})["'][^>]*>/i,
    /<meta[^>]+content=["'](#[0-9a-f]{6})["'][^>]+name=["']theme-color["'][^>]*>/i,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(html)
    if (match !== null) return (match[1] ?? '').toUpperCase()
  }
  return undefined
}

/** True when a hex colour is an unsaturated gray, white, or black. */
function isNeutral(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return Math.max(r, g, b) - Math.min(r, g, b) < 18
}

/** Rank saturated #rrggbb colours by frequency, most frequent first. */
function rankColors(html: string): string[] {
  const counts = new Map<string, number>()
  for (const match of html.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
    const hex = match[0].toUpperCase()
    if (isNeutral(hex)) continue
    counts.set(hex, (counts.get(hex) ?? 0) + 1)
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1]).map(([hex]) => hex)
}

/** Generic CSS font keywords that say nothing about a Brand. */
const GENERIC_FONTS = new Set([
  'sans-serif', 'serif', 'monospace', 'system-ui', 'ui-sans-serif', 'ui-serif',
  'inherit', 'initial', 'unset', 'auto', '-apple-system', 'blinkmacsystemfont',
  'cursive', 'fantasy', 'emoji', 'math', 'fangsong',
])

/** Clean one font-family list down to its first concrete family name. */
function firstConcreteFont(list: string): string | undefined {
  for (const candidate of list.split(',')) {
    const name = candidate.trim().replace(/^["']|["']$/g, '')
    if (name !== '' && !GENERIC_FONTS.has(name.toLowerCase())) return name
  }
  return undefined
}

/** Collect web font names from font-family declarations and Google Fonts links. */
function extractFonts(html: string): string[] {
  const fonts: string[] = []
  const push = (name: string | undefined): void => {
    if (name !== undefined && !fonts.includes(name)) fonts.push(name)
  }
  for (const match of html.matchAll(/fonts\.googleapis\.com\/css2?\?[^"'>]*?family=([^&"'>]+)/gi)) {
    push(firstConcreteFont(decodeURIComponent(match[1] ?? '').replace(/\+/g, ' ').split(':')[0] ?? ''))
  }
  for (const match of html.matchAll(/font-family\s*:\s*([^;}"']+)/gi)) {
    push(firstConcreteFont(match[1] ?? ''))
  }
  return fonts
}

/**
 * Analyze one public web page into a Brand identity suggestion.
 * @param raw - user-entered address.
 * @param internals - test seams.
 * @returns the suggested name and identity, plus the final page URL.
 * @throws {MotifBrandError} on an unusable address, unreachable page, or non-HTML answer.
 */
export async function analyzeWebsite(raw: string, internals: WebsiteAnalysisInternals = {}): Promise<MotifWebsiteSuggestion> {
  const url = parseWebsiteUrl(raw)
  const fetcher = internals.fetch ?? (async (url: URL | RequestInfo, init?: RequestInit) => {
    const page = await fetchPublicPage(url as URL, init?.signal ?? AbortSignal.timeout(TIMEOUT_MS))
    return page
  })
  let response: Response
  try {
    response = await fetcher(url, {
      headers: { accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (reason: unknown) {
    throw new MotifBrandError(`The website could not be reached (${reason instanceof Error ? reason.message : String(reason)})`)
  }
  if (!response.ok) throw new MotifBrandError(`The website answered ${response.status}`)
  const type = response.headers.get('content-type') ?? ''
  if (!type.toLowerCase().includes('text/html')) {
    throw new MotifBrandError('That address did not answer with a web page')
  }
  const declared = Number(response.headers.get('content-length') ?? '0')
  if (declared > MAX_CONTENT_LENGTH) throw new MotifBrandError('The page is too large to analyze')
  const reader = response.body?.getReader()
  const decoder = new TextDecoder()
  let html = '', bytes = 0
  if (reader) {
    try {
      while (true) {
        const part = await reader.read()
        if (part.done) break
        bytes += part.value.byteLength
        if (bytes > MAX_HTML_CHARS) throw new MotifBrandError('The page is too large to analyze')
        html += decoder.decode(part.value, { stream: true })
      }
      html += decoder.decode()
    } finally { await reader.cancel() }
  }

  const theme = extractThemeColor(html)
  const ranked = rankColors(html)
  const primary = theme ?? ranked[0] ?? FALLBACK.primary
  const accent = (theme === undefined ? ranked[1] : ranked.find(hex => hex !== primary)) ?? FALLBACK.accent
  const fonts = extractFonts(html)
  const identity: MotifBrandIdentity = {
    primary,
    accent,
    light: FALLBACK.light,
    dark: FALLBACK.dark,
    latinFont: fonts[0] ?? FALLBACK.latinFont,
    arabicFont: FALLBACK.arabicFont,
    motion: FALLBACK.motion,
    caption: FALLBACK.caption,
  }
  const name = extractTitle(html)
  return {
    ...name === undefined ? {} : { name },
    identity,
    source: response.url === '' ? url.toString() : response.url,
  }
}
