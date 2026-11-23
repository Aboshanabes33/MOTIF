import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createBrand, readBrand } from '../src/brand-store.ts'
import { decodeLogo, MAX_LOGO_BYTES, validateLogoBytes } from '../src/logo.ts'
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jv1sAAAAASUVORK5CYII=', 'base64')
const url = `data:image/png;base64,${png.toString('base64')}`
const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
describe('raster logo validation', () => {
  it('accepts a real PNG', () => { expect(decodeLogo(url).bytes).toEqual(png) })
  it('accepts JPEG and WebP signatures', () => {
    expect(validateLogoBytes(Uint8Array.from([255,216,255,224,255,217]), 'image/jpeg')).toBe('image/jpeg')
    const webp = new Uint8Array(20)
    webp.set(Buffer.from('RIFF'), 0); webp.set(Buffer.from('WEBPVP8 '), 8)
    expect(validateLogoBytes(webp, 'image/webp')).toBe('image/webp')
  })
  it.each(['data:image/svg+xml;base64,PHN2Zy8+', 'data:image/png;base64,@@==', 'data:image/png;base64,YQ=', 'data:image/png;base64,YR==', 'data:image/png;base64,'])('rejects malformed or unsafe URLs', (value: string) => {
    expect(() => decodeLogo(value)).toThrow()
  })
  it('rejects spoofed MIME and truncated headers', () => {
    expect(() => decodeLogo(url.replace('image/png', 'image/jpeg'))).toThrow(/matching/)
    expect(() => validateLogoBytes(png.subarray(0, 10), 'image/png')).toThrow()
  })
  it('rejects oversized content before decoding', () => {
    expect(() => decodeLogo(`data:image/png;base64,${'A'.repeat(4*Math.ceil(MAX_LOGO_BYTES/3)+64)}`)).toThrow(/2 MiB/)
    expect(() => validateLogoBytes(new Uint8Array(MAX_LOGO_BYTES+1), 'image/png')).toThrow(/2 MiB/)
  })
  it('stores the asset once, not as base64 in brand.json, and reloads it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'motif-logo-')); roots.push(root)
    const brand = await createBrand(root, { name: 'Acme', identity: undefined as never, logo: url })
    const stored = JSON.parse(await readFile(join(brand.path, 'brand.json'), 'utf8'))
    expect(stored.logo).toBeUndefined()
    expect(stored.logoFile).toBe('assets/logo.png')
    expect(await readFile(join(brand.path, stored.logoFile))).toEqual(png)
    expect((await readBrand(brand.path))?.logo).toBe(url)
  })
  it('rejects a bad logo before creating any folder', async () => {
    const root = await mkdtemp(join(tmpdir(), 'motif-logo-')); roots.push(root)
    await expect(createBrand(root, { name: 'Bad', identity: undefined as never, logo: 'data:image/png;base64,YQ==' })).rejects.toThrow()
    expect(await readdir(root)).toEqual([])
  })
  it('rejects traversal asset references without reading outside the Brand', async () => {
    const root = await mkdtemp(join(tmpdir(), 'motif-logo-')); roots.push(root)
    const brand = await createBrand(root, { name: 'Acme', identity: undefined as never, logo: url })
    const file = join(brand.path, 'brand.json')
    const stored = JSON.parse(await readFile(file, 'utf8'))
    stored.logoFile = '../../secret.png'
    const { writeFile } = await import('node:fs/promises')
    await writeFile(file, JSON.stringify(stored))
    await expect(readBrand(brand.path)).rejects.toThrow(/asset path/)
  })

  it('rejects an asset symlink escaping the Brand', async () => {
    const root = await mkdtemp(join(tmpdir(), 'motif-logo-')); roots.push(root)
    const brand = await createBrand(root, { name: 'Acme', identity: undefined as never, logo: url })
    const { unlink, symlink, writeFile } = await import('node:fs/promises')
    const outside = join(root, 'outside.png')
    await writeFile(outside, png)
    await unlink(join(brand.path, 'assets/logo.png'))
    await symlink(outside, join(brand.path, 'assets/logo.png'))
    await expect(readBrand(brand.path)).rejects.toThrow(/outside/)
  })

})
