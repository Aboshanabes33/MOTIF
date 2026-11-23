import type { MotifBrandIdentity } from './types.ts'
export interface StoredBrand {
  version: 1
  name: string
  identity: MotifBrandIdentity
  logo?: string
  updatedAt: string
}
/** Invalid metadata is reported with its file path. It is never rewritten or deleted. */
export class BrandSchemaError extends Error {
  override name = 'BrandSchemaError'
  constructor(readonly file: string, message: string) { super(`${file}: ${message}. Original metadata was kept; restore a backup or repair this file`) }
}
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
/** Pure migration: v0 had the same fields but no version marker. No disk writes. */
export function migrateBrand(value: unknown, file: string): Record<string, unknown> {
  if (!record(value)) throw new BrandSchemaError(file, 'Brand metadata must be an object')
  if (value.version === undefined || value.version === 0) return { ...value, version: 1 }
  if (value.version !== 1) throw new BrandSchemaError(file, 'Unsupported Brand version; open with a compatible MOTIF release')
  return { ...value }
}
/** Runtime boundary for every value that will reach the renderer or sorting. */
export function parseStoredBrand(value: unknown, file: string): StoredBrand {
  const row = migrateBrand(value, file)
  const fail = (message: string): never => { throw new BrandSchemaError(file, message) }
  const text = (value: unknown, field: string, max = 256): string => {
    if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) return fail(`Invalid ${field}`)
    return value
  }
  text(row.name, 'name')
  if (row.id !== undefined && !/^[\p{L}\p{N}][\p{L}\p{N}_-]{0,127}$/u.test(text(row.id, 'ID', 128))) fail('Invalid ID')
  if (row.workspaceId !== undefined) text(row.workspaceId, 'workspace ID', 256)
  if (!record(row.identity)) fail('Invalid identity')
  const identity = row.identity as Record<string, unknown>
  for (const key of ['primary', 'accent', 'light', 'dark']) {
    if (!/^#[0-9a-f]{6}$/i.test(text(identity[key], `${key} colour`))) fail(`Invalid ${key} colour`)
  }
  for (const key of ['latinFont','arabicFont','motion','caption']) text(identity[key], key)
  if (typeof row.updatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(row.updatedAt) || !Number.isFinite(Date.parse(row.updatedAt))) fail('Invalid update date')
  const day = (row.updatedAt as string).slice(0, 10)
  if (new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) fail('Invalid calendar date')
  // Normalize a valid date so ordering is chronological even with mixed offsets.
  const updatedAt = new Date(row.updatedAt as string).toISOString()
  if (row.logo !== undefined && (typeof row.logo !== 'string' || row.logo.length > 3_000_000 || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(row.logo))) fail('Invalid logo')
  if (row.videoCount !== undefined && (!Number.isInteger(row.videoCount) || (row.videoCount as number) < 0)) fail('Invalid video count')
  return {
    version: 1,
    name: row.name as string,
    identity: identity as unknown as MotifBrandIdentity,
    ...row.logo === undefined ? {} : { logo: row.logo as string },
    updatedAt,
  }
}
