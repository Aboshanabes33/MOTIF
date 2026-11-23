// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { MotifWebsiteSuggestion } from '@deepseek-ai/dsh-motif-core/types'
import type { MotifCopy } from '../src/client/locales.ts'
import type { MotifInjected } from '../src/client/MotifSection.tsx'
import { BrandsSection } from '../src/client/MotifSection.tsx'

afterEach(cleanup)

/** Key-identity translator: specs assert on copy keys, not phrasing. */
const t: NonNullable<MotifInjected['t']> = (key: MotifCopy) => key

const EMPTY_SNAPSHOT = { brands: [], connections: [] }

const SUGGESTION: MotifWebsiteSuggestion = {
  name: 'Example',
  identity: {
    primary: '#1F6F8B',
    accent: '#F2A154',
    light: '#F7F4EC',
    dark: '#141414',
    latinFont: 'Space Grotesk',
    arabicFont: 'IBM Plex Sans Arabic',
    motion: 'soft',
    caption: 'word',
  },
  source: 'https://example.com',
}

function renderBrands(overrides: Partial<MotifInjected> = {}) {
  const createBrand = vi.fn(async () => ({ workspaceId: 'ws-new' }))
  const analyzeWebsite = vi.fn(async (_url: string, _signal: AbortSignal) => SUGGESTION)
  const openBrand = vi.fn()
  render(
    <BrandsSection
      t={t}
      load={async () => EMPTY_SNAPSHOT}
      createBrand={createBrand}
      openBrand={openBrand}
      analyzeWebsite={analyzeWebsite}
      {...overrides}
    />,
  )
  return { createBrand, analyzeWebsite, openBrand }
}

describe('BrandsSection creation flows', () => {
  it('the manual card opens the empty creation form', async () => {
    renderBrands()
    fireEvent.click(screen.getByText('brands.manually'))
    expect(await screen.findByText('brand.form.title')).toBeTruthy()
    const nameInput = screen.getByPlaceholderText('brand.form.namePlaceholder') as HTMLInputElement
    expect(nameInput.value).toBe('')
  })

  it('the website card opens the URL panel', async () => {
    renderBrands()
    fireEvent.click(screen.getByText('brands.fromWebsite'))
    expect(await screen.findByPlaceholderText('brand.form.websitePlaceholder')).toBeTruthy()
    expect(screen.getByText('brands.flow.website.action')).toBeTruthy()
  })

  it('rejects a malformed address without calling the host', async () => {
    const { analyzeWebsite } = renderBrands()
    fireEvent.click(screen.getByText('brands.fromWebsite'))
    const input = await screen.findByPlaceholderText('brand.form.websitePlaceholder')
    fireEvent.change(input, { target: { value: 'not-a-url' } })
    fireEvent.submit(input.closest('form')!)
    expect(await screen.findByText('brands.flow.website.invalid')).toBeTruthy()
    expect(analyzeWebsite).not.toHaveBeenCalled()
  })

  it('a successful analysis opens the form prefilled with the suggestion', async () => {
    renderBrands()
    fireEvent.click(screen.getByText('brands.fromWebsite'))
    const input = await screen.findByPlaceholderText('brand.form.websitePlaceholder')
    fireEvent.change(input, { target: { value: 'https://example.com' } })
    fireEvent.submit(input.closest('form')!)
    expect(await screen.findByText('brand.form.title')).toBeTruthy()
    const nameInput = screen.getByPlaceholderText('brand.form.namePlaceholder') as HTMLInputElement
    expect(nameInput.value).toBe('Example')
    expect(screen.getByText('brands.flow.website.prefilled')).toBeTruthy()
  })

  it('a failed analysis shows the host error and keeps the panel open', async () => {
    const analyzeWebsite = vi.fn(async () => { throw new Error('fetch failed') })
    renderBrands({ analyzeWebsite })
    fireEvent.click(screen.getByText('brands.fromWebsite'))
    const input = await screen.findByPlaceholderText('brand.form.websitePlaceholder')
    fireEvent.change(input, { target: { value: 'https://example.com' } })
    fireEvent.submit(input.closest('form')!)
    expect(await screen.findByText('fetch failed')).toBeTruthy()
    expect(screen.getByPlaceholderText('brand.form.websitePlaceholder')).toBeTruthy()
  })

  it('cancelling during analysis closes the panel without an error', async () => {
    let release: (suggestion: MotifWebsiteSuggestion) => void = () => {}
    const analyzeWebsite = vi.fn((_url: string, signal: AbortSignal) => new Promise<MotifWebsiteSuggestion>((resolve, reject) => {
      release = resolve
      signal.addEventListener('abort', () => { reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
    }))
    renderBrands({ analyzeWebsite })
    fireEvent.click(screen.getByText('brands.fromWebsite'))
    const input = await screen.findByPlaceholderText('brand.form.websitePlaceholder')
    fireEvent.change(input, { target: { value: 'https://example.com' } })
    fireEvent.submit(input.closest('form')!)
    const cancel = await screen.findByText('brands.flow.website.cancel')
    fireEvent.click(cancel)
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('brand.form.websitePlaceholder')).toBeNull()
    })
    // A late answer after cancel must not open the form.
    await act(async () => { release(SUGGESTION) })
    expect(screen.queryByText('brand.form.title')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('the video card is disabled with an honest explanation', async () => {
    renderBrands()
    const card = screen.getByText('brands.fromVideo').closest('button')!
    expect(card.disabled).toBe(true)
    expect(card.textContent).toContain('brands.fromVideo.unavailable')
    expect(screen.queryByText('brands.fromVideo.body')).toBeNull()
  })

  it('the website card is disabled when no analysis backend is injected', async () => {
    renderBrands({ analyzeWebsite: undefined })
    const card = screen.getByText('brands.fromWebsite').closest('button')!
    expect(card.disabled).toBe(true)
    expect(card.title).toBe('brands.fromWebsite.unavailable')
  })
})
