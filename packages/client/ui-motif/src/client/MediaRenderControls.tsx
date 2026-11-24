import { useEffect, useMemo, useRef, useState } from 'react'
import { mediaClient, type MediaStatus } from './media-client.ts'
import type { ReviewedMediaPlan } from './MediaWorkbench.tsx'
import styles from './MotifSection.module.css'
/** Explicit local-owner controls. The server verification gate decides availability. */
export function MediaRenderControls({ brand, file, plan }: { brand: string; file: File | undefined; plan: ReviewedMediaPlan | undefined }) {
  const client = useMemo(() => mediaClient(brand), [brand])
  const [available, setAvailable] = useState(false)
  const [message, setMessage] = useState('Checking local renderer readiness...')
  const [job, setJob] = useState<MediaStatus>()
  const [history, setHistory] = useState<MediaStatus[]>([])
  const [busy, setBusy] = useState(false)
  const operation = useRef<AbortController>()
  useEffect(() => {
    const controller = new AbortController()
    void client.readiness(controller.signal).then((result) => {
      setAvailable(result.available); setMessage(result.reason ?? 'Local renderer ready.')
    }).catch(() => { if (!controller.signal.aborted) setMessage('Local renderer unavailable. No upload or render has started.') })
    return () => { controller.abort(); operation.current?.abort() }
  }, [client])
  useEffect(() => {
    return () => { operation.current?.abort() }
  }, [file, plan])
  async function start() {
    if (!available || !file || !plan || busy) return
    const controller = new AbortController(); operation.current = controller
    setBusy(true)
    try {
      setMessage('Importing local video...')
      const imported = await client.import(file, controller.signal)
      controller.signal.throwIfAborted()
      const revision = await client.review(imported.id, plan.clips, controller.signal)
      // The source path is the server's imported handle, never the local filename in the plan JSON.
      if (revision.sourceId !== imported.id || revision.plan.clips.length !== plan.clips.length
        || JSON.stringify(revision.plan.clips) !== JSON.stringify(plan.clips)) throw new Error('Server plan differs. Review again before rendering.')
      controller.signal.throwIfAborted()
      setMessage('Starting reviewed render...')
      const status = await client.start(revision.id, controller.signal)
      controller.signal.throwIfAborted()
      setJob(status); setMessage('Render accepted. Refresh status to follow progress.')
    } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Render failed.') }
    finally { setBusy(false) }
  }
  async function refresh() {
    if (!job) return
    const controller = new AbortController(); operation.current = controller
    setBusy(true)
    try { const status = await client.status(job.id, controller.signal); controller.signal.throwIfAborted(); setJob(status); setMessage(`Render ${status.state}${status.stage ? ': ' + status.stage : ''}.`) }
    catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Status unavailable.') }
    finally { setBusy(false) }
  }
  async function recover() {
    const controller = new AbortController(); operation.current = controller; setBusy(true)
    try {
      const result = await client.history(controller.signal); controller.signal.throwIfAborted()
      setHistory(result.jobs); setMessage(result.jobs.length ? 'Choose a saved job to inspect its status.' : 'No saved jobs for this Brand.')
    } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'History unavailable.') }
    finally { setBusy(false) }
  }
  async function cancel() {
    if (!job) return
    const controller = new AbortController(); operation.current = controller
    setBusy(true)
    try { await client.cancel(job.id, controller.signal); controller.signal.throwIfAborted(); setMessage('Cancellation requested. Refresh until cancellation is confirmed.') }
    catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Cancellation not confirmed.') }
    finally { setBusy(false) }
  }
  const active = job !== undefined && ['running', 'cancelling'].includes(job.state)
  return <section aria-label="Local video renderer"><h4>Local video renderer</h4><p role="status">{message}</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <button type="button" className={styles.primary} disabled={!available || !file || !plan || busy || active} onClick={() => { void start() }}>Import and render reviewed plan</button>
      <button type="button" className={styles.secondary} disabled={!available || busy} onClick={() => { void recover() }}>Load saved Brand jobs</button>
      {job && <button type="button" className={styles.secondary} disabled={busy} onClick={() => { void refresh() }}>Refresh render status</button>}
      {active && <button type="button" className={styles.secondary} disabled={busy} onClick={() => { void cancel() }}>Cancel render</button>}
      {job?.state === 'completed' && <a style={{ color: '#ff9b7f' }} href={client.output(job.id)} download="motif-output.mp4">Download verified MP4</a>}
    </div>
    {history.length > 0 && <ul>{history.map(record => <li key={record.id}>
      <button type="button" disabled={busy} onClick={() => { setJob(record); setMessage(`Saved job ${record.state}. Refresh for current status.`) }}>{record.id}: {record.state}</button>
    </li>)}</ul>}
    <p>Rendering only becomes available after real local-tool and transport verification.
      Load saved Brand jobs after refreshing. Restarting the Host interrupts running jobs
      and invalidates imported handles and reviewed revisions.</p>
  </section>
}
