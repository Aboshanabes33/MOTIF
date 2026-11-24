// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MediaRenderControls } from '../src/client/MediaRenderControls.tsx'
const plan = { version: 1 as const, source: 'assets/clip.mp4', clips: [{ start: 0, end: 1 }] }
const file = new File(['fixture'], 'clip.mp4', { type: 'video/mp4' })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
function response(value: unknown) { return new Response(JSON.stringify(value)) }
it('imports and submits only the matching reviewed server plan, then shows completed download', async () => {
  const request = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const path = String(input)
    if (path.includes('/readiness')) return response({ available: true })
    if (path.includes('/import')) return response({ id: 'source', source: 'assets/server.mp4' })
    if (path.includes('/review')) return response({ id: 'revision', sourceId: 'source', plan })
    if (path.includes('/start')) return response({ id: 'revision', state: 'running' })
    return response({ id: 'revision', state: 'completed' })
  })
  vi.stubGlobal('fetch', request)
  render(<MediaRenderControls brand="brand" file={file} plan={plan}/>)
  const start = screen.getByRole('button', { name: 'Import and render reviewed plan' }) as HTMLButtonElement
  await waitFor(() => { expect(start.disabled).toBe(false) }); fireEvent.click(start)
  await screen.findByText(/Render accepted/)
  expect(request.mock.calls.find(([url]) => String(url).includes('/start'))?.[1]?.body).toBe(JSON.stringify({ revision: 'revision' }))
  fireEvent.click(screen.getByRole('button', { name: 'Refresh render status' }))
  const download = await screen.findByRole('link', { name: 'Download verified MP4' })
  expect(download.getAttribute('href')).toBe('/motif-media/output?brand=brand&job=revision')
})
it('does not start when the server changes reviewed cuts', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ available: true }))
    .mockResolvedValueOnce(response({ id: 'source' }))
    .mockResolvedValueOnce(response({ id: 'revision', sourceId: 'source', plan: { ...plan, clips: [{ start: 0, end: 2 }] } }))
  vi.stubGlobal('fetch', request)
  render(<MediaRenderControls brand="brand" file={file} plan={plan}/>)
  const start = screen.getByRole('button', { name: 'Import and render reviewed plan' }) as HTMLButtonElement
  await waitFor(() => { expect(start.disabled).toBe(false) }); fireEvent.click(start)
  await screen.findByText(/Server plan differs/)
  expect(request.mock.calls.some(([url]) => String(url).includes('/start'))).toBe(false)
})
it('an edit during import invalidates execution even when a response arrives later', async () => {
  const pending = Promise.withResolvers<Response>()
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ available: true })).mockImplementation(() => pending.promise)
  vi.stubGlobal('fetch', request)
  const view = render(<MediaRenderControls brand="brand" file={file} plan={plan}/>)
  const start = screen.getByRole('button', { name: 'Import and render reviewed plan' }) as HTMLButtonElement
  await waitFor(() => { expect(start.disabled).toBe(false) }); fireEvent.click(start)
  await screen.findByText('Importing local video...')
  view.rerender(<MediaRenderControls brand="brand" file={file} plan={undefined}/>)
  pending.resolve(response({ id: 'source' }))
  await waitFor(() => { expect(request).toHaveBeenCalledTimes(2) })
  expect(request.mock.calls[1]?.[1]?.signal?.aborted).toBe(true)
})
