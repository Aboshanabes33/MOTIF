/** Internal Host job ownership for reviewed media plans. Not a Remote API. */
import { renderEdit, type EditPlan, type MediaStage, type MediaTools, type ProcessRunner } from './media-pipeline.ts'

/** Snapshot of one local runtime job. Callers receive copies, never controllers. */
export interface MediaJobStatus {
  readonly id: string
  readonly state: MediaStage | 'queued'
}

/** One job per Brand and a fixed runtime-wide concurrency cap. */
export class MediaJobs {
  private readonly active = new Map<string, { controller: AbortController; state: MediaStage | 'queued' }>()
  private disposed = false
  private readonly pending = new Set<Promise<void>>()

  constructor(private readonly concurrency = 1) {
    if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new Error('Invalid media concurrency')
  }

  /** No auth claim: only trusted Host code may instantiate and call this class. */
  status(brand: string): MediaJobStatus | undefined {
    const job = this.active.get(brand)
    return job === undefined ? undefined : { id: brand, state: job.state }
  }

  /** Cancel only the selected Brand's local run. Account authorization belongs to the eventual carrier. */
  cancel(brand: string): void { this.active.get(brand)?.controller.abort() }

  /** Reject excess work instead of silently starting or queuing unbounded renders. */
  async start(brand: string, root: string, plan: EditPlan, options: {
    tools: MediaTools
    run: ProcessRunner
    signal: AbortSignal
    timeoutMs?: number
    sourceHash?: string
    maxBytes?: number
  }) {
    if (this.disposed) throw new Error('Media runtime is closed')
    if (this.active.has(brand)) throw new Error('This Brand already has a media job')
    if (this.active.size >= this.concurrency) throw new Error('Media runtime is busy; retry after the active job finishes')
    options.signal.throwIfAborted()
    const controller = new AbortController()
    const job: { controller: AbortController; state: MediaStage | 'queued' } = { controller, state: 'queued' }
    this.active.set(brand, job)
    let settled: (() => void) | undefined
    const done = new Promise<void>((resolve) => { settled = resolve })
    this.pending.add(done)
    try {
      return await renderEdit(root, plan, {
        ...options,
        signal: AbortSignal.any([options.signal, controller.signal]),
        onStage: (state) => { job.state = state },
      })
    } finally {
      this.active.delete(brand)
      this.pending.delete(done)
      settled?.()
    }
  }

  /** Abort active work on Host shutdown. Use drain to await actual process teardown. */
  dispose(): void {
    this.disposed = true
    for (const job of this.active.values()) job.controller.abort()
  }
  /** Abort and wait for every in-flight render and runner cleanup before shutdown completes. */
  async drain(): Promise<void> {
    this.dispose()
    await Promise.all([...this.pending])
  }
}

/** Unverified flows stay disabled, independently of whether binaries happen to exist. */
export const MEDIA_EDITOR_READINESS = Object.freeze({
  available: false as const,
  reason: 'Media editing is not ready: constrained Session proposals, speech selection, full shell/desktop acceptance and deployment provisioning remain unverified.',
})
