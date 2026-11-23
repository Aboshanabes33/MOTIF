// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { MotifSnapshot } from '@deepseek-ai/dsh-motif-core/types'
import type { MotifCopy } from '../src/client/locales.ts'
import type { MotifInjected } from '../src/client/MotifSection.tsx'
import { MotifOnboarding } from '../src/client/MotifSection.tsx'

afterEach(cleanup)

const t: NonNullable<MotifInjected['t']> = (key: MotifCopy, vars?: Readonly<Record<string, string | number>>) =>
  vars === undefined ? key : `${key} ${Object.values(vars).join('/')}`

function snapshot(signedIn: ('yes' | 'no' | 'unknown')[]): MotifSnapshot {
  return {
    brands: [],
    connections: signedIn.map((state, index) => ({
      backend: index === 0 ? 'claude-code' : 'codex',
      label: index === 0 ? 'Claude Code' : 'Codex',
      installed: true,
      signedIn: state,
      detail: '',
    })),
  }
}

describe('MotifOnboarding', () => {
  it('counts only signed-in backends as ready', async () => {
    render(<MotifOnboarding t={t} load={async () => snapshot(['yes', 'no'])} />)
    await waitFor(() => expect(screen.getByText('onboarding.ready 1/2')).toBeTruthy())
  })

  it('treats an empty connection read as zero of two', async () => {
    render(<MotifOnboarding t={t} load={async () => snapshot([])} />)
    await waitFor(() => expect(screen.getByText('onboarding.ready 0/2')).toBeTruthy())
  })

  it('Set up navigates to the AI section and completes the step', async () => {
    const complete = vi.fn()
    const openSection = vi.fn()
    render(<MotifOnboarding t={t} load={async () => snapshot(['no', 'no'])} complete={complete} openSection={openSection} />)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.setup' }))
    expect(openSection).toHaveBeenCalledWith('motif-ai')
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('Later completes without navigating, so a dismissed welcome never blocks', async () => {
    const complete = vi.fn()
    const openSection = vi.fn()
    render(<MotifOnboarding t={t} load={async () => snapshot(['no', 'no'])} complete={complete} openSection={openSection} />)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.later' }))
    expect(complete).toHaveBeenCalledTimes(1)
    expect(openSection).not.toHaveBeenCalled()
  })
})
