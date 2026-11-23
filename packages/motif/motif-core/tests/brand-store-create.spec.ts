import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createBrand, MotifBrandError, readBrand } from '../src/brand-store.ts'
import type { MotifBrandCreateRequest } from '../src/types.ts'

const IDENTITY = {
  primary: '#0F5C4B',
  accent: '#E8C57C',
  light: '#F7F4EC',
  dark: '#141414',
  latinFont: 'Space Grotesk',
  arabicFont: 'IBM Plex Sans Arabic',
  motion: 'soft',
  caption: 'word',
}

function request(name: string, logo?: string): MotifBrandCreateRequest {
  return { name, identity: IDENTITY, ...logo === undefined ? {} : { logo } }
}

/** A tiny valid PNG data URL. */
const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'motif-brand-store-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/** Every entry anywhere under one directory, relative paths. */
async function walk(directory: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  const found: string[] = []
  for (const entry of entries) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    found.push(relative)
    if (entry.isDirectory()) found.push(...await walk(join(directory, entry.name), relative))
  }
  return found
}

describe('createBrand', () => {
  it('creates the folder structure with parseable metadata', async () => {
    const brand = await createBrand(root, request('Acme'))
    expect(brand.id).toBe('acme')
    const stored = JSON.parse(await readFile(join(root, 'acme', 'brand.json'), 'utf8'))
    expect(stored).toMatchObject({ version: 1, name: 'Acme' })
    expect((await stat(join(root, 'acme', 'assets'))).isDirectory()).toBe(true)
    expect((await stat(join(root, 'acme', 'timeline'))).isDirectory()).toBe(true)
    const definition = await readFile(join(root, 'acme', 'brand.md'), 'utf8')
    expect(definition).toContain('Acme')
  })

  it('rejects a duplicate name without overwriting the existing folder', async () => {
    await createBrand(root, request('Acme'))
    const before = await readFile(join(root, 'acme', 'brand.json'), 'utf8')
    await expect(createBrand(root, request('Acme'))).rejects.toBeInstanceOf(MotifBrandError)
    const after = await readFile(join(root, 'acme', 'brand.json'), 'utf8')
    expect(after).toBe(before)
  })

  it('resolves concurrent same-name creation deterministically', async () => {
    const outcomes = await Promise.allSettled(
      Array.from({ length: 5 }, () => createBrand(root, request('Acme'))),
    )
    const fulfilled = outcomes.filter(outcome => outcome.status === 'fulfilled')
    const rejected = outcomes.filter(outcome => outcome.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(4)
    for (const outcome of rejected) {
      expect((outcome as PromiseRejectedResult).reason).toBeInstanceOf(MotifBrandError)
    }
    // The winner's folder is complete and readable.
    const brand = await readBrand(join(root, 'acme'))
    expect(brand?.name).toBe('Acme')
    const stored = JSON.parse(await readFile(join(root, 'acme', 'brand.json'), 'utf8'))
    expect(stored.name).toBe('Acme')
  })

  it('lets different names succeed concurrently', async () => {
    const outcomes = await Promise.allSettled([
      createBrand(root, request('Acme')),
      createBrand(root, request('Globex')),
      createBrand(root, request('Initech')),
    ])
    expect(outcomes.every(outcome => outcome.status === 'fulfilled')).toBe(true)
  })

  it('rejects a bad logo without leaving any folder behind', async () => {
    await expect(createBrand(root, request('Acme', 'https://example.com/logo.png')))
      .rejects.toBeInstanceOf(MotifBrandError)
    expect(await readdir(root)).toEqual([])
  })

  it('writes through temporary files that never remain on disk', async () => {
    await createBrand(root, request('Acme', LOGO))
    const entries = await walk(root)
    expect(entries.some(entry => entry.includes('.tmp-'))).toBe(false)
    expect(entries).toContain('acme/assets/logo.png')
  })

  it('slug collisions across spellings share one folder deterministically', async () => {
    const outcomes = await Promise.allSettled([
      createBrand(root, request('Acme Co')),
      createBrand(root, request('acme-co')),
      createBrand(root, request('ACME CO!')),
    ])
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1)
    expect(await readdir(root)).toEqual(['acme-co'])
  })
})
