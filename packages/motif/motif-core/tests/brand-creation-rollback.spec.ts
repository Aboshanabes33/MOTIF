import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MotifBrandError, removeCreatedBrand } from '../src/brand-store.ts'
import { createBrandWithWorkspace } from '../src/create-brand-workspace.ts'
import type { BrandWorkspaceRegistry } from '../src/create-brand-workspace.ts'
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

const REQUEST: MotifBrandCreateRequest = { name: 'Acme', identity: IDENTITY }

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'motif-brand-tx-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/** Registry double; each behavior is set per test. */
function makeRegistry(behavior: {
  failCreate?: Error
  failSetTitle?: Error
  failDelete?: Error
} = {}): BrandWorkspaceRegistry & { created: string[]; deleted: string[]; titled: string[] } {
  const created: string[] = []
  const deleted: string[] = []
  const titled: string[] = []
  return {
    created,
    deleted,
    titled,
    create: async (path: string) => {
      if (behavior.failCreate !== undefined) throw behavior.failCreate
      created.push(path)
      return {
        id: `ws-${created.length}`,
        setTitle: async (title: string) => {
          titled.push(title)
          if (behavior.failSetTitle !== undefined) throw behavior.failSetTitle
        },
      }
    },
    delete: async (id: string) => {
      deleted.push(id)
      if (behavior.failDelete !== undefined) throw behavior.failDelete
      return true
    },
  }
}

describe('createBrandWithWorkspace', () => {
  it('returns the Brand with its workspace id on success', async () => {
    const registry = makeRegistry()
    const result = await createBrandWithWorkspace(root, REQUEST, registry)
    expect(result.workspaceId).toBe('ws-1')
    expect(result.brand.workspaceId).toBe('ws-1')
    expect(registry.titled).toEqual(['Acme'])
    const stored = JSON.parse(await readFile(join(root, 'acme', 'brand.json'), 'utf8'))
    expect(stored.name).toBe('Acme')
  })

  it('rolls back the new folder when registration fails, with an accurate error', async () => {
    const registry = makeRegistry({ failCreate: new Error('storage domain unavailable') })
    const failure = await createBrandWithWorkspace(root, REQUEST, registry).catch((reason: unknown) => reason)
    expect(failure).toBeInstanceOf(MotifBrandError)
    expect((failure as Error).message).toContain('storage domain unavailable')
    expect((failure as Error).message).toContain('folder was removed')
    expect(await readdir(root)).toEqual([])
    expect(registry.deleted).toEqual([])
  })

  it('unregisters and rolls back when titling fails', async () => {
    const registry = makeRegistry({ failSetTitle: new Error('title write failed') })
    const failure = await createBrandWithWorkspace(root, REQUEST, registry).catch((reason: unknown) => reason)
    expect(failure).toBeInstanceOf(MotifBrandError)
    expect((failure as Error).message).toContain('title write failed')
    expect(registry.deleted).toEqual(['ws-1'])
    expect(await readdir(root)).toEqual([])
  })

  it('keeps the folder when unregistration itself fails', async () => {
    const registry = makeRegistry({ failSetTitle: new Error('title write failed'), failDelete: new Error('registry locked') })
    const failure = await createBrandWithWorkspace(root, REQUEST, registry).catch((reason: unknown) => reason)
    expect((failure as Error).message).toContain('title write failed')
    expect((failure as Error).message).toContain('folder was kept')
    expect((await readdir(root)).length).toBe(1)
  })

  it('keeps the folder and says so when it no longer matches what was created', async () => {
    const registry = makeRegistry({
      failSetTitle: new Error('title write failed'),
    })
    // Corrupt the metadata between creation and rollback by intercepting create.
    const original = registry.create
    registry.create = async (path: string) => {
      const workspace = await original(path)
      await writeFile(join(path, 'brand.json'), '{"version":1,"name":"Someone else","identity":{},"updatedAt":"yesterday"}\n')
      return workspace
    }
    const failure = await createBrandWithWorkspace(root, REQUEST, registry).catch((reason: unknown) => reason)
    expect((failure as Error).message).toContain('folder was kept at')
    expect((failure as Error).message).toContain(join(root, 'acme'))
    expect(await readdir(root)).toEqual(['acme'])
  })
})

describe('removeCreatedBrand', () => {
  it('removes the folder this operation created', async () => {
    const registry = makeRegistry()
    const result = await createBrandWithWorkspace(root, REQUEST, registry)
    expect(await removeCreatedBrand(result.brand)).toBe(true)
    expect(await readdir(root)).toEqual([])
  })

  it('refuses a folder whose metadata was replaced', async () => {
    const registry = makeRegistry()
    const result = await createBrandWithWorkspace(root, REQUEST, registry)
    await writeFile(join(result.brand.path, 'brand.json'), '{"version":1,"name":"Acme","identity":{},"updatedAt":"other"}\n')
    expect(await removeCreatedBrand(result.brand)).toBe(false)
    expect(await readdir(root)).toEqual(['acme'])
  })

  it('refuses a folder without readable metadata', async () => {
    const registry = makeRegistry()
    const result = await createBrandWithWorkspace(root, REQUEST, registry)
    await rm(join(result.brand.path, 'brand.json'))
    expect(await removeCreatedBrand(result.brand)).toBe(false)
  })
})
