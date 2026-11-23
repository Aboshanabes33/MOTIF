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

/** Strict, bounded base64 decoding; Buffer's permissive decoder is not validation. */
export function decodeLogo(dataUrl: string): { bytes: Buffer; extension: string; mime: LogoMime } {
  if (typeof dataUrl !== 'string' || dataUrl.length > 64 + 4 * Math.ceil(MAX_LOGO_BYTES / 3)) throw new Error('Logo exceeds the 2 MiB limit')
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
  if (match === null) throw new Error('Logo must be a PNG, JPEG, or WebP base64 data URL')
  const [, declared = '', data = ''] = match
  if (data.length % 4 !== 0) throw new Error('Logo must be a PNG, JPEG, or WebP base64 data URL')
  const bytes = Buffer.from(data, 'base64')
  if (bytes.toString('base64') !== data) throw new Error('Logo contains malformed base64')
  const mime = validateLogoBytes(bytes, declared)
  return { bytes, mime, extension: mime === 'image/jpeg' ? 'jpg' : mime.slice(6) }
}
