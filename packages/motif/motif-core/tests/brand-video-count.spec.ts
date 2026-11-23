import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isVideoAsset, readBrand } from '../src/brand-store.ts'

let root: string
let brandPath: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'motif-videos-'))
  brandPath = join(root, 'acme')
  await mkdir(brandPath, { recursive: true })
  await writeFile(join(brandPath, 'brand.json'), JSON.stringify({
    version: 1,
    name: 'Acme',
    identity: {},
    updatedAt: '2026-11-20T10:00:00.000Z',
  }))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function touch(relative: string): Promise<void> {
  const path = join(brandPath, relative)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, 'x')
}

describe('isVideoAsset', () => {
  it('accepts the supported video containers, case-insensitively', () => {
    for (const name of ['cut.mp4', 'take.MOV', 'clip.webm', 'raw.mkv', 'phone.m4v']) {
      expect(isVideoAsset(name)).toBe(true)
    }
  })

  it('rejects metadata, captions, images, and extensionless files', () => {
    for (const name of ['brand.json', '001-brief.md', 'captions.srt', 'titles.vtt', 'poster.png', 'logo.svg', 'video', '.mp4']) {
      expect(isVideoAsset(name)).toBe(false)
    }
  })
})

describe('readBrand videoCount', () => {
  it('counts only real video assets among mixed file types', async () => {
    await touch('source.mp4')
    await touch('rendered/output.mov')
    await touch('timeline/001-brief.md')
    await touch('timeline/002-cut.json')
    await touch('timeline/captions.srt')
    await touch('poster.png')
    await touch('assets/logo.png')
    const brand = await readBrand(brandPath)
    expect(brand?.videoCount).toBe(2)
  })

  it('counts videos inside the timeline only when they are videos', async () => {
    await touch('timeline/screen-recording.webm')
    await touch('timeline/notes.md')
    const brand = await readBrand(brandPath)
    expect(brand?.videoCount).toBe(1)
  })

  it('counts zero when the timeline directory is missing', async () => {
    const brand = await readBrand(brandPath)
    expect(brand?.videoCount).toBe(0)
  })

  it('skips hidden files and hidden directories', async () => {
    await touch('.hidden.mp4')
    await touch('.cache/cached.mp4')
    const brand = await readBrand(brandPath)
    expect(brand?.videoCount).toBe(0)
  })
})
