/**
 * Brand folders on disk: the one durable record the relay reads and the shell
 * edits. A Brand is a folder with `brand.json` (the shell's copy),
 * `brand.md` (the agent-facing definition), `assets/`, and `timeline/`.
 *
 * @module @deepseek-ai/dsh-motif-core/brand-store
 */

import { mkdir, readFile, readdir, realpath, rename, rmdir, stat, unlink, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative } from 'node:path'
import type { MotifBrand, MotifBrandCreateRequest, MotifBrandIdentity, MotifBrandProblem, MotifTimelineEntry } from './types.ts'

/** Raised when a Brand form or folder cannot be accepted. */
export class MotifBrandError extends Error {
  override name = 'MotifBrandError'
}

/** Raised when a Brand folder's stored metadata cannot be understood. */
export class MotifBrandCorruptError extends MotifBrandError {
  override name = 'MotifBrandCorruptError'
  /** Machine-readable reason, safe for the UI to branch on. */
  readonly code = 'BRAND_CORRUPT' as const
  /** Brand folder whose `brand.json` failed to parse or validate. */
  readonly brandPath: string
  constructor(brandPath: string, reason: string) {
    super(`Brand at ${brandPath} has unreadable metadata: ${reason}`)
    this.brandPath = brandPath
  }
}

/** Full result of listing: the Brands that read plus the folders that did not. */
export interface MotifBrandList {
  readonly brands: MotifBrand[]
  readonly problems: MotifBrandProblem[]
}

/** True when an fs failure means "not there" rather than "broken". */
function isMissingError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false
  const code = (error as NodeJS.ErrnoException).code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

const IDENTITY_FALLBACK: MotifBrandIdentity = {
  primary: '#0F5C4B',
  accent: '#E8C57C',
  light: '#F7F4EC',
  dark: '#141414',
  latinFont: 'Space Grotesk',
  arabicFont: 'IBM Plex Sans Arabic',
  motion: 'soft',
  caption: 'word',
}

/** Stored schema, versioned so a later release can migrate it. */
interface StoredBrand {
  version: 1
  name: string
  identity: MotifBrandIdentity
  logo?: string
  updatedAt: string
}

/**
 * Turn a display name into a folder slug.
 *
 * Unicode letters and numbers are preserved, so Arabic (and any other
 * non-ASCII) names keep their identity instead of collapsing into one shared
 * fallback: two distinct Arabic names produce two distinct folders. The name
 * is NFKC-normalized first, which folds compatibility spellings (and NFC/NFD
 * variants of the same text) into one slug; every run of anything that is
 * not a letter or number - punctuation, symbols, emoji, path separators, and
 * control characters - becomes a single dash, so a slug can never escape its
 * directory or carry invisible characters.
 * @param name - user-facing name.
 * @returns lowercase slug of at most 48 code points, never empty.
 */
export function slugify(name: string): string {
  const slug = [...name.normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')]
    .slice(0, 48)
    .join('')
    .replace(/-+$/g, '')
  return slug === '' ? 'brand' : slug
}

/**
 * Render the agent-facing definition. This is the file the relay reads.
 * @param name - Brand name.
 * @param identity - saved identity.
 * @returns Markdown with one fact per line.
 */
export function brandMarkdown(name: string, identity: MotifBrandIdentity): string {
  return [
    `# ${name}`,
    '',
    `Primary colour: ${identity.primary}`,
    `Accent colour: ${identity.accent}`,
    `Light surface: ${identity.light}`,
    `Dark surface: ${identity.dark}`,
    `Latin font: ${identity.latinFont}`,
    `Arabic font: ${identity.arabicFont}`,
    `Motion style: ${identity.motion}`,
    `Caption look: ${identity.caption}`,
    '',
    'Apply this identity to every edit in this folder.',
    '',
  ].join('\n')
}

/**
 * Normalize an identity from a form, rejecting unusable colours and blank fonts.
 * @param identity - submitted identity.
 * @returns the normalized identity.
 * @throws {MotifBrandError} when a required value is missing or malformed.
 */
export function normalizeIdentity(identity: MotifBrandIdentity): MotifBrandIdentity {
  const colour = (field: string, value: string): string => {
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) throw new MotifBrandError(`${field} must be a #rrggbb colour`)
    return value.toUpperCase()
  }
  const text = (field: string, value: string): string => {
    const trimmed = value.trim()
    if (trimmed === '') throw new MotifBrandError(`${field} is required`)
    return trimmed
  }
  return {
    primary: colour('Primary colour', identity.primary),
    accent: colour('Accent colour', identity.accent),
    light: colour('Light surface', identity.light),
    dark: colour('Dark surface', identity.dark),
    latinFont: text('Latin font', identity.latinFont),
    arabicFont: text('Arabic font', identity.arabicFont),
    motion: text('Motion style', identity.motion),
    caption: text('Caption look', identity.caption),
  }
}

/** Decode a `data:image/...;base64,...` logo and pick its extension. */
function decodeLogo(dataUrl: string): { bytes: Buffer; extension: string } {
  const match = /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,(.+)$/s.exec(dataUrl)
  if (match === null) throw new MotifBrandError('Logo must be a PNG, JPEG, WebP, or SVG data URL')
  const [, mime = '', data = ''] = match
  const extension = mime === 'jpeg' ? 'jpg' : mime === 'svg+xml' ? 'svg' : mime
  return { bytes: Buffer.from(data, 'base64'), extension }
}

/**
 * Create a Brand folder and its definition.
 * @param root - directory holding every Brand folder.
 * @param request - validated form payload.
 * @returns the stored Brand view.
 * @throws {MotifBrandError} on an empty name, an existing folder, or a bad logo.
 */
/** Monotonic suffix keeping one process's temporary files distinct. */
let temporaryCounter = 0

/**
 * Write one file beside its final name, then rename it into place, so a
 * reader never meets a half-written file and a failed write leaves no final
 * name behind.
 * @param path - final file path.
 * @param contents - bytes to persist.
 */
async function writeFileAtomic(path: string, contents: string | Buffer): Promise<void> {
  const temporary = `${path}.tmp-${process.pid}-${temporaryCounter += 1}`
  try {
    await writeFile(temporary, contents)
    await rename(temporary, path)
  } catch (reason: unknown) {
    await unlink(temporary).catch(() => {})
    throw reason
  }
}

/**
 * Create a Brand folder and its definition.
 *
 * The folder is claimed with one exclusive `mkdir`: two concurrent requests
 * for the same name resolve deterministically — the first succeeds, every
 * other fails with EEXIST and overwrites nothing. Files appear through
 * temporary writes renamed into place, and any failure removes only what this
 * operation created.
 * @param root - directory holding every Brand folder.
 * @param request - validated form payload.
 * @returns the stored Brand view.
 * @throws {MotifBrandError} on an empty name, an existing folder, or a bad logo.
 */
export async function createBrand(root: string, request: MotifBrandCreateRequest): Promise<MotifBrand> {
  const name = request.name.trim()
  if (name === '') throw new MotifBrandError('Brand name is required')
  const id = slugify(name)
  const path = join(root, id)
  const identity = normalizeIdentity(request.identity ?? IDENTITY_FALLBACK)
  // The logo is decoded before the folder is claimed so a bad logo fails
  // without touching disk at all.
  const decoded = request.logo === undefined || request.logo === '' ? undefined : decodeLogo(request.logo)

  await mkdir(root, { recursive: true })
  try {
    await mkdir(path)
  } catch (reason: unknown) {
    if ((reason as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new MotifBrandError(`A Brand folder named “${id}” already exists`)
    }
    throw reason
  }

  // The exclusive claim makes everything inside `path` this operation's own;
  // cleanup removes only files it wrote and only directories it created.
  const files: string[] = []
  const directories = [join(path, 'assets'), join(path, 'timeline')]
  try {
    for (const directory of directories) {
      await mkdir(directory)
    }
    let logo: string | undefined
    if (decoded !== undefined) {
      const target = join(path, 'assets', `logo.${decoded.extension}`)
      await writeFileAtomic(target, decoded.bytes)
      files.push(target)
      logo = request.logo
    }
    const updatedAt = new Date().toISOString()
    const stored: StoredBrand = { version: 1, name, identity, ...logo === undefined ? {} : { logo }, updatedAt }
    const metadata = join(path, 'brand.json')
    await writeFileAtomic(metadata, `${JSON.stringify(stored, null, 2)}\n`)
    files.push(metadata)
    const definition = join(path, 'brand.md')
    await writeFileAtomic(definition, brandMarkdown(name, identity))
    files.push(definition)
    return { id, name, path, identity, ...logo === undefined ? {} : { logo }, updatedAt, videoCount: 0 }
  } catch (reason: unknown) {
    for (const file of files) {
      await unlink(file).catch(() => {})
    }
    for (const directory of [...directories].reverse()) {
      await rmdir(directory).catch(() => {})
    }
    // rmdir refuses a folder holding anything foreign, so only an empty,
    // fully-cleaned claim is removed.
    await rmdir(path).catch(() => {})
    throw reason
  }
}

/**
 * Remove a Brand folder only while it still holds exactly the Brand this
 * operation wrote: the stored metadata must parse and match the name and
 * creation instant of the folder the caller just created. Any mismatch -
 * foreign, replaced, or unreadable content - keeps the folder, so a rollback
 * can never delete pre-existing user data.
 * @param brand - the Brand view returned by {@link createBrand}.
 * @returns whether the folder was removed.
 */
export async function removeCreatedBrand(brand: MotifBrand): Promise<boolean> {
  let stored: StoredBrand
  try {
    stored = JSON.parse(await readFile(join(brand.path, 'brand.json'), 'utf8')) as StoredBrand
  } catch {
    return false
  }
  if (stored?.version !== 1 || stored.name !== brand.name || stored.updatedAt !== brand.updatedAt) {
    return false
  }
  // Refuse cleanup if anything appeared after creation. Never recursively
  // delete a workspace: an agent or another process may already have written it.
  try {
    const top = await readdir(brand.path)
    if (top.some(name => !['brand.json', 'brand.md', 'assets', 'timeline'].includes(name))) return false
    if ((await readdir(join(brand.path, 'timeline'))).length !== 0) return false
    const assets = await readdir(join(brand.path, 'assets'))
    const decoded = brand.logo ? decodeLogo(brand.logo) : undefined
    const expectedLogo = decoded ? `logo.${decoded.extension}` : undefined
    if (assets.some(name => name !== expectedLogo) || assets.length !== (expectedLogo ? 1 : 0)) return false
    if (await readFile(join(brand.path, 'brand.md'), 'utf8') !== brandMarkdown(brand.name, brand.identity)) return false
    if (decoded !== undefined && expectedLogo !== undefined && !(await readFile(join(brand.path, 'assets', expectedLogo))).equals(decoded.bytes)) return false
    if (expectedLogo) await unlink(join(brand.path, 'assets', expectedLogo))
    await rmdir(join(brand.path, 'assets'))
    await rmdir(join(brand.path, 'timeline'))
    await unlink(join(brand.path, 'brand.md'))
    await unlink(join(brand.path, 'brand.json'))
    await rmdir(brand.path)
    return true
  } catch { return false }

}

/** Video containers Motif can ingest as a Source Video or write as an edit result. */
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.mkv', '.m4v'])

/**
 * True when a file name is a video asset Motif can work with.
 * Captions (.srt/.vtt), images, Markdown, and JSON are not videos.
 * @param name - bare file name.
 */
export function isVideoAsset(name: string): boolean {
  const lower = name.toLowerCase()
  const dot = lower.lastIndexOf('.')
  return dot > 0 && VIDEO_EXTENSIONS.has(lower.slice(dot))
}

/**
 * Count actual video assets anywhere in the Brand folder. The timeline
 * directory holds the Markdown/JSON edit log, not footage, so its entries
 * only count when they are video files.
 */
async function countVideos(path: string): Promise<number> {
  let count = 0
  const walk = async (dir: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      if (entry.isDirectory()) {
        await walk(join(dir, entry.name))
      } else if (entry.isFile() && isVideoAsset(entry.name)) {
        count += 1
      }
    }
  }
  await walk(path)
  return count

}

/**
 * Read one existing Brand folder.
 * @param path - absolute folder.
 * @param workspaceId - Workspace registered over the same folder, when known.
 * @returns the Brand view, or undefined when the folder has no `brand.json`.
 */
export async function readBrand(path: string, workspaceId?: string): Promise<MotifBrand | undefined> {
  const raw = await readFile(join(path, 'brand.json'), 'utf8')
    .catch((error: unknown) => {
      if (isMissingError(error)) return undefined
      throw error
    })
  if (raw === undefined) return undefined
  let stored: StoredBrand
  try {
    stored = JSON.parse(raw) as StoredBrand
  } catch (error) {
    throw new MotifBrandCorruptError(path, error instanceof Error ? error.message : String(error))
  }
  if (typeof stored.name !== 'string' || stored.name.trim() === '') {
    throw new MotifBrandCorruptError(path, 'brand.json has no usable name')
  }
  const identity = { ...IDENTITY_FALLBACK, ...stored.identity }
  return {
    id: path.split(/[\\/]/).filter(Boolean).at(-1) ?? slugify(stored.name),
    ...workspaceId === undefined ? {} : { workspaceId },
    name: stored.name,
    path,
    identity,
    ...stored.logo === undefined ? {} : { logo: stored.logo },
    updatedAt: stored.updatedAt ?? new Date(0).toISOString(),
    videoCount: await countVideos(path),
  }
}

/**
 * List every Brand folder under one root, keeping the failures visible.
 * A missing root is an empty list; an unreadable root throws. A folder whose
 * `brand.json` is corrupt or unreadable lands in `problems` so the caller can
 * say so instead of silently showing nothing.
 * @param root - directory holding Brand folders.
 * @param workspaceIdOf - maps a folder path to its registered Workspace id.
 * @returns Brands, most recently edited first, plus per-folder problems.
 */
export async function listBrandsDetailed(
  root: string,
  workspaceIdOf: (path: string) => string | undefined,
): Promise<MotifBrandList> {
  const entries = await readdir(root, { withFileTypes: true })
    .catch((error: unknown) => {
      if (isMissingError(error)) return []
      throw error
    })
  const brands: MotifBrand[] = []
  const problems: MotifBrandProblem[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const path = join(root, entry.name)
    try {
      const brand = await readBrand(path, workspaceIdOf(path))
      if (brand !== undefined) brands.push(brand)
    } catch (error) {
      problems.push({
        path,
        kind: error instanceof MotifBrandCorruptError ? 'corrupt' : 'unreadable',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  brands.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  return { brands, problems }
}

/**
 * List every readable Brand folder under one root.
 * @param root - directory holding Brand folders.
 * @param workspaceIdOf - maps a folder path to its registered Workspace id.
 * @returns Brands, most recently edited first.
 */
export async function listBrands(
  root: string,
  workspaceIdOf: (path: string) => string | undefined,
): Promise<MotifBrand[]> {
  return (await listBrandsDetailed(root, workspaceIdOf)).brands
}

/**
 * List one Brand's timeline files, most recently modified first.
 * @param root - directory holding every Brand folder.
 * @param brandId - Brand folder slug; anything outside the slug alphabet is rejected.
 * @returns the timeline entries, empty when the Brand has no timeline folder yet.
 * @throws {MotifBrandError} when the id is not a folder slug.
 */
export async function listTimeline(root: string, brandId: string): Promise<MotifTimelineEntry[]> {
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(brandId)) throw new MotifBrandError('Unknown Brand folder')
  const dir = join(root, brandId, 'timeline')
  const base = await realpath(root)
  let canonical: string
  try { canonical = await realpath(dir) }
  catch (reason) { if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return []; throw reason }
  const inside = relative(base, canonical)
  if (inside === '..' || inside.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(inside)) throw new MotifBrandError('Timeline is outside its Brand root')
  const entries = await readdir(canonical, { withFileTypes: true })
  const files = entries.filter(entry => entry.isFile() && !entry.name.startsWith('.'))
  const timeline = await Promise.all(files.map(async (entry) => {
    const info = await stat(join(dir, entry.name))
    return { name: entry.name, bytes: info.size, updatedAt: info.mtime.toISOString() }
  }))
  return timeline.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}
