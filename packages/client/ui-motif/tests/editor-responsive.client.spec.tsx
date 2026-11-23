// @vitest-environment jsdom
/**
 * Narrow-viewport smoke tests for the BrandEditor. jsdom does not lay out,
 * so these tests pin the two things that carry the responsive behavior: the
 * stylesheet's breakpoint and touch-target rules (read raw), and the markup
 * contract those rules rely on (stable regions, dialog focus, Escape).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { MotifBrand } from '@deepseek-ai/dsh-motif-core/types'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrandEditor } from '../src/client/MotifSection.tsx'

// jsdom does not apply stylesheets, so the breakpoint rules are checked
// against the raw source.
const rawCss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src/client/MotifSection.module.css'),
  'utf8',
)

const brand: MotifBrand = {
  id: 'b1',
  workspaceId: 'ws-1',
  name: 'Acme',
  path: '/brands/acme',
  identity: {
    primary: '#0F5C4B', accent: '#E8C57C', light: '#F7F4EC', dark: '#141416',
    latinFont: 'Inter', arabicFont: 'IBM Plex Sans Arabic', motion: 'smooth', caption: 'caption',
  },
  updatedAt: '2026-01-01T00:00:00Z',
  videoCount: 3,
}

function renderAt(width: number) {
  window.innerWidth = width
  window.dispatchEvent(new Event('resize'))
  return render(<BrandEditor brand={brand} onClose={() => {}} />)
}

afterEach(cleanup)

describe('BrandEditor responsive smoke', () => {
  it.each([360, 768, 1280])('keeps its regions and controls at %ipx', (width: number) => {
    renderAt(width)
    // One labelled modal with the bar, the request panel, and the stage.
    expect(screen.getByRole('dialog', { name: 'Acme' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /editor.back/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'editor.export' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'editor.editRequest' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'editor.timeline' })).toBeTruthy()
  })

  it('moves focus into the dialog on open', () => {
    render(<BrandEditor brand={brand} onClose={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: 'Acme' })
    expect(document.activeElement).toBe(dialog)
  })

  it('wraps keyboard focus within the modal', () => {
    render(<BrandEditor brand={brand} onClose={() => {}} />)
    const buttons = screen.getAllByRole('button')
    const slider = screen.getByRole('slider')
    slider.focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.activeElement).toBe(buttons[0])
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(slider)
  })

  it('returns focus to the opener on close', () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const view = render(<BrandEditor brand={brand} onClose={() => {}} />)
    view.unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<BrandEditor brand={brand} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('BrandEditor stylesheet contract', () => {
  it('declares breakpoints for tablet and phone widths', () => {
    expect(rawCss).toContain('@media (max-width: 960px)')
    expect(rawCss).toContain('@media (max-width: 720px)')
  })

  it('stacks the editor panels instead of the fixed sidebar on phones', () => {
    const phone = rawCss.slice(rawCss.indexOf('@media (max-width: 720px)'))
    expect(phone).toContain('grid-template-columns: 1fr')
    // The stage renders above the docked request panel.
    expect(phone).toMatch(/\.editorStage\s*\{[^}]*order: -1/)
  })

  it('keeps controls touch-sized and focus visible', () => {
    expect(rawCss).toMatch(/\.editor \.primary[^{]*\{[^}]*min-height: 44px/)
    expect(rawCss).toMatch(/\.editor \.composerRow input\s*\{[^}]*min-height: 44px/)
    expect(rawCss).toContain('.editor :focus-visible')
    // 16px composer text on phones, so iOS does not zoom on focus.
    const phone = rawCss.slice(rawCss.indexOf('@media (max-width: 720px)'))
    expect(phone).toMatch(/\.composerRow input\s*\{[^}]*font-size: 16px/)
  })
})
