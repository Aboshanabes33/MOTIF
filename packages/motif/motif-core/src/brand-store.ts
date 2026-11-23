/**
 * Brand folders on disk: the one durable record the relay reads and the shell
 * edits. A Brand is a folder with `brand.json` (the shell's copy),
 * `brand.md` (the agent-facing definition), `assets/`, and `timeline/`.
 *
 * @module @deepseek-ai/dsh-motif-core/brand-store
 */

import { mkdir, readFile, readdir, rename, rmdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { MotifBrand, MotifBrandCreateRequest, MotifBrandIdentity } from './types.ts'

/** Raised when a Brand form or folder cannot be accepted. */
export class MotifBrandError extends Error {
  override name = 'MotifBrandError'
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
 * @param name - user-facing name.
 * @returns lowercase slug, never empty.
 */
export function slugify(name: string): string {
  const slug = name.normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
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

/** Count timeline entries that look like video work products. */
async function countVideos(path: string): Promise<number> {
  const entries = await readdir(join(path, 'timeline'), { withFileTypes: true }).catch(() => [])
  return entries.filter(entry => entry.isFile() && !entry.name.startsWith('.')).length
}

/**
 * Read one existing Brand folder.
 * @param path - absolute folder.
 * @param workspaceId - Workspace registered over the same folder, when known.
 * @returns the Brand view, or undefined when the folder has no `brand.json`.
 */
export async function readBrand(path: string, workspaceId?: string): Promise<MotifBrand | undefined> {
  const raw = await readFile(join(path, 'brand.json'), 'utf8').catch(() => undefined)
  if (raw === undefined) return undefined
  let stored: StoredBrand
  try {
    stored = JSON.parse(raw) as StoredBrand
  } catch {
    return undefined
  }
  if (typeof stored.name !== 'string' || stored.name.trim() === '') return undefined
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
 * List every readable Brand folder under one root.
 * @param root - directory holding Brand folders.
 * @param workspaceIdOf - maps a folder path to its registered Workspace id.
 * @returns Brands, most recently edited first.
 */
export async function listBrands(
  root: string,
  workspaceIdOf: (path: string) => string | undefined,
): Promise<MotifBrand[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  const brands: MotifBrand[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const path = join(root, entry.name)
    const brand = await readBrand(path, workspaceIdOf(path))
    if (brand !== undefined) brands.push(brand)
  }
  return brands.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}
