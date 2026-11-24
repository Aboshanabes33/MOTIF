/** Single-owner HTTP carrier. Authentication is supplied by webServer; never a standalone listener. */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { open, realpath } from 'node:fs/promises'
import { constants } from 'node:fs'
import { relative, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { PeerScope } from '@deepseek-ai/dsh-typert-protocol'
import { MediaWorkspace } from './media-workspace.ts'
import { MediaJobs } from './media-jobs.ts'
import type { EditPlan, MediaTools, ProcessRunner } from './media-pipeline.ts'

interface JobRecord { id: string; brand: string; root: string; state: string; output?: string }
export interface MediaCarrierOptions {
  root: string
  tools: MediaTools
  run: ProcessRunner
  /** Explicit verification gate, not inferred from binary presence. */
  verified: boolean
}
function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(value))
}
/** Small JSON controls never share the binary upload path or allocate an unbounded body. */
async function body(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []; let size = 0
  for await (const chunk of req) { size += chunk.length; if (size > 32768) throw new Error('Control request too large'); chunks.push(Buffer.from(chunk)) }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
/** Peer-aware handler and owned job lifetime, mounted only by trusted Host composition. */
export class MediaHttpCarrier {
  private readonly workspace = new MediaWorkspace()
  private readonly jobs = new MediaJobs(1)
  private readonly records = new Map<string, JobRecord>()
  private readonly stop = new AbortController()
  constructor(private readonly options: MediaCarrierOptions) {}
  async close(): Promise<void> { this.stop.abort(); await this.jobs.drain() }

  /** All paths are owner-only, no anonymous/output capability URLs or caller-selected filesystem paths. */
  async handle(req: IncomingMessage, res: ServerResponse, peer?: PeerScope): Promise<void> {
    if (peer?.principal.kind !== 'owner' || peer.signal.aborted) { json(res, 403, { error: 'owner_required' }); return }
    res.setHeader('Cache-Control', 'no-store')
    // Require browser same-origin metadata on all mutations, in addition to Host admission.
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers['sec-fetch-site'] !== 'same-origin') {
      json(res, 403, { error: 'same_origin_required' }); return
    }
    const url = new URL(req.url ?? '/', 'http://local.invalid')
    if (url.pathname === '/motif-media/readiness' && req.method === 'GET') {
      json(res, 200, { available: this.options.verified, reason: this.options.verified ? undefined : 'Real local tools and complete carrier acceptance are not verified.' }); return
    }
    if (!this.options.verified) { json(res, 503, { error: 'media_not_verified' }); return }
    const disconnected = new AbortController()
    req.once('aborted', () => { disconnected.abort() })
    const signal = AbortSignal.any([peer.signal, this.stop.signal, disconnected.signal])
    try {
      const brandId = url.searchParams.get('brand') ?? ''
      const root = await this.workspace.brandRoot(this.options.root, brandId)
      if (url.pathname === '/motif-media/import' && req.method === 'POST') {
        const filename = url.searchParams.get('name') ?? ''
        json(res, 201, await this.workspace.import(root, filename, req, signal)); return
      }
      if (url.pathname === '/motif-media/review' && req.method === 'POST') {
        const input = await body(req) as { sourceId?: unknown; clips?: unknown }
        if (!input || typeof input.sourceId !== 'string' || !Array.isArray(input.clips)) throw new Error('Invalid reviewed plan')
        json(res, 201, this.workspace.review(root, input.sourceId, input.clips as EditPlan['clips'])); return
      }
      if (url.pathname === '/motif-media/start' && req.method === 'POST') {
        if (this.records.size >= 100 || [...this.records.values()].some(record => ['running', 'cancelling'].includes(record.state))) throw new Error('Media runtime busy or history full')
        const input = await body(req) as { revision?: unknown }
        if (!input || typeof input.revision !== 'string') throw new Error('Review required')
        const record: JobRecord = { id: input.revision, brand: brandId, root, state: 'running' }
        this.records.set(record.id, record)
        let plan: EditPlan
        try { plan = await this.workspace.consume(root, input.revision, signal) }
        catch (error) { this.records.delete(record.id); throw error }
        void this.jobs.start(brandId, root, plan, { tools: this.options.tools, run: this.options.run, signal }).then((result) => {
          record.state = 'completed'; record.output = result.output
        }).catch(() => { record.state = signal.aborted || record.state === 'cancelling' ? 'cancelled' : 'failed' })
        json(res, 202, { id: record.id, state: record.state }); return
      }
      const record = this.records.get(url.searchParams.get('job') ?? '')
      if (!record || record.root !== root) { json(res, 404, { error: 'job_not_found' }); return }
      if (url.pathname === '/motif-media/status' && req.method === 'GET') {
        json(res, 200, { id: record.id, state: record.state, stage: this.jobs.status(brandId)?.state }); return
      }
      if (url.pathname === '/motif-media/cancel' && req.method === 'POST') {
        if (record.state === 'running') { this.jobs.cancel(brandId); record.state = 'cancelling' }
        json(res, 202, { id: record.id, state: record.state }); return
      }
      if (url.pathname === '/motif-media/output' && (req.method === 'GET' || req.method === 'HEAD')) {
        if (record.state !== 'completed' || !record.output) { json(res, 409, { error: 'output_not_ready' }); return }
        const canonical = await realpath(record.output), rel = relative(root, canonical)
        if (!rel.startsWith('timeline' + sep) || rel.split(sep).at(-1) !== 'output.mp4') throw new Error('Invalid output')
        const file = await open(canonical, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
        try {
          const info = await file.stat()
          if (!info.isFile() || info.size < 1 || info.size > 3 * 1024 ** 3) throw new Error('Invalid output')
          res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': String(info.size), 'Content-Disposition': 'attachment; filename="motif-output.mp4"', 'X-Content-Type-Options': 'nosniff' })
          if (req.method === 'HEAD') res.end()
          else await pipeline(file.createReadStream({ autoClose: false }), res, { signal })
        } finally { await file.close() }
        return
      }
      json(res, 405, { error: 'unsupported_media_operation' })
    } catch { if (!res.headersSent) json(res, signal.aborted ? 409 : 400, { error: 'media_request_failed' }); else res.destroy() }
  }
}
