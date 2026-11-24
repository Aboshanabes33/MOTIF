import { afterEach, expect, it, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { MediaHttpCarrier, parseMediaRange } from '../src/media-http.ts'
import type { PeerScope } from '@deepseek-ai/dsh-typert-protocol'
const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
async function fixture(verified: boolean, owner = true, runner?: import('../src/media-pipeline.ts').ProcessRunner) {
  const root = await mkdtemp(join(tmpdir(), 'motif-media-http-'))
  await mkdir(join(root, 'other')); await writeFile(join(root, 'other/brand.json'), '{}')
  await mkdir(join(root, 'brand')); await writeFile(join(root, 'brand/brand.json'), '{}')
  const run = runner ? vi.fn(runner) : vi.fn().mockRejectedValue(new Error('Tool intentionally unavailable'))
  let carrier = new MediaHttpCarrier({ root, verified, tools: { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', whisper: 'whisper', hyperframes: 'hyperframes' }, run })
  const peer = { principal: { kind: owner ? 'owner' : 'viewer' }, signal: new AbortController().signal } as unknown as PeerScope
  const server: Server = createServer((req, res) => { void carrier.handle(req, res, peer) })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const address = server.address() as { port: number }
  cleanup.push(async () => {
    await carrier.close(); server.closeAllConnections()
    await new Promise<void>((resolve) => { server.close(() => resolve()) })
    await rm(root, { recursive: true, force: true })
  })
  return { url: `http://127.0.0.1:${address.port}`, run, restart: async () => {
    await carrier.close()
    carrier = new MediaHttpCarrier({ root, verified, tools: { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', whisper: 'whisper', hyperframes: 'hyperframes' }, run })
  } }
}
it('keeps unverified execution unavailable', async () => { const { url, run } = await fixture(false); expect(await (await fetch(url + '/motif-media/readiness')).json()).toMatchObject({ available: false }); expect((await fetch(url + '/motif-media/import?brand=brand&name=clip.mp4', { method: 'POST', headers: { 'sec-fetch-site': 'same-origin' }, body: 'video' })).status).toBe(503); expect(run).not.toHaveBeenCalled() })
it('denies nonowners and cross-origin mutations', async () => { const viewer = await fixture(true, false); expect((await fetch(viewer.url + '/motif-media/readiness')).status).toBe(403); const owner = await fixture(true); expect((await fetch(owner.url + '/motif-media/import?brand=brand&name=clip.mp4', { method: 'POST', body: 'video' })).status).toBe(403) })
it('imports binary then reviews a server-held plan without executing it', async () => { const { url, run } = await fixture(true); const headers = { 'sec-fetch-site': 'same-origin' }; const imported = await (await fetch(url + '/motif-media/import?brand=brand&name=clip.mp4', { method: 'POST', headers, body: 'video fixture' })).json() as { id: string }; const reviewed = await fetch(url + '/motif-media/review?brand=brand', { method: 'POST', headers, body: JSON.stringify({ sourceId: imported.id, clips: [{ start: 0, end: 1 }] }) }); expect(reviewed.status).toBe(201); expect(await reviewed.json()).toMatchObject({ sourceId: imported.id, plan: { version: 1 } }); expect(run).not.toHaveBeenCalled(); expect((await fetch(url + '/motif-media/output?brand=brand&job=unknown')).status).toBe(404) })

it('bounds byte ranges and refuses ambiguous multi-range requests', () => {
  expect(parseMediaRange(undefined, 100)).toBeUndefined()
  expect(parseMediaRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19 })
  expect(parseMediaRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 })
  expect(parseMediaRange('bytes=-5', 100)).toEqual({ start: 95, end: 99 })
  expect(parseMediaRange('bytes=100-', 100)).toBeNull()
  expect(parseMediaRange('bytes=0-2,5-7', 100)).toBeNull()
  expect(parseMediaRange('bytes=-0', 100)).toBeNull()
})

async function startFixture(url: string) {
  const headers = { 'sec-fetch-site': 'same-origin' }
  const source = await (await fetch(url + '/motif-media/import?brand=brand&name=clip.mp4', { method: 'POST', headers, body: 'source fixture' })).json() as { id: string }
  const revision = await (await fetch(url + '/motif-media/review?brand=brand', { method: 'POST', headers, body: JSON.stringify({ sourceId: source.id, clips: [{ start: 0, end: 1 }] }) })).json() as { id: string }
  const started = await fetch(url + '/motif-media/start?brand=brand', { method: 'POST', headers, body: JSON.stringify({ revision: revision.id }) })
  expect(started.status).toBe(202)
  return revision.id
}
it('streams only completed owned output and honors a bounded range', async () => {
  const { url, restart } = await fixture(true, true, async (request) => {
    if (request.file === 'ffprobe') return { stdout: JSON.stringify({ format: { duration: 1 }, streams: [{ codec_type: 'video' }] }), stderr: '' }
    if (request.file === 'ffmpeg') await writeFile(join(request.cwd, request.args.at(-1)!), 'encoded fixture')
    if (request.file === 'whisper') await writeFile(join(request.cwd, 'audio.json'), JSON.stringify({ segments: [] }))
    if (request.file === 'hyperframes') await writeFile(join(request.cwd, 'output.partial.mp4'), 'verified video fixture')
    return { stdout: '', stderr: '' }
  })
  const id = await startFixture(url)
  await vi.waitFor(async () => { expect(await (await fetch(url + '/motif-media/status?brand=brand&job=' + id)).json()).toMatchObject({ state: 'completed' }) })
  const replay = await fetch(url + '/motif-media/start?brand=brand', { method: 'POST', headers: { 'sec-fetch-site': 'same-origin' }, body: JSON.stringify({ revision: id }) })
  expect(replay.status).toBe(400)
  expect(await (await fetch(url + '/motif-media/status?brand=brand&job=' + id)).json()).toMatchObject({ state: 'completed' })
  await restart()
  expect(await (await fetch(url + '/motif-media/status?brand=brand&job=' + id)).json()).toMatchObject({ state: 'completed' })
  const head = await fetch(url + '/motif-media/output?brand=brand&job=' + id, { method: 'HEAD' })
  expect(head.status).toBe(200); expect(head.headers.get('content-length')).toBe('22'); expect(await head.text()).toBe('')
  expect((await fetch(url + '/motif-media/output?brand=other&job=' + id)).status).toBe(404)
  const response = await fetch(url + '/motif-media/output?brand=brand&job=' + id, { headers: { Range: 'bytes=0-7' } })
  expect(response.status).toBe(206); expect(response.headers.get('content-range')).toBe('bytes 0-7/22'); expect(await response.text()).toBe('verified')
  expect((await fetch(url + '/motif-media/output?brand=brand&job=' + id, { headers: { Range: 'bytes=999-' } })).status).toBe(416)
})
it('cancels an active runner and never exposes its partial output', async () => {
  const entered = Promise.withResolvers<undefined>()
  const { url } = await fixture(true, true, async (request) => {
    entered.resolve(undefined)
    await new Promise<void>((_resolve, reject) => { request.signal.addEventListener('abort', () => { reject(new Error('cancelled')) }, { once: true }) })
    return { stdout: '', stderr: '' }
  })
  const id = await startFixture(url); await entered.promise
  expect((await fetch(url + '/motif-media/cancel?brand=brand&job=' + id, { method: 'POST', headers: { 'sec-fetch-site': 'same-origin' } })).status).toBe(202)
  await vi.waitFor(async () => { expect(await (await fetch(url + '/motif-media/status?brand=brand&job=' + id)).json()).toMatchObject({ state: 'cancelled' }) })
  expect((await fetch(url + '/motif-media/output?brand=brand&job=' + id)).status).toBe(409)
})
