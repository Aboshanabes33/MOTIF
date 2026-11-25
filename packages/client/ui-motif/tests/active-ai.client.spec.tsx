// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { MotifConnection, MotifSnapshot } from '@deepseek-ai/dsh-motif-core/types'
import type { MotifCopy } from '../src/client/locales.ts'
import type { MotifInjected } from '../src/client/MotifSection.tsx'
import { AiSection, MotifHome } from '../src/client/MotifSection.tsx'

afterEach(cleanup)

/** Key-identity translator that still echoes interpolated values. */
const t: NonNullable<MotifInjected['t']> = (key: MotifCopy, vars?: Readonly<Record<string, string | number>>) =>
  vars === undefined ? key : `${key} ${Object.values(vars).join(' ')}`

const CONNECTIONS: MotifConnection[] = [
  { backend: 'claude-code', label: 'Claude Code', installed: true, signedIn: 'yes', detail: '' },
  { backend: 'codex', label: 'Codex', installed: true, signedIn: 'no', detail: '' },
]

function snapshot(activity: MotifSnapshot['activity'], connections = CONNECTIONS): MotifSnapshot {
  return { brands: [], brandProblems: [], connections, activity }
}

describe('AiSection active indicators', () => {
  it('shows the running backend, not the first signed-in one', async () => {
    const snap = snapshot([
      { backend: 'codex', model: 'relay-codex', state: 'running', at: '2026-11-23T08:00:00.000Z' },
    ])
    render(<AiSection t={t} load={async () => snap} />)
    await waitFor(() => expect(screen.getByText('ai.running Codex')).toBeTruthy())
    expect(screen.getAllByText('ai.pillRunning')).toHaveLength(1)
  })

  it('shows the last selected model when nothing is running', async () => {
    const snap = snapshot([
      { backend: 'claude-code', model: 'relay-claude', state: 'finished', at: '2026-11-23T08:00:00.000Z' },
    ])
    render(<AiSection t={t} load={async () => snap} />)
    await waitFor(() => expect(screen.getByText('ai.pillSelected relay-claude')).toBeTruthy())
    expect(screen.getByText(/ai\.active/)).toBeTruthy()
  })

  it('shows nothing active when disconnected and unused', async () => {
    render(<AiSection t={t} load={async () => snapshot([])} />)
    await waitFor(() => expect(screen.getByText('ai.noneActive')).toBeTruthy())
    expect(screen.queryByText('ai.pillRunning')).toBeNull()
  })

  it('follows a changed selection across refreshes', async () => {
    let snap = snapshot([
      { backend: 'claude-code', model: 'relay-claude', state: 'finished', at: '2026-11-23T08:00:00.000Z' },
    ])
    const view = render(<AiSection t={t} load={async () => snap} />)
    await waitFor(() => expect(screen.getByText('ai.pillSelected relay-claude')).toBeTruthy())
    snap = snapshot([
      { backend: 'codex', model: 'relay-codex', state: 'finished', at: '2026-11-23T08:05:00.000Z' },
      { backend: 'claude-code', model: 'relay-claude', state: 'finished', at: '2026-11-23T08:00:00.000Z' },
    ])
    view.unmount()
    render(<AiSection t={t} load={async () => snap} />)
    await waitFor(() => expect(screen.getByText('ai.pillSelected relay-codex')).toBeTruthy())
    expect(screen.getByText(/ai\.active.*relay-codex/)).toBeTruthy()
  })
})

describe('MotifHome status line', () => {
  it('never hard-codes a backend: unused home shows the honest empty state', async () => {
    render(<MotifHome t={t} load={async () => snapshot([])} />)
    await waitFor(() => expect(screen.getAllByText('ai.noneActive').length).toBeGreaterThanOrEqual(1))
    expect(screen.queryByText(/Claude Code/)).toBeNull()
  })

  it('shows the running model when a send is in flight', async () => {
    const snap = snapshot([
      { backend: 'codex', model: 'relay-codex', state: 'running', at: '2026-11-23T08:00:00.000Z' },
    ])
    render(<MotifHome t={t} load={async () => snap} />)
    await waitFor(() => expect(screen.getByText('editor.aiRunning relay-codex')).toBeTruthy())
  })
})
