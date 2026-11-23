import { describe, expect, it } from 'vitest'
import { slugify } from '../src/brand-store.ts'

describe('slugify', () => {
  it('keeps ASCII behavior unchanged', () => {
    expect(slugify('Acme')).toBe('acme')
    expect(slugify('Acme Co')).toBe('acme-co')
    expect(slugify('  ACME  CO!  ')).toBe('acme-co')
  })

  it('preserves Arabic letters instead of collapsing to the fallback', () => {
    expect(slugify('متجر')).toBe('متجر')
    expect(slugify('مقهى الرياض')).toBe('مقهى-الرياض')
  })

  it('gives distinct Arabic names distinct slugs', () => {
    const first = slugify('متجر القهوة')
    const second = slugify('متجر الكتب')
    expect(first).not.toBe('brand')
    expect(second).not.toBe('brand')
    expect(first).not.toBe(second)
  })

  it('handles mixed Arabic and English', () => {
    expect(slugify('متجر Acme')).toBe('متجر-acme')
    expect(slugify('Acme متجر')).toBe('acme-متجر')
  })

  it('keeps Arabic-Indic digits as numbers', () => {
    expect(slugify('متجر ١٢٣')).toBe('متجر-١٢٣')
  })

  it('strips emoji and symbols into separators', () => {
    expect(slugify('Acme 🎬 Studio')).toBe('acme-studio')
    expect(slugify('🎬🎬')).toBe('brand')
  })

  it('turns punctuation runs into single dashes', () => {
    expect(slugify('acme!!!co')).toBe('acme-co')
    expect(slugify('---')).toBe('brand')
  })

  it('neutralizes path separators and control characters', () => {
    expect(slugify('a/b\\c')).toBe('a-b-c')
    expect(slugify('../../etc')).toBe('etc')
    expect(slugify('acme\nco')).toBe('acme-co')
    expect(slugify('a\x00b')).toBe('a-b')
    expect(slugify('a​b')).toBe('a-b') // zero-width space
  })

  it('normalizes Unicode consistently across NFC and NFD spellings', () => {
    const nfc = slugify('Café')
    const nfd = slugify('Café'.normalize('NFD'))
    expect(nfc).toBe('café')
    expect(nfd).toBe(nfc)
  })

  it('folds compatibility characters with NFKC', () => {
    expect(slugify('ﬁlm')).toBe('film')
  })

  it('collides deterministically for names differing only in punctuation', () => {
    expect(slugify('Acme!')).toBe(slugify('Acme?'))
  })

  it('caps at 48 code points without splitting surrogate pairs or leaving a trailing dash', () => {
    const long = 'م'.repeat(60)
    const slug = slugify(long)
    expect([...slug]).toHaveLength(48)
    expect(slug.endsWith('-')).toBe(false)
    const withDashAt48 = `${'a'.repeat(47)}-zzz`
    const capped = slugify(withDashAt48)
    expect([...capped].length).toBeLessThanOrEqual(48)
    expect(capped.endsWith('-')).toBe(false)
  })
})
