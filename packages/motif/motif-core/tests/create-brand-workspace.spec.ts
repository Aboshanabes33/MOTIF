import { it,expect } from 'vitest'
import { mkdtemp,writeFile,readFile,rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createBrand,removeCreatedBrand } from '../src/brand-store.ts'

it('keeps foreign files written after Brand creation during rollback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'motif-foreign-'))
  try {
    const brand = await createBrand(root, { name: 'Foreign', identity: undefined as never })
    await writeFile(join(brand.path, 'timeline', 'new-edit.md'), 'user work')
    expect(await removeCreatedBrand(brand)).toBe(false)
    expect(await readFile(join(brand.path, 'timeline', 'new-edit.md'), 'utf8')).toBe('user work')
  } finally { await rm(root, { recursive:true,force:true }) }
})
