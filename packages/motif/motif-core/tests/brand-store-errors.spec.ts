import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  listBrands,
  listBrandsDetailed,
  MotifBrandCorruptError,
  readBrand,
} from '../src/brand-store.ts'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'motif-brands-'))
})

afterEach(async () => {
  // Restore permissions so cleanup can traverse folders the tests locked.
  await chmod(root, 0o755).catch(() => {})
  await rm(root, { recursive: true, force: true })
})

const noWorkspaces = (): undefined => undefined

async function makeBrandFolder(name: string, brandJson: string): Promise<string> {
  const path = join(root, name)
  await mkdir(path, { recursive: true })
  await writeFile(join(path, 'brand.json'), brandJson)
  return path
}

const VALID_BRAND_JSON = JSON.stringify({
  version: 1,
  name: 'Acme',
  identity: {},
  updatedAt: '2026-11-20T10:00:00.000Z',
})

describe('listBrandsDetailed', () => {
  it('treats a missing root as an empty list, not a failure', async () => {
    const result = await listBrandsDetailed(join(root, 'does-not-exist'), noWorkspaces)
    expect(result).toEqual({ brands: [], problems: [] })
  })

  it('propagates an unreadable root instead of showing an empty list', async () => {
    await chmod(root, 0o000)
    await expect(listBrandsDetailed(root, noWorkspaces)).rejects.toMatchObject({ code: 'EACCES' })
  })

  it('keeps readable Brands and reports a corrupt one with its path', async () => {
    await makeBrandFolder('acme', VALID_BRAND_JSON)
    const broken = await makeBrandFolder('broken', '{ not json')
    const result = await listBrandsDetailed(root, noWorkspaces)
    expect(result.brands.map(brand => brand.name)).toEqual(['Acme'])
    expect(result.problems).toEqual([
      expect.objectContaining({ path: broken, kind: 'corrupt' }),
    ])
    expect(result.problems[0]?.message).toContain('broken')
  })

  it('recovers once the corrupt metadata is fixed', async () => {
    const broken = await makeBrandFolder('broken', '{ not json')
    const first = await listBrandsDetailed(root, noWorkspaces)
    expect(first.problems).toHaveLength(1)
    await writeFile(join(broken, 'brand.json'), VALID_BRAND_JSON.replace('Acme', 'Fixed'))
    const second = await listBrandsDetailed(root, noWorkspaces)
    expect(second.problems).toEqual([])
    expect(second.brands.map(brand => brand.name)).toEqual(['Fixed'])
  })
})

describe('listBrands', () => {
  it('still returns just the readable Brands', async () => {
    await makeBrandFolder('acme', VALID_BRAND_JSON)
    await makeBrandFolder('broken', '{ not json')
    const brands = await listBrands(root, noWorkspaces)
    expect(brands.map(brand => brand.name)).toEqual(['Acme'])
  })
})

describe('readBrand', () => {
  it('returns undefined when the folder has no brand.json', async () => {
    const path = join(root, 'empty')
    await mkdir(path)
    await expect(readBrand(path)).resolves.toBeUndefined()
  })

  it('distinguishes corrupt metadata from a nonexistent Brand', async () => {
    const path = await makeBrandFolder('broken', '{ not json')
    const failure = await readBrand(path).then(
      () => { throw new Error('expected readBrand to reject') },
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(MotifBrandCorruptError)
    expect((failure as MotifBrandCorruptError).code).toBe('BRAND_CORRUPT')
    expect((failure as MotifBrandCorruptError).brandPath).toBe(path)
  })

  it('rejects metadata that parses but has no usable name', async () => {
    const path = await makeBrandFolder('nameless', JSON.stringify({ version: 1, name: '  ', identity: {} }))
    await expect(readBrand(path)).rejects.toBeInstanceOf(MotifBrandCorruptError)
  })

  it('propagates permission errors on brand.json instead of returning undefined', async () => {
    const path = await makeBrandFolder('locked', VALID_BRAND_JSON)
    await chmod(join(path, 'brand.json'), 0o000)
    await expect(readBrand(path)).rejects.toMatchObject({ code: 'EACCES' })
  })

  it('counts zero videos when the timeline folder is missing', async () => {
    const path = await makeBrandFolder('acme', VALID_BRAND_JSON)
    const brand = await readBrand(path)
    expect(brand?.videoCount).toBe(0)
  })

  it('propagates an unreadable timeline instead of counting zero', async () => {
    const path = await makeBrandFolder('acme', VALID_BRAND_JSON)
    const timeline = join(path, 'timeline')
    await mkdir(timeline)
    await chmod(timeline, 0o000)
    try {
      await expect(readBrand(path)).rejects.toMatchObject({ code: 'EACCES' })
    } finally {
      await chmod(timeline, 0o755)
    }
  })
})
