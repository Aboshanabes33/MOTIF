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

import { MediaProposalControls } from '../src/client/MediaProposalControls.tsx'
it('uses injected existing Session and requires explicit apply before any render', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ available: true, proposalAvailable: true }))
    .mockResolvedValueOnce(response({ id: 'source' })).mockResolvedValueOnce(response({ id: 'proposal', prompt: 'controlled Session prompt' }))
    .mockResolvedValueOnce(response({ state: 'ready', plan }))
  vi.stubGlobal('fetch', request)
  const send = vi.fn().mockResolvedValue({ ok: true, message: '' }), apply = vi.fn()
  render(<MediaProposalControls brand="brand" file={file} send={send} apply={apply}/>)
  fireEvent.change(screen.getByLabelText('Editing instructions'), { target: { value: 'Keep the opening second' } })
  const button = screen.getByRole('button', { name: 'Request proposal in existing Session' }) as HTMLButtonElement
  await waitFor(() => { expect(button.disabled).toBe(false) }); fireEvent.click(button)
  await screen.findByText(/Request admitted/)
  expect(send).toHaveBeenCalledWith('controlled Session prompt', expect.any(AbortSignal))
  fireEvent.click(screen.getByRole('button', { name: 'Check Session proposal' }))
  const accept = await screen.findByRole('button', { name: 'Apply proposed cuts for review' })
  expect(apply).not.toHaveBeenCalled(); fireEvent.click(accept)
  expect(apply).toHaveBeenCalledWith(plan.clips)
  expect(request.mock.calls.some(([url]) => String(url).includes('/start'))).toBe(false)
})
it('recovers completed Brand jobs after the controls remount without rerendering', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ available: true }))
    .mockResolvedValueOnce(response({ jobs: [{ id: 'saved', state: 'completed' }] }))
  vi.stubGlobal('fetch', request)
  render(<MediaRenderControls brand="brand" file={undefined} plan={undefined}/>)
  const history = screen.getByRole('button', { name: 'Load saved Brand jobs' }) as HTMLButtonElement
  await waitFor(() => { expect(history.disabled).toBe(false) }); fireEvent.click(history)
  fireEvent.click(await screen.findByRole('button', { name: 'saved: completed' }))
  expect(screen.getByRole('link', { name: 'Download verified MP4' }).getAttribute('href')).toBe('/motif-media/output?brand=brand&job=saved')
  expect(request.mock.calls.some(([url]) => String(url).includes('/start'))).toBe(false)
})
