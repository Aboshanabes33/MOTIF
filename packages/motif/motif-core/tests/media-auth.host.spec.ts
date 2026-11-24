/** Real Host cookie admission, no viewer-to-owner promotion in the media carrier. */
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import * as Connection from '@deepseek-ai/dsh-client-connection'
import LocalCredentials from '@deepseek-ai/dsh-credentials-local'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import * as Token from '../../../host/authentication-token/src/index.ts'
import { BrowserAuth } from '../../../host/authentication-token/src/browser-auth.ts'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { expect, it, onTestFinished, vi } from 'vitest'
import { MediaHttpCarrier } from '../src/media-http.ts'
it('requires actual Host token cookie before reaching media readiness', async () => {
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
  const carrier = new MediaHttpCarrier({ root, verified: false, tools: { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', whisper: 'whisper', hyperframes: 'hyperframes' }, run: vi.fn() })
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
  expect(await admitted.json()).toMatchObject({ available: false })
  expect((await fetch(origin + '/motif-media/import?brand=x&name=x.mp4', { method: 'POST', headers: { cookie: cookie!, 'sec-fetch-site': 'cross-site' }, body: 'video' })).status).toBe(403)
})
