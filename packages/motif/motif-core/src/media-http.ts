/** Single-owner HTTP carrier. Authentication is supplied by webServer; never a standalone listener. */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { open, realpath } from 'node:fs/promises'
import { constants } from 'node:fs'
import { relative, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { PeerScope } from '@deepseek-ai/dsh-typert-protocol'
import { MediaProposals } from './media-proposal.ts'
import { MediaWorkspace } from './media-workspace.ts'
import { loadMediaRecords, saveMediaRecord, type MediaRecord } from './media-journal.ts'
import { MediaJobs } from './media-jobs.ts'
import type { EditPlan, MediaTools, ProcessRunner } from './media-pipeline.ts'

interface JobRecord extends MediaRecord { brand: string; root: string; controller: AbortController }
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
  private readonly proposals = new MediaProposals()
  private readonly workspace = new MediaWorkspace()
  private readonly jobs = new MediaJobs(1)
  private readonly records = new Map<string, JobRecord>()
  private readonly recovered = new Map<string, Promise<void>>()
  private readonly settling = new Set<Promise<void>>()
  private uploading = false
  private starting = false
  private readonly stop = new AbortController()
  constructor(private readonly options: MediaCarrierOptions) {}
  async close(): Promise<void> { this.stop.abort(); await this.jobs.drain(); await Promise.all([...this.settling]) }

  private async recover(root: string, brand: string): Promise<void> {
    let pending = this.recovered.get(root)
    if (!pending) {
      pending = loadMediaRecords(root).then((records) => {
        if (records.length + this.records.size > 100) throw new Error('Media history full')
        for (const record of records) {
          if (this.records.has(record.id)) throw new Error('Conflicting media job id')
          this.records.set(record.id, { ...record, root, brand, controller: new AbortController() })
        }
      })
      this.recovered.set(root, pending)
    }
    await pending
  }

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
    // Bound both idle body reads and the complete upload/control lifetime.
    const mutating = req.method !== 'GET' && req.method !== 'HEAD'
    const timeout = mutating ? setTimeout(() => { disconnected.abort(); req.destroy() }, 5 * 60 * 1000) : undefined
    if (mutating) req.setTimeout(30000, () => { disconnected.abort(); req.destroy() })
    req.once('aborted', () => { disconnected.abort() })
    const signal = AbortSignal.any([peer.signal, this.stop.signal, disconnected.signal])
    try {
      const brandId = url.searchParams.get('brand') ?? ''
      const root = await this.workspace.brandRoot(this.options.root, brandId)
      await this.recover(root, brandId)
      if (url.pathname === '/motif-media/import' && req.method === 'POST') {
        if (this.uploading || this.starting || [...this.records.values()].some(r => ['running', 'cancelling'].includes(r.state))) throw new Error('Media runtime busy')
        this.uploading = true
        try {
          const filename = url.searchParams.get('name') ?? ''
          json(res, 201, await this.workspace.import(root, filename, req, signal)); return
        } finally { this.uploading = false }
      }
      if (url.pathname === '/motif-media/proposal' && req.method === 'POST') {
        const input = await body(req) as { sourceId?: unknown; instruction?: unknown }
        if (!input || typeof input.sourceId !== 'string' || typeof input.instruction !== 'string') throw new Error('Invalid proposal request')
        const source = this.workspace.source(root, input.sourceId)
        json(res, 201, await this.proposals.create(root, source.source, input.instruction)); return
      }
      if (url.pathname === '/motif-media/proposal' && req.method === 'GET') {
        const plan = await this.proposals.read(root, url.searchParams.get('proposal') ?? '')
        json(res, plan ? 200 : 202, plan ? { state: 'ready', plan } : { state: 'pending' }); return
      }
      if (url.pathname === '/motif-media/review' && req.method === 'POST') {
        const input = await body(req) as { sourceId?: unknown; clips?: unknown }
        if (!input || typeof input.sourceId !== 'string' || !Array.isArray(input.clips)) throw new Error('Invalid reviewed plan')
        json(res, 201, this.workspace.review(root, input.sourceId, input.clips as EditPlan['clips'])); return
      }
      if (url.pathname === '/motif-media/start' && req.method === 'POST') {
        if (this.uploading || this.starting || this.records.size >= 100 || [...this.records.values()].some(record => ['running', 'cancelling'].includes(record.state))) throw new Error('Media runtime busy or history full')
        this.starting = true
        try {
          await this.workspace.ensureBudget(this.options.root, 3 * 1024 ** 3)
          const input = await body(req) as { revision?: unknown }
          if (!input || typeof input.revision !== 'string') throw new Error('Review required')
          if (this.records.has(input.revision)) throw new Error('Revision already submitted')
          const record: JobRecord = { id: input.revision, brand: brandId, root, state: 'running', controller: new AbortController() }
          this.records.set(record.id, record)
          let reviewed: { plan: EditPlan; sourceHash: string }
          try { reviewed = await this.workspace.consume(root, input.revision, AbortSignal.any([signal, record.controller.signal])) }
          catch (error) { this.records.delete(record.id); throw error }
          try { await saveMediaRecord(root, record) }
          catch (error) { this.records.delete(record.id); throw error }
          const settled = this.jobs.start(brandId, root, reviewed.plan, {
            sourceHash: reviewed.sourceHash, tools: this.options.tools, run: this.options.run,
            signal: AbortSignal.any([signal, record.controller.signal]),
          }).then(async (result) => {
            await saveMediaRecord(root, { id: record.id, state: 'completed', output: result.output })
            record.state = 'completed'; record.output = result.output
          }).catch(async () => {
            record.state = signal.aborted || record.state === 'cancelling' ? 'cancelled' : 'failed'
            record.output = undefined
            await saveMediaRecord(root, record)
          }).catch(() => { record.state = 'failed'; record.output = undefined })
          this.settling.add(settled)
          void settled.finally(() => { this.settling.delete(settled) })
          json(res, 202, { id: record.id, state: record.state }); return
        } finally { this.starting = false }
      }
      if (url.pathname === '/motif-media/history' && req.method === 'GET') {
        json(res, 200, { jobs: [...this.records.values()].filter(record => record.root === root)
          .map(record => ({ id: record.id, state: record.state })) }); return
      }
      const record = this.records.get(url.searchParams.get('job') ?? '')
      if (!record || record.root !== root) { json(res, 404, { error: 'job_not_found' }); return }
      if (url.pathname === '/motif-media/status' && req.method === 'GET') {
        json(res, 200, { id: record.id, state: record.state, stage: record.state === 'running' || record.state === 'cancelling' ? this.jobs.status(brandId)?.state : undefined }); return
      }
      if (url.pathname === '/motif-media/cancel' && req.method === 'POST') {
        if (record.state === 'running') { record.state = 'cancelling'; record.controller.abort(); this.jobs.cancel(brandId) }
        json(res, 202, { id: record.id, state: record.state }); return
      }
      if (url.pathname === '/motif-media/output' && (req.method === 'GET' || req.method === 'HEAD')) {
        if (record.state !== 'completed' || !record.output) { json(res, 409, { error: 'output_not_ready' }); return }
        const canonical = await realpath(record.output), rel = relative(root, canonical)
        if (canonical !== record.output || !rel.startsWith('timeline' + sep) || rel.split(sep).at(-1) !== 'output.mp4') throw new Error('Invalid output')
        const file = await open(canonical, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
        try {
          const info = await file.stat()
          if (!info.isFile() || info.size < 1 || info.size > 3 * 1024 ** 3) throw new Error('Invalid output')
          const range = parseMediaRange(req.headers.range, info.size)
          if (range === null) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); res.end(); return }
          const start = range?.start ?? 0, end = range?.end ?? info.size - 1
          res.writeHead(range ? 206 : 200, { 'Accept-Ranges': 'bytes',
            ...(range ? { 'Content-Range': `bytes ${start}-${end}/${info.size}` } : {}),
            'Content-Type': 'video/mp4', 'Content-Length': String(end - start + 1), 'Content-Disposition': 'attachment; filename="motif-output.mp4"', 'X-Content-Type-Options': 'nosniff' })
          if (req.method === 'HEAD') res.end()
          else await pipeline(file.createReadStream({ autoClose: false, start, end }), res, { signal })
        } finally { await file.close() }
        return
      }
      json(res, 405, { error: 'unsupported_media_operation' })
    } catch { if (!res.headersSent) json(res, signal.aborted ? 409 : 400, { error: 'media_request_failed' }); else res.destroy() }
    finally { if (timeout) clearTimeout(timeout); if (mutating) req.setTimeout(0) }
  }
}

/** One bounded HTTP byte range, including suffix requests. Multi-range requests are refused. */
export function parseMediaRange(header: string | undefined, size: number): { start: number; end: number } | null | undefined {
  if (header === undefined) return undefined
  const match = /^bytes=(\d*)-(\d*)$/.exec(header)
  if (!match || (!match[1] && !match[2])) return null
  const suffix = match[1] === ''
  const first = Number(match[1]), last = Number(match[2])
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) return null
  const start = suffix ? Math.max(0, size - last) : first
  const end = suffix || !match[2] ? size - 1 : Math.min(size - 1, last)
  if (suffix && last < 1 || start >= size || start > end) return null
  return { start, end }
}
