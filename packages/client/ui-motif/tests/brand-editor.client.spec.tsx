// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { MotifBrand, MotifTimelineEntry } from '@deepseek-ai/dsh-motif-core/types'
import type { MotifCopy } from '../src/client/locales.ts'
import type { MotifInjected } from '../src/client/MotifSection.tsx'
import { BrandEditor } from '../src/client/MotifSection.tsx'

afterEach(cleanup)

/** Key-identity translator: specs assert on copy keys, not phrasing. */
const t: NonNullable<MotifInjected['t']> = (key: MotifCopy) => key

function makeBrand(overrides: Partial<MotifBrand> = {}): MotifBrand {
  return {
    id: 'acme',
    workspaceId: 'ws-1',
    name: 'Acme',
    path: '/brands/acme',
    identity: {
      primary: '#0F5C4B',
      accent: '#E8C57C',
      light: '#F7F4EC',
      dark: '#141414',
      latinFont: 'Space Grotesk',
      arabicFont: 'IBM Plex Sans Arabic',
      motion: 'soft',
      caption: 'word',
    },
    updatedAt: '2026-11-20T10:00:00.000Z',
    videoCount: 0,
    ...overrides,
  }
}

const TIMELINE: readonly MotifTimelineEntry[] = [
  { name: '002-cut.md', bytes: 2048, updatedAt: '2026-11-21T09:00:00.000Z' },
  { name: '001-brief.md', bytes: 512, updatedAt: '2026-11-20T09:00:00.000Z' },
]

function typeDraft(text: string): void {
  fireEvent.change(screen.getByLabelText('editor.editRequest'), { target: { value: text } })
}

describe('BrandEditor', () => {
  it('renders the real Brand identity without the prototype transport or demo lanes', async () => {
    render(<BrandEditor brand={makeBrand()} t={t} onClose={() => {}}
      loadTimeline={async () => TIMELINE} sendEditRequest={async () => ({ ok: true, message: '' })} />)
    expect(screen.getByRole('dialog', { name: 'Acme' })).toBeTruthy()
    // The prototype scrubber and hard-coded lane clips are gone.
    expect(screen.queryByText('0:13')).toBeNull()
    expect(screen.queryByText('0:22')).toBeNull()
    expect(document.querySelector('input[type="range"]')).toBeNull()
    // The preview shows the Brand's own name in both fonts, not placeholder copy.
    expect(screen.getAllByText('Acme').length).toBeGreaterThanOrEqual(2)
    await waitFor(() => expect(screen.getByText('002-cut.md')).toBeTruthy())
    expect(screen.getByText('001-brief.md')).toBeTruthy()
  })

  it('keeps Export disabled with an explanation instead of a dead control', () => {
    render(<BrandEditor brand={makeBrand()} t={t} onClose={() => {}}
      loadTimeline={async () => []} sendEditRequest={async () => ({ ok: true, message: '' })} />)
    const button = screen.getByRole('button', { name: 'editor.export' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.getByText('editor.exportUnavailable')).toBeTruthy()
  })

  it('submits the composer to the injected session flow and reports success', async () => {
    const sent: string[] = []
    const reloads: number[] = []
    render(<BrandEditor brand={makeBrand()} t={t} onClose={() => {}}
      loadTimeline={async () => { reloads.push(1); return TIMELINE }}
      sendEditRequest={async (_brand: MotifBrand, text: string) => { sent.push(text); return { ok: true, message: '' } }} />)
    typeDraft('Make the intro two seconds shorter')
    fireEvent.click(screen.getByRole('button', { name: 'editor.send' }))
    await waitFor(() => expect(screen.getByText('editor.state.sent')).toBeTruthy())
    expect(sent).toEqual(['Make the intro two seconds shorter'])
    expect(screen.getByText('Make the intro two seconds shorter')).toBeTruthy()
    // A successful send reloads the timeline so persisted results appear.
    await waitFor(() => expect(reloads.length).toBeGreaterThanOrEqual(2))
  })

  it('surfaces a failure with the host message when the send rejects', async () => {
    render(<BrandEditor brand={makeBrand()} t={t} onClose={() => {}}
      loadTimeline={async () => []}
      sendEditRequest={async () => ({ ok: false, message: 'No AI connected' })} />)
    typeDraft('Trim the outro')
    fireEvent.click(screen.getByRole('button', { name: 'editor.send' }))
    await waitFor(() => expect(screen.getByText('editor.state.failed')).toBeTruthy())
    expect(screen.getByText('No AI connected')).toBeTruthy()
  })

  it('cancels an in-flight send through the abort signal', async () => {
    let observedSignal: AbortSignal | undefined
    render(<BrandEditor brand={makeBrand()} t={t} onClose={() => {}}
      loadTimeline={async () => []}
      sendEditRequest={(_brand: MotifBrand, _text: string, signal: AbortSignal) => {
        observedSignal = signal
        return new Promise(() => {})
      }} />)
    typeDraft('Swap the music')
    fireEvent.click(screen.getByRole('button', { name: 'editor.send' }))
    const cancel = await screen.findByRole('button', { name: 'editor.cancel' })
    expect(observedSignal?.aborted).toBe(false)
    fireEvent.click(cancel)
    expect(observedSignal?.aborted).toBe(true)
  })

  it('disables the composer with an explanation when no session flow is injected', () => {
    render(<BrandEditor brand={makeBrand()} t={t} onClose={() => {}} loadTimeline={async () => []} />)
    const input = screen.getByLabelText('editor.editRequest') as HTMLInputElement
    expect(input.disabled).toBe(true)
    expect(screen.getByText('editor.sendUnavailable')).toBeTruthy()
    expect(screen.getByText('editor.unavailable')).toBeTruthy()
  })

  it('disables the composer for a Brand without a registered workspace', () => {
    render(<BrandEditor brand={makeBrand({ workspaceId: undefined })} t={t} onClose={() => {}}
      loadTimeline={async () => []} sendEditRequest={async () => ({ ok: true, message: '' })} />)
    const input = screen.getByLabelText('editor.editRequest') as HTMLInputElement
    expect(input.disabled).toBe(true)
    expect(screen.getByText('editor.sendUnavailable')).toBeTruthy()
  })

  it('shows an honest empty state when the timeline folder has no files', async () => {
    render(<BrandEditor brand={makeBrand()} t={t} onClose={() => {}}
      loadTimeline={async () => []} sendEditRequest={async () => ({ ok: true, message: '' })} />)
    await waitFor(() => expect(screen.getByText('editor.timelineEmpty')).toBeTruthy())
  })

  it('shows an honest failure state when the timeline cannot be read', async () => {
    render(<BrandEditor brand={makeBrand()} t={t} onClose={() => {}}
      loadTimeline={async () => { throw new Error('disk gone') }}
      sendEditRequest={async () => ({ ok: true, message: '' })} />)
    await waitFor(() => expect(screen.getByText('editor.timelineFailed')).toBeTruthy())
  })

  it('shows an honest failure state when no timeline reader is injected', () => {
    render(<BrandEditor brand={makeBrand()} t={t} onClose={() => {}}
      sendEditRequest={async () => ({ ok: true, message: '' })} />)
    expect(screen.getByText('editor.timelineFailed')).toBeTruthy()
  })

  it('closes through the back button', () => {
    const onClose = vi.fn()
    render(<BrandEditor brand={makeBrand()} t={t} onClose={onClose}
      loadTimeline={async () => []} sendEditRequest={async () => ({ ok: true, message: '' })} />)
    fireEvent.click(screen.getByRole('button', { name: /editor\.back/ }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not submit an empty draft', async () => {
    const send = vi.fn(async () => ({ ok: true, message: '' }))
    render(<BrandEditor brand={makeBrand()} t={t} onClose={() => {}}
      loadTimeline={async () => []} sendEditRequest={send} />)
    const button = screen.getByRole('button', { name: 'editor.send' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    await act(async () => { fireEvent.click(button) })
    expect(send).not.toHaveBeenCalled()
  })
})
