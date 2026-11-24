/** Owner-runtime media imports and reviewed revisions. No account tenancy claim. */
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { mkdir, open, realpath, rename, rm } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'
import { validateEditPlan, type EditPlan } from './media-pipeline.ts'

interface ImportedSource { id: string; root: string; source: string; bytes: number; hash: string }
export interface ReviewedRevision { id: string; sourceId: string; hash: string; plan: EditPlan }
/** Imports are immutable random-name snapshots; wire callers never select an output path. */
export class MediaWorkspace {
  private readonly sources = new Map<string, ImportedSource>()
  private readonly revisions = new Map<string, ReviewedRevision>()
  private reservedBytes = 0
  private importing = false
  constructor(private readonly maxSourceBytes = 1024 ** 3, private readonly maxRuntimeBytes = 3 * 1024 ** 3) {}

  /** Resolve the actual Brand directory and reject sibling/escaping links. */
  async brandRoot(root: string, brandId: string): Promise<string> {
    if (!/^[\p{L}\p{N}][\p{L}\p{N}-]{0,47}$/u.test(brandId)) throw new Error('Unknown Brand')
    const base = await realpath(root), target = await realpath(join(base, brandId))
    const rel = relative(base, target)
    if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel) || rel !== brandId) throw new Error('Brand must stay inside its root')
    const metadata = await open(join(target, 'brand.json'), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    try { if (!(await metadata.stat()).isFile()) throw new Error('Unknown Brand') } finally { await metadata.close() }
    return target
  }

  /** One bounded upload at a time, no overwrite, no filename-derived disk paths. */
  async import(root: string, filename: string, content: AsyncIterable<Uint8Array>, signal: AbortSignal):
  Promise<{ id: string; source: string; bytes: number }> {
    if (this.importing) throw new Error('A media import is already running')
    const extension = /\.(mp4|mov|webm|mkv|m4v)$/i.exec(filename)?.[1]?.toLowerCase()
    if (!extension || filename.length > 255 || /[/\\\x00-\x1f]/.test(filename)) throw new Error('Unsupported source name')
    if (this.reservedBytes + this.maxSourceBytes > this.maxRuntimeBytes) throw new Error('Media import quota reached')
    signal.throwIfAborted()
    this.importing = true
    this.reservedBytes += this.maxSourceBytes
    const id = randomUUID(), source = `assets/media-${id}.${extension}`
    let bytes = 0, complete = false
    const path = join(root, source), partial = path + '.partial'
    try {
      await mkdir(join(root, 'assets'), { recursive: true })
      if (await realpath(join(root, 'assets')) !== join(await realpath(root), 'assets')) throw new Error('Assets must not be symlinked')
      const file = await open(partial, 'wx', 0o600)
      const hash = createHash('sha256')
      try {
        for await (const chunk of content) {
          signal.throwIfAborted(); bytes += chunk.byteLength
          if (bytes > this.maxSourceBytes) throw new Error('Source exceeds import limit')
          hash.update(chunk)
          let offset = 0
          while (offset < chunk.length) offset += (await file.write(chunk, offset, chunk.length - offset)).bytesWritten
        }
        if (bytes === 0) throw new Error('Source is empty')
        signal.throwIfAborted()
        await file.sync()
      } finally { await file.close() }
      await rename(partial, path)
      this.sources.set(id, { id, root, source, bytes, hash: hash.digest('hex') })
      complete = true
      return { id, source, bytes }
    } finally {
      this.importing = false
      this.reservedBytes -= this.maxSourceBytes
      if (complete) this.reservedBytes += bytes
      else await rm(partial, { force: true }).catch(() => {})
    }
  }

  /** The source belongs to the selected Brand, not a path supplied by the renderer. */
  source(root: string, id: string): ImportedSource {
    const source = this.sources.get(id)
    if (!source || source.root !== root) throw new Error('Source not found')
    return { ...source }
  }

  /** Review returns a server revision; submission later uses only this id. */
  review(root: string, sourceId: string, clips: EditPlan['clips']): ReviewedRevision {
    const source = this.source(root, sourceId)
    const plan: EditPlan = { version: 1, source: source.source, clips: clips.map(clip => ({ ...clip })) }
    validateEditPlan(plan)
    if (this.revisions.size >= 100) throw new Error('Reviewed plan limit reached')
    const revision = { id: randomUUID(), sourceId, hash: source.hash, plan }
    this.revisions.set(revision.id, revision)
    return structuredClone(revision)
  }

  /** Consume once, fail closed across Host restart, verify immutable imported bytes again. */
  async consume(root: string, id: string, signal: AbortSignal): Promise<{ plan: EditPlan; sourceHash: string }> {
    const revision = this.revisions.get(id)
    if (!revision) throw new Error('Review this plan again')
    const source = this.source(root, revision.sourceId)
    this.revisions.delete(id)
    const file = await open(join(root, source.source), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    try {
      const info = await file.stat()
      if (!info.isFile() || info.size !== source.bytes) throw new Error('Source changed; import and review again')
      const hash = createHash('sha256'), buffer = Buffer.alloc(1024 * 1024)
      let offset = 0
      while (offset < info.size) {
        signal.throwIfAborted()
        const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length, info.size - offset), offset)
        if (!bytesRead) throw new Error('Source changed')
        hash.update(buffer.subarray(0, bytesRead)); offset += bytesRead
      }
      if (hash.digest('hex') !== revision.hash) throw new Error('Source changed; import and review again')
      return { plan: structuredClone(revision.plan), sourceHash: revision.hash }
    } finally { await file.close() }
  }
}
