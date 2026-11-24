import { expect, it } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadMediaRecords, saveMediaRecord } from '../src/media-journal.ts'
const id = '00000000-0000-4000-8000-000000000001'
it('persists safe completed output and interrupts unfinished jobs instead of resuming', async () => {
  const root = await mkdtemp(join(tmpdir(), 'motif-journal-'))
  try {
    await saveMediaRecord(root, { id, state: 'running' })
    expect(await loadMediaRecords(root)).toEqual([{ id, state: 'interrupted', output: undefined }])
    const output = join(root, 'timeline', 'media-' + id, 'output.mp4')
    await saveMediaRecord(root, { id, state: 'completed', output })
    expect(await loadMediaRecords(root)).toEqual([{ id, state: 'completed', output }])
    await expect(saveMediaRecord(root, { id, state: 'completed', output: '/tmp/outside.mp4' })).rejects.toThrow('Invalid output')
  } finally { await rm(root, { recursive: true, force: true }) }
})
it('refuses symlink journal entries and oversized records', async () => {
  const root = await mkdtemp(join(tmpdir(), 'motif-journal-'))
  try {
    await mkdir(join(root, '.media-jobs'))
    await writeFile(join(root, 'target'), '{}')
    const path = join(root, '.media-jobs', id + '.json')
    await symlink(join(root, 'target'), path)
    await expect(loadMediaRecords(root)).rejects.toThrow('Unsafe')
    await rm(path); await writeFile(path, 'x'.repeat(4097))
    await expect(loadMediaRecords(root)).rejects.toThrow('Oversized')
  } finally { await rm(root, { recursive: true, force: true }) }
})
