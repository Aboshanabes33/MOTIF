import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  brandMarkdown,
  createBrand,
  listBrands,
  MotifBrandError,
  normalizeIdentity,
  slugify,
} from '../src/brand-store.ts'

const IDENTITY = {
  primary: '#0f5c4b',
  accent: '#e8c57c',
  light: '#f7f4ec',
  dark: '#141414',
  latinFont: 'Space Grotesk',
  arabicFont: 'IBM Plex Sans Arabic',
  motion: 'soft',
  caption: 'word',
}

const roots: string[] = []
async function root(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'motif-brand-'))
  roots.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('Brand folders', () => {
  it('slugifies a display name without leaving an empty folder name', () => {
    expect(slugify('Nakheel Café')).toBe('nakheel-café')
    expect(slugify('  ***  ')).toBe('brand')
  })

  it('writes brand.json, brand.md, assets, and timeline', async () => {
    const dir = await root()
    const brand = await createBrand(dir, { name: 'Nakheel Café', identity: IDENTITY })

    expect(brand.id).toBe('nakheel-café')
    expect(await readFile(join(dir, 'nakheel-café', 'brand.md'), 'utf8'))
      .toContain('Primary colour: #0F5C4B')
    const stored = JSON.parse(await readFile(join(dir, 'nakheel-café', 'brand.json'), 'utf8')) as { name: string }
    expect(stored.name).toBe('Nakheel Café')
    expect((await listBrands(dir, () => 'workspace-1')).at(0)).toMatchObject({
      name: 'Nakheel Café',
      workspaceId: 'workspace-1',
      videoCount: 0,
    })
  })

  it('writes an uploaded logo beside the definition', async () => {
    const dir = await root()
    // A real 1x1 PNG: #43 validates magic bytes, so fake payloads are rejected.
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC'
    const logo = `data:image/png;base64,${pngBase64}`
    await createBrand(dir, { name: 'Logo Brand', identity: IDENTITY, logo })

    const stored = await readFile(join(dir, 'logo-brand', 'assets', 'logo.png'))
    expect(stored.equals(Buffer.from(pngBase64, 'base64'))).toBe(true)
  })

  it('refuses a duplicate folder and a malformed colour', async () => {
    const dir = await root()
    await createBrand(dir, { name: 'Same', identity: IDENTITY })

    await expect(createBrand(dir, { name: 'Same', identity: IDENTITY }))
      .rejects.toBeInstanceOf(MotifBrandError)
    await expect(createBrand(dir, { name: 'Other', identity: { ...IDENTITY, primary: 'green' } }))
      .rejects.toThrow('Primary colour must be a #rrggbb colour')
  })

  it('counts timeline video files in the Brand view', async () => {
    const dir = await root()
    await createBrand(dir, { name: 'Timeline', identity: IDENTITY })
    await writeFile(join(dir, 'timeline', 'timeline', 'main.json'), '{}')
    await writeFile(join(dir, 'timeline', 'timeline', 'edit.mp4'), '')

    expect((await listBrands(dir, () => undefined)).at(0)?.videoCount).toBe(1)
  })

  it('renders the definition the relay reads', () => {
    expect(brandMarkdown('Nakheel', normalizeIdentity(IDENTITY)))
      .toContain('Apply this identity to every edit in this folder.')
  })
})
