/** Real Host cookie admission, no viewer-to-owner promotion in the media carrier. */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import * as Connection from '@deepseek-ai/dsh-client-connection'
import LocalCredentials from '@deepseek-ai/dsh-credentials-local'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import * as Token from '../../../host/authentication-token/src/index.ts'
import { BrowserAuth } from '../../../host/authentication-token/src/browser-auth.ts'
import { LocalSubprocessRuntime } from '../../../subprocess/subprocess-local/src/index.ts'
import { managedMediaRunner } from '../src/media-process.ts'
import { mkdtemp, writeFile, rm, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { expect, it, onTestFinished, vi } from 'vitest'
import { MediaHttpCarrier } from '../src/media-http.ts'
it.skipIf(process.env.MOTIF_REAL_MEDIA_SMOKE !== '1')('renders real local fixture through Host cookie admission and managed subprocess runner', async () => {
  const root = await mkdtemp(join(tmpdir(), 'motif-media-auth-')), ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) })
  const config = join(root, 'cordis.yml')
  await writeFile(config, [
    { name: 'cordis:credentials', config: { path: join(root, '.credentials.yaml'), watch: false } },
    { name: 'cordis:webserver', config: { host: '127.0.0.1', port: 0 } },
    { name: 'cordis:connection' }, { name: 'cordis:token' },
  ].map(row => `- ${JSON.stringify(row)}`).join('\n'))
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  Object.assign(ctx.loader.builtins, {
    include: Include, credentials: LocalCredentials, webserver: WebServer, connection: Connection, token: Token,
  })
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(config).href } }); await ctx.loader.await()
  const origin = `http://127.0.0.1:${ctx.webServer.port}`
  const tools = {
    ffmpeg: process.env.MOTIF_SMOKE_FFMPEG ?? 'ffmpeg', ffprobe: process.env.MOTIF_SMOKE_FFPROBE ?? 'ffprobe',
    whisper: process.env.MOTIF_SMOKE_WHISPER ?? 'whisper', hyperframes: process.env.MOTIF_SMOKE_HYPERFRAMES ?? 'hyperframes',
  }
  const fixture = join(root, 'fixture.mp4')
  if (process.env.MOTIF_SMOKE_SPEECH) {
    await promisify(execFile)(tools.ffmpeg, ['-nostdin', '-y', '-f', 'lavfi', '-i', 'color=c=navy:s=320x180:d=11', '-i', process.env.MOTIF_SMOKE_SPEECH, '-c:v', 'libx264', '-c:a', 'aac', '-shortest', '-threads', '2', fixture])
  } else await promisify(execFile)(tools.ffmpeg, ['-nostdin', '-y', '-f', 'lavfi', '-i', 'color=c=navy:s=320x180:d=1',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', '-threads', '2', fixture])
  await mkdir(join(root, 'brand')); await writeFile(join(root, 'brand', 'brand.json'), '{}')
  await ctx.plugin(LocalSubprocessRuntime)
  const managed = managedMediaRunner(spec => ctx.subprocess.spawn(spec))
  const carrier = new MediaHttpCarrier({ root, verified: true, tools,
    run: request => managed({ ...request, env: {
      ...request.env, OMP_NUM_THREADS: '2', HYPERFRAMES_RENDER_LOCK_DIR: root + '/render-lock',
    } }),
  })
  ctx.effect(() => () => carrier.close())
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/motif-media', auth: 'required', handler: (req, res, peer) => carrier.handle(req, res, peer) }))
  expect((await fetch(origin + '/motif-media/readiness')).status).toBe(401)
  const auth = await BrowserAuth.create(ctx[Context.root], ctx.credentials, 30)
  const exchange = await fetch(auth.authenticatedUrl(origin), { redirect: 'manual' })
  expect(exchange.status).toBe(303)
  const cookie = exchange.headers.get('set-cookie')?.split(';', 1)[0]
  expect(cookie).toBeDefined()
  const admitted = await fetch(origin + '/motif-media/readiness', { headers: { cookie: cookie! } })
  expect(admitted.status).toBe(200)
  expect(await admitted.json()).toMatchObject({ available: true })
  expect((await fetch(origin + '/motif-media/import?brand=x&name=x.mp4', { method: 'POST', headers: { cookie: cookie!, 'sec-fetch-site': 'cross-site' }, body: 'video' })).status).toBe(403)
  const headers = { cookie: cookie!, 'sec-fetch-site': 'same-origin' }
  const importedResponse = await fetch(origin + '/motif-media/import?brand=brand&name=fixture.mp4', {
    method: 'POST', headers, body: await readFile(fixture),
  })
  expect(importedResponse.status).toBe(201)
  const imported = await importedResponse.json() as { id: string }
  const revision = await (await fetch(origin + '/motif-media/review?brand=brand', { method: 'POST', headers,
    body: JSON.stringify({ sourceId: imported.id, clips: [{ start: 0, end: process.env.MOTIF_SMOKE_SPEECH ? 4 : 1, title: 'MOTIF authenticated managed render' }] }),
  })).json() as { id: string }
  const started = await fetch(origin + '/motif-media/start?brand=brand', { method: 'POST', headers, body: JSON.stringify({ revision: revision.id }) })
  expect(started.status).toBe(202)
  await vi.waitFor(async () => {
    const status = await (await fetch(origin + '/motif-media/status?brand=brand&job=' + revision.id, { headers })).json() as { state: string; stage?: string }
    expect(status.state).toBe('completed')
  }, { timeout: 100000, interval: 2000 })
  const output = await fetch(origin + '/motif-media/output?brand=brand&job=' + revision.id, { headers })
  expect(output.status).toBe(200)
  const bytes = Buffer.from(await output.arrayBuffer()); expect(bytes.length).toBeGreaterThan(1000)
  if (process.env.MOTIF_SMOKE_OUTPUT) await writeFile(process.env.MOTIF_SMOKE_OUTPUT, bytes)
  const range = await fetch(origin + '/motif-media/output?brand=brand&job=' + revision.id, { headers: { ...headers, range: 'bytes=0-31' } })
  expect(range.status).toBe(206); expect((await range.arrayBuffer()).byteLength).toBe(32)
  console.log('verified real managed Host HTTP bytes', bytes.length)
}, 115000)
