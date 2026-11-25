// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { MotifSnapshot } from '@deepseek-ai/dsh-motif-core/types'
import type { MotifCopy } from '../src/client/locales.ts'
import type { MotifInjected } from '../src/client/MotifSection.tsx'
import { BrandsSection } from '../src/client/MotifSection.tsx'

afterEach(cleanup)

/** Key-identity translator that still echoes interpolated values. */
const t: NonNullable<MotifInjected['t']> = (key: MotifCopy, vars?: Readonly<Record<string, string | number>>) =>
  vars === undefined ? key : `${key} ${Object.values(vars).join(' ')}`

function snapshotWith(brandProblems: MotifSnapshot['brandProblems']): MotifSnapshot {
  return { brands: [], brandProblems, activity: [], connections: [] }
}

describe('BrandsSection brand problems', () => {
  it('surfaces corrupt and unreadable Brand folders with actionable copy', async () => {
    const snapshot = snapshotWith([
      { path: '/brands/broken', kind: 'corrupt', message: 'invalid json' },
      { path: '/brands/locked', kind: 'unreadable', message: 'EACCES' },
    ])
    render(<BrandsSection t={t} load={async () => snapshot} />)
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByText('brands.problems.title')).toBeTruthy()
    expect(screen.getByText('brands.problems.corrupt /brands/broken')).toBeTruthy()
    expect(screen.getByText('brands.problems.unreadable /brands/locked')).toBeTruthy()
  })

  it('shows no alert when every Brand folder reads cleanly', async () => {
    render(<BrandsSection t={t} load={async () => snapshotWith([])} />)
    await waitFor(() => expect(screen.getByText('brands.empty')).toBeTruthy())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('reloads from the problem row so a fixed folder comes back', async () => {
    const load = vi.fn()
      .mockResolvedValueOnce(snapshotWith([{ path: '/brands/broken', kind: 'corrupt', message: 'invalid json' }]))
      .mockResolvedValueOnce(snapshotWith([]))
    render(<BrandsSection t={t} load={load} />)
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'brands.problems.reload' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(load).toHaveBeenCalledTimes(2)
  })
})
