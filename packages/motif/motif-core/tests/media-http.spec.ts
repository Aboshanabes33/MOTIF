import { afterEach, expect, it, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { MediaHttpCarrier } from '../src/media-http.ts'
import type { PeerScope } from '@deepseek-ai/dsh-typert-protocol'
const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
async function fixture(verified: boolean, owner = true) {
  const root = await mkdtemp(join(tmpdir(), 'motif-media-http-'))
  await mkdir(join(root, 'brand')); await writeFile(join(root, 'brand/brand.json'), '{}')
  const run = vi.fn().mockRejectedValue(new Error('Tool intentionally unavailable'))
  const carrier = new MediaHttpCarrier({ root, verified, tools: { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', whisper: 'whisper', hyperframes: 'hyperframes' }, run })
  const peer = { principal: { kind: owner ? 'owner' : 'viewer' }, signal: new AbortController().signal } as unknown as PeerScope
  const server: Server = createServer((req, res) => { void carrier.handle(req, res, peer) })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const address = server.address() as { port: number }
  cleanup.push(async () => {
    await carrier.close(); server.closeAllConnections()
    await new Promise<void>((resolve) => { server.close(() => resolve()) })
    await rm(root, { recursive: true, force: true })
  })
  return { url: `http://127.0.0.1:${address.port}`, run }
}
it('keeps unverified execution unavailable', async () => { const { url, run } = await fixture(false); expect(await (await fetch(url + '/motif-media/readiness')).json()).toMatchObject({ available: false }); expect((await fetch(url + '/motif-media/import?brand=brand&name=clip.mp4', { method: 'POST', headers: { 'sec-fetch-site': 'same-origin' }, body: 'video' })).status).toBe(503); expect(run).not.toHaveBeenCalled() })
it('denies nonowners and cross-origin mutations', async () => { const viewer = await fixture(true, false); expect((await fetch(viewer.url + '/motif-media/readiness')).status).toBe(403); const owner = await fixture(true); expect((await fetch(owner.url + '/motif-media/import?brand=brand&name=clip.mp4', { method: 'POST', body: 'video' })).status).toBe(403) })
it('imports binary then reviews a server-held plan without executing it', async () => { const { url, run } = await fixture(true); const headers = { 'sec-fetch-site': 'same-origin' }; const imported = await (await fetch(url + '/motif-media/import?brand=brand&name=clip.mp4', { method: 'POST', headers, body: 'video fixture' })).json() as { id: string }; const reviewed = await fetch(url + '/motif-media/review?brand=brand', { method: 'POST', headers, body: JSON.stringify({ sourceId: imported.id, clips: [{ start: 0, end: 1 }] }) }); expect(reviewed.status).toBe(201); expect(await reviewed.json()).toMatchObject({ sourceId: imported.id, plan: { version: 1 } }); expect(run).not.toHaveBeenCalled(); expect((await fetch(url + '/motif-media/output?brand=brand&job=unknown')).status).toBe(404) })
