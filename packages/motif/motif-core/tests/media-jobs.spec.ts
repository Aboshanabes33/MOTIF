import { expect, it, vi } from 'vitest'
import { MediaJobs, MEDIA_EDITOR_READINESS } from '../src/media-jobs.ts'
import { managedMediaRunner } from '../src/media-process.ts'
import type { SubprocessHandle, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'

it('keeps editor availability false until the integration is verified', () => {
  expect(MEDIA_EDITOR_READINESS.available).toBe(false)
  expect(() => new MediaJobs(0)).toThrow()
})

it('refuses jobs after disposal', async () => {
  const jobs = new MediaJobs()
  jobs.dispose()
  await expect(jobs.start('brand', '/tmp', { version: 1, source: 'source.mp4', clips: [{ start: 0, end: 1 }] }, {
    tools: { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', whisper: 'whisper', hyperframes: 'hyperframes' },
    signal: new AbortController().signal, run: vi.fn(),
  })).rejects.toThrow('closed')
})

it('uses managed process argv, bounded output and whole-range teardown', async () => {
  const specs: SubprocessSpawnSpec[] = []
  const terminate = vi.fn()
  const waitForExit = vi.fn(async () => {})
  const runner = managedMediaRunner(spec => {
    specs.push(spec)
    return { done: Promise.resolve({ exitCode: 0, signal: null }), terminate, waitForExit,
      collected: { stdout: { readFrom: () => ({ text: '{"ok":true}', nextOffset: 11, lossy: false }) } },
    } as unknown as SubprocessHandle
  })
  expect(await runner({ file: 'ffprobe', args: ['safe.mp4'], cwd: '/tmp', timeout: 1000, signal: new AbortController().signal })).toEqual({ stdout: '{"ok":true}', stderr: '' })
  expect(specs[0]?.argv).toEqual(['ffprobe', 'safe.mp4'])
  expect(specs[0]?.stdio.stdout).toEqual({ maxBytes: 2 * 1024 * 1024 })
  expect(terminate).toHaveBeenCalled()
  expect(waitForExit).toHaveBeenCalledTimes(2)
})

import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
it('bounds concurrency and cancels only the active Brand', async () => {
  const root = await mkdtemp(join(tmpdir(), 'motif-media-'))
  const jobs = new MediaJobs(1)
  const plan = { version: 1 as const, source: 'source.mp4', clips: [{ start: 0, end: 1 }] }
  let entered!: () => void
  const running = new Promise<void>(resolve => { entered = resolve })
  const options = {
    tools: { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', whisper: 'whisper', hyperframes: 'hyperframes' },
    signal: new AbortController().signal,
    run: async ({ signal }: { signal: AbortSignal }) => {
      entered()
      return await new Promise<{ stdout: string; stderr: string }>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('fixture cancelled')), { once: true })
      })
    },
  }
  try {
    await writeFile(join(root, 'source.mp4'), 'fixture')
    const first = jobs.start('first', root, plan, options)
    const stopped = expect(first).rejects.toThrow('cancelled')
    await running
    await expect(jobs.start('first', root, plan, options)).rejects.toThrow('already')
    await expect(jobs.start('second', root, plan, options)).rejects.toThrow('busy')
    jobs.cancel('second')
    expect(jobs.status('first')?.state).toBe('probe')
    jobs.cancel('first')
    await stopped
    expect(jobs.status('first')).toBeUndefined()
  } finally { jobs.dispose(); await rm(root, { recursive: true, force: true }) }
})
