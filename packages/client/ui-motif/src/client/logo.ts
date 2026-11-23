/** Bounded raster logo validation. Never trust the declared MIME alone. */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024
export type LogoMime = 'image/png' | 'image/jpeg' | 'image/webp'

/** Reject unsupported, truncated, or MIME-spoofed headers before persistence. */
export function validateLogoBytes(bytes: Uint8Array, mime: string): LogoMime {
  if (bytes.length === 0 || bytes.length > MAX_LOGO_BYTES) throw new Error('Logo must be between 1 byte and 2 MiB')
  const ascii = (start: number, text: string) => [...text].every((c, i) => bytes[start + i] === c.charCodeAt(0))
  const png = bytes.length >= 33 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v) && ascii(12, 'IHDR')
  const jpeg = bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217
  const webp = bytes.length >= 20 && ascii(0, 'RIFF') && ascii(8, 'WEBP') && (ascii(12, 'VP8 ') || ascii(12, 'VP8L') || ascii(12, 'VP8X'))
  if ((mime === 'image/png' && png) || (mime === 'image/jpeg' && jpeg) || (mime === 'image/webp' && webp)) return mime
  throw new Error('Logo must be a valid PNG, JPEG, or WebP matching its file type. SVG is not supported')
}
