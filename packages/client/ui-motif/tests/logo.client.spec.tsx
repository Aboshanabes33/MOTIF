// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BrandsSection } from '../src/client/MotifSection.tsx'
import { MAX_LOGO_BYTES, validateLogoBytes } from '../src/client/logo.ts'
afterEach(cleanup)
async function openForm() {
  render(<BrandsSection t={key => key} load={async () => ({ brands:[],connections:[] })} createBrand={vi.fn()} />)
  await waitFor(() => expect(screen.getByText('brands.manually')).toBeTruthy())
  fireEvent.click(screen.getByText('brands.manually'))
  return screen.getByLabelText('brand.form.logo')
}
describe('logo upload client guard', () => {
  it('rejects oversize before FileReader starts', async () => {
    const input = await openForm()
    const spy = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer')
    fireEvent.change(input,{ target:{ files:[new File([new Uint8Array(MAX_LOGO_BYTES+1)],'big.png',{ type:'image/png' })] } })
    expect(screen.getByText(/2 MiB/)).toBeTruthy()
    expect(spy).not.toHaveBeenCalled();spy.mockRestore()
  })
  it('rejects SVG before reading it', async () => {
    const input = await openForm()
    fireEvent.change(input,{ target:{ files:[new File(['<svg/>'],'logo.svg',{ type:'image/svg+xml' })] } })
    expect(screen.getByText(/SVG is not supported/)).toBeTruthy()
  })
  it('rejects spoofed MIME after reading the bytes', async () => {
    const input = await openForm()
    fireEvent.change(input,{ target:{ files:[new File(['not a png'],'logo.png',{ type:'image/png' })] } })
    await waitFor(()=>expect(screen.getByText(/matching its file type/)).toBeTruthy())
  })
  it('accepts the same PNG signature on client as on host', () => {
    const png = new Uint8Array(33); png.set([137,80,78,71,13,10,26,10]);png.set([73,72,68,82],12)
    expect(validateLogoBytes(png,'image/png')).toBe('image/png')
  })
})
