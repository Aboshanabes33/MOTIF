import { describe, expect, it } from 'vitest'
import { BrandSchemaError, parseStoredBrand } from '../src/brand-schema.ts'
const good = () => ({ version:1,name:'قهوة',identity:{ primary:'#123456',accent:'#123456',light:'#ffffff',dark:'#000000',latinFont:'Inter',arabicFont:'Noto',motion:'soft',caption:'word' },updatedAt:'2026-01-01T03:00:00+03:00' })
describe('stored Brand boundary', () => {
  it('accepts valid metadata and normalizes date offsets',()=>{expect(parseStoredBrand(good(),'brand.json').updatedAt).toBe('2026-01-01T00:00:00.000Z')})
  it.each([undefined,0])('migrates the legacy schema without mutating it', (version: number|undefined)=>{
    const source={ ...good(),version }; const before=JSON.stringify(source)
    expect(parseStoredBrand(source,'brand.json').version).toBe(1)
    expect(JSON.stringify(source)).toBe(before)
  })
  it.each([2,'1',null])('rejects unsupported versions', (version: unknown)=>{expect(()=>parseStoredBrand({ ...good(),version },'brand.json')).toThrow(/Unsupported/)})
  it.each([null,[],42])('rejects non-records', (row: unknown)=>{expect(()=>parseStoredBrand(row,'brand.json')).toThrow(BrandSchemaError)})
  it.each([{ name:4 },{ name:'' },{ updatedAt:'yesterday' },{ updatedAt:'2026-02-31T00:00:00Z' },{ identity:{} },{ logo:'javascript:alert(1)' },{ id:'../outside' },{ videoCount:-1 },{ workspaceId:[] }])('rejects invalid fields with recovery guidance',(change: object)=>{
    expect(()=>parseStoredBrand({ ...good(),...change },'/brand/brand.json')).toThrow(/Original metadata was kept/)
  })
})

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readBrand } from '../src/brand-store.ts'
it('read boundary preserves malformed metadata rather than treating it as missing', async () => {
  const root = await mkdtemp(join(tmpdir(),'motif-schema-'))
  const file = join(root,'brand.json')
  try {
    await writeFile(file,'{invalid json')
    await expect(readBrand(root)).rejects.toThrow(BrandSchemaError)
    expect(await readFile(file,'utf8')).toBe('{invalid json')
    const source=JSON.stringify({ ...good(),version:99 })
    await writeFile(file,source)
    await expect(readBrand(root)).rejects.toThrow(/Unsupported/)
    expect(await readFile(file,'utf8')).toBe(source)
  } finally { await rm(root,{ recursive:true,force:true }) }
})
it('read boundary migrates a legacy record without rewriting the file',async()=>{
  const root=await mkdtemp(join(tmpdir(),'motif-schema-'))
  const file=join(root,'brand.json')
  try {
    const source=JSON.stringify({ ...good(),version:0 })
    await writeFile(file,source)
    expect((await readBrand(root))?.name).toBe('قهوة')
    expect(await readFile(file,'utf8')).toBe(source)
  } finally {await rm(root,{ recursive:true,force:true })}
})
