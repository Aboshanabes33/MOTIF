/** Small durable owner-runtime records. Restart never resumes native execution. */
import { constants } from 'node:fs'
import { mkdir, open, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { randomUUID } from 'node:crypto'
export interface MediaRecord {
  id: string
  state: 'running' | 'cancelling' | 'completed' | 'cancelled' | 'failed' | 'interrupted'
  output?: string | undefined
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const outputPath = /^timeline\/media-[a-f0-9-]{36}\/output\.mp4$/
/** Keep journal paths independent of untrusted JSON. No automatic deletion of user files. */
async function directory(root: string): Promise<string> {
  const path = join(root, '.media-jobs')
  await mkdir(path, { recursive: true, mode: 0o700 })
  if (await realpath(path) !== join(await realpath(root), '.media-jobs')) throw new Error('Media journal must not be symlinked')
  return path
}
export async function saveMediaRecord(root: string, record: MediaRecord): Promise<void> {
  if (!uuid.test(record.id)) throw new Error('Invalid job id')
  const dir = await directory(root), temp = join(dir, `.${randomUUID()}.tmp`)
  const output = record.output === undefined ? undefined : relative(root, record.output).replaceAll('\\', '/')
  if (output !== undefined && !outputPath.test(output)) throw new Error('Invalid output record')
  try {
    await writeFile(temp, JSON.stringify({ version: 1, id: record.id, state: record.state, output }), { flag: 'wx', mode: 0o600 })
    const file = await open(temp, 'r+')
    try { await file.sync() } finally { await file.close() }
    await rename(temp, join(dir, record.id + '.json'))
  } finally { await rm(temp, { force: true }) }
}
export async function loadMediaRecords(root: string): Promise<MediaRecord[]> {
  const dir = await directory(root), files = await readdir(dir, { withFileTypes: true })
  if (files.length > 200) throw new Error('Media journal requires maintenance')
  const records: MediaRecord[] = []
  for (const entry of files) {
    if (entry.name.startsWith('.') && entry.name.endsWith('.tmp')) continue
    const id = entry.name.replace(/\.json$/, '')
    if (!entry.isFile() || !uuid.test(id) || entry.name !== id + '.json') throw new Error('Unsafe media journal entry')
    if (records.length >= 100) throw new Error('Media history full')
    const file = await open(join(dir, entry.name), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    let row: { version?: unknown; id?: unknown; state?: unknown; output?: unknown }
    try {
      if ((await file.stat()).size > 4096) throw new Error('Oversized media record')
      row = JSON.parse(await file.readFile('utf8'))
    } finally { await file.close() }
    if (!row || row.version !== 1 || row.id !== id || !['running', 'cancelling', 'completed', 'cancelled', 'failed', 'interrupted'].includes(String(row.state))) throw new Error('Invalid media record')
    if (row.output !== undefined && (typeof row.output !== 'string' || !outputPath.test(row.output))) throw new Error('Invalid media output record')
    const interrupted = row.state === 'running' || row.state === 'cancelling'
    const record: MediaRecord = {
      id, state: interrupted ? 'interrupted' : row.state as MediaRecord['state'],
      output: row.state === 'completed' && typeof row.output === 'string' ? join(root, row.output) : undefined,
    }
    if (record.state === 'completed' && !record.output) throw new Error('Completed record missing output')
    if (interrupted) await saveMediaRecord(root, record)
    records.push(record)
  }
  return records
}
