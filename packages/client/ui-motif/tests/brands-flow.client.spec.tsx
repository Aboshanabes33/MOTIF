// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { MotifBrand, MotifSnapshot } from '@deepseek-ai/dsh-motif-core/types'
import type { MotifCopy } from '../src/client/locales.ts'
import type { MotifInjected } from '../src/client/MotifSection.tsx'
import { BrandsSection } from '../src/client/MotifSection.tsx'

afterEach(cleanup)

const t: NonNullable<MotifInjected['t']> = (key: MotifCopy) => key

function makeBrand(overrides: Partial<MotifBrand> = {}): MotifBrand {
  return {
    id: 'acme',
    workspaceId: 'ws-1',
    name: 'Acme',
    path: '/brands/acme',
    identity: {
      primary: '#0F5C4B', accent: '#E8C57C', light: '#F7F4EC', dark: '#141414',
      latinFont: 'Space Grotesk', arabicFont: 'IBM Plex Sans Arabic', motion: 'soft', caption: 'word',
    },
    updatedAt: '2026-11-20T10:00:00.000Z',
    videoCount: 0,
    ...overrides,
  }
}

function snap(brands: MotifBrand[]): MotifSnapshot {
  return { brands, connections: [] }
}

describe('BrandsSection states and navigation', () => {
  it('shows the empty state with creation modes when there are no Brands', async () => {
    render(<BrandsSection t={t} load={async () => snap([])} />)
    await waitFor(() => expect(screen.getByText('brands.empty')).toBeTruthy())
    expect(screen.getByText('brands.manually')).toBeTruthy()
    expect(screen.getByText('brands.fromWebsite')).toBeTruthy()
    expect(screen.getByText('brands.fromVideo')).toBeTruthy()
  })

  it('shows the error state when the snapshot read fails', async () => {
    render(<BrandsSection t={t} load={async () => { throw new Error('remote down') }} />)
    await waitFor(() => expect(screen.getByText('brands.failed')).toBeTruthy())
  })

  it('filters Brands by the search box', async () => {
    render(<BrandsSection t={t} load={async () => snap([makeBrand(), makeBrand({ id: 'qahwa', name: 'Qahwa', path: '/brands/qahwa' })])} />)
    await waitFor(() => expect(screen.getAllByText('Acme').length).toBeGreaterThan(0))
    fireEvent.change(screen.getByLabelText('brands.search'), { target: { value: 'qah' } })
    expect(screen.queryByText('Acme')).toBeNull()
    expect(screen.getAllByText('Qahwa').length).toBeGreaterThan(0)
  })

  it('disables Open for a Brand without a workspace and opens one that has it', async () => {
    const openBrand = vi.fn()
    render(<BrandsSection t={t} load={async () => snap([makeBrand(), makeBrand({ id: 'loose', name: 'Loose', path: '/brands/loose', workspaceId: undefined })])} openBrand={openBrand} />)
    await waitFor(() => expect(screen.getAllByText('Acme').length).toBeGreaterThan(0))
    const buttons = screen.getAllByRole('button', { name: 'brands.open' })
    expect(buttons).toHaveLength(2)
    const [first, second] = buttons as [HTMLElement, HTMLElement]
    expect(first).toHaveProperty('disabled', false)
    expect(second).toHaveProperty('disabled', true)
    fireEvent.click(first)
    expect(openBrand).toHaveBeenCalledWith('ws-1')
  })

  it('creates a Brand through the form and opens its workspace', async () => {
    const createBrand = vi.fn(async () => ({ workspaceId: 'ws-9' }))
    const openBrand = vi.fn()
    render(<BrandsSection t={t} load={async () => snap([])} createBrand={createBrand} openBrand={openBrand} />)
    await waitFor(() => expect(screen.getByText('brands.empty')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '+ brands.new' }))
    fireEvent.change(screen.getByPlaceholderText('brand.form.namePlaceholder'), { target: { value: 'Nakheel' } })
    fireEvent.click(screen.getByRole('button', { name: 'brand.form.save' }))
    await waitFor(() => expect(createBrand).toHaveBeenCalled())
    expect(createBrand.mock.calls[0]?.[0]).toMatchObject({ name: 'Nakheel' })
    await waitFor(() => expect(openBrand).toHaveBeenCalledWith('ws-9'))
  })

  it('keeps the form open with the failure message when creation is rejected (e.g. duplicate)', async () => {
    const createBrand = vi.fn(async () => { throw new Error('A Brand named "Acme" already exists') })
    render(<BrandsSection t={t} load={async () => snap([])} createBrand={createBrand} />)
    await waitFor(() => expect(screen.getByText('brands.empty')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '+ brands.new' }))
    fireEvent.change(screen.getByPlaceholderText('brand.form.namePlaceholder'), { target: { value: 'Acme' } })
    fireEvent.click(screen.getByRole('button', { name: 'brand.form.save' }))
    await waitFor(() => expect(screen.getByText('A Brand named "Acme" already exists')).toBeTruthy())
    // Still on the form: the save button is back to its ready label.
    expect(screen.getByRole('button', { name: 'brand.form.save' })).toBeTruthy()
  })

  it('requires a name before saving', async () => {
    const createBrand = vi.fn(async () => ({ workspaceId: 'ws-9' }))
    render(<BrandsSection t={t} load={async () => snap([])} createBrand={createBrand} />)
    await waitFor(() => expect(screen.getByText('brands.empty')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '+ brands.new' }))
    fireEvent.click(screen.getByRole('button', { name: 'brand.form.save' }))
    await waitFor(() => expect(screen.getByText('brand.form.required')).toBeTruthy())
    expect(createBrand).not.toHaveBeenCalled()
  })

  it('each creation-mode card opens the creation form', async () => {
    render(<BrandsSection t={t} load={async () => snap([])} />)
    await waitFor(() => expect(screen.getByText('brands.empty')).toBeTruthy())
    for (const mode of ['brands.manually', 'brands.fromWebsite', 'brands.fromVideo']) {
      fireEvent.click(screen.getByText(mode))
      await waitFor(() => expect(screen.getByText('brand.form.title')).toBeTruthy())
      fireEvent.click(screen.getByRole('button', { name: '← brand.form.back' }))
      await waitFor(() => expect(screen.getByText('brands.empty')).toBeTruthy())
    }
  })
})
