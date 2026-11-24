/** Same-origin owner transport; never accepts an arbitrary API origin or bearer token. */
import type { ReviewedMediaPlan } from './MediaWorkbench.tsx'
export interface ImportedMedia { id: string; source: string; bytes: number }
export interface ServerMediaRevision { id: string; sourceId: string; plan: ReviewedMediaPlan }
export interface MediaStatus { id: string; state: string; stage?: string }
export function mediaClient(brand: string, request: typeof fetch = fetch) {
  const url = (operation: string, extra: Record<string, string> = {}) => '/motif-media/' + operation + '?' + new URLSearchParams({ brand, ...extra }).toString()
  async function json<T>(operation: string, method: 'GET' | 'POST', value?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await request(url(operation), { method, credentials: 'same-origin', ...(signal ? { signal } : {}),
      ...(value === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }) })
    if (!response.ok) throw new Error('Media operation unavailable or refused. Refresh status before retrying.')
    return await response.json() as T
  }
  return {
    readiness: (signal?: AbortSignal) => json<{ available: boolean; reason?: string }>('readiness', 'GET', undefined, signal),
    async import(file: File, signal: AbortSignal): Promise<ImportedMedia> {
      const response = await request(url('import', { name: file.name }), { method: 'POST', body: file, credentials: 'same-origin', signal })
      if (!response.ok) throw new Error('Media import failed or unavailable.')
      return await response.json() as ImportedMedia
    },
    review: (sourceId: string, clips: ReviewedMediaPlan['clips'], signal: AbortSignal) => json<ServerMediaRevision>('review', 'POST', { sourceId, clips }, signal),
    start: (revision: string, signal: AbortSignal) => json<MediaStatus>('start', 'POST', { revision }, signal),
    async status(job: string, signal: AbortSignal): Promise<MediaStatus> {
      const response = await request(url('status', { job }), { credentials: 'same-origin', signal })
      if (!response.ok) throw new Error('Media status unavailable.')
      return await response.json() as MediaStatus
    },
    async cancel(job: string, signal: AbortSignal): Promise<void> {
      const response = await request(url('cancel', { job }), { method: 'POST', credentials: 'same-origin', signal })
      if (!response.ok) throw new Error('Cancellation not confirmed. Check status before leaving.')
    },
    output: (job: string) => url('output', { job }),
  }
}
