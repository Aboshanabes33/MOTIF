// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { MotifConnection, MotifSnapshot } from '@deepseek-ai/dsh-motif-core/types'
import type { MotifCopy } from '../src/client/locales.ts'
import type { MotifInjected } from '../src/client/MotifSection.tsx'
import { AiSection } from '../src/client/MotifSection.tsx'

afterEach(cleanup)

const t: NonNullable<MotifInjected['t']> = (key: MotifCopy) => key

function snapshotWith(connections: MotifConnection[]): MotifSnapshot {
  return { brands: [], brandProblems: [], activity: [], connections }
}

const NOT_INSTALLED: MotifConnection = {
  backend: 'claude-code', label: 'Claude Code', installed: false, signedIn: 'no', detail: '',
}
const INSTALLED_SIGNED_OUT: MotifConnection = {
  backend: 'claude-code', label: 'Claude Code', installed: true, signedIn: 'no', detail: '',
}

describe('AiSection connection lifecycle', () => {
  it('runs install for a missing tool and shows the outcome message', async () => {
    const install = vi.fn(async () => ({ ok: true, message: 'Claude Code is installed. The next step is sign-in.' }))
    render(<AiSection t={t} load={async () => snapshotWith([NOT_INSTALLED])} install={install} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'ai.install' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'ai.install' }))
    await waitFor(() => expect(screen.getByText('Claude Code is installed. The next step is sign-in.')).toBeTruthy())
    expect(install).toHaveBeenCalledWith('claude-code')
  })

  it('offers sign-in only when the tool is installed but not signed in', async () => {
    const signIn = vi.fn(async () => ({ ok: false, message: 'Could not start sign-in. Run `claude login` in a terminal.' }))
    render(<AiSection t={t} load={async () => snapshotWith([INSTALLED_SIGNED_OUT])} signIn={signIn} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'ai.signIn' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'ai.signIn' }))
    await waitFor(() => expect(screen.getByText(/Could not start sign-in/)).toBeTruthy())
    expect(signIn).toHaveBeenCalledWith('claude-code')
  })

  it('runs the test action for an installed tool and shows the reply', async () => {
    const test = vi.fn(async () => ({ ok: true, message: 'Test request passed: OK' }))
    render(<AiSection t={t} load={async () => snapshotWith([INSTALLED_SIGNED_OUT])} test={test} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'ai.test' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'ai.test' }))
    await waitFor(() => expect(screen.getByText('Test request passed: OK')).toBeTruthy())
  })

  it('shows the error state when the snapshot read fails', async () => {
    render(<AiSection t={t} load={async () => { throw new Error('remote down') }} />)
    await waitFor(() => expect(screen.getByText('ai.noneActive')).toBeTruthy())
  })

  it('surfaces a thrown action error instead of hanging busy', async () => {
    const test = vi.fn(async () => { throw new Error('Test request failed: EOF') })
    render(<AiSection t={t} load={async () => snapshotWith([INSTALLED_SIGNED_OUT])} test={test} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'ai.test' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'ai.test' }))
    await waitFor(() => expect(screen.getByText('Test request failed: EOF')).toBeTruthy())
    expect(screen.getByRole('button', { name: 'ai.test' })).toHaveProperty('disabled', false)
  })
})
