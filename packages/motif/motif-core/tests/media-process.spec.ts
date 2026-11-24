import { expect, it, vi } from 'vitest'
import type { SubprocessHandle, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { managedMediaRunner } from '../src/media-process.ts'
function handle(overrides: Partial<SubprocessHandle> = {}): SubprocessHandle {
  return {
    control: undefined, stdin: undefined, stdout: undefined, stderr: undefined,
    collected: { stdout: { readFrom: () => ({ text: 'result', nextOffset: 6, lossy: false }) } },
    done: Promise.resolve({ exitCode: 0, signal: null }), terminate: vi.fn(), waitForExit: vi.fn().mockResolvedValue(true), ...overrides,
  }
}
const request = () => ({ file: 'ffmpeg', args: ['-nostdin'], cwd: '/test', signal: new AbortController().signal, timeout: 1000 })
it('uses argument arrays and bounded output then joins managed process teardown', async () => {
  const child = handle(), spawn = vi.fn((_spec: SubprocessSpawnSpec) => child)
  expect(await managedMediaRunner(spawn)(request())).toEqual({ stdout: 'result', stderr: '' })
  expect(spawn).toHaveBeenCalledWith(expect.objectContaining({ argv: ['ffmpeg', '-nostdin'], graceMs: 3000,
    stdio: { stdin: 'ignore', stdout: { maxBytes: 2097152 }, stderr: { maxBytes: 65536 } } }))
  expect(child.terminate).toHaveBeenCalledOnce(); expect(child.waitForExit).toHaveBeenCalledTimes(2)
})
it('rejects failed or truncated tools rather than marking render success', async () => {
  await expect(managedMediaRunner(() => handle({ done: Promise.resolve({ exitCode: 2, signal: null }) }))(request())).rejects.toThrow('failed')
  await expect(managedMediaRunner(() => handle({ collected: { stdout: { readFrom: () => ({ text: '', nextOffset: 5, lossy: true }) } } }))(request())).rejects.toThrow('budget')
})
it('cancellation waits for actual range exit confirmation', async () => {
  const exited = Promise.withResolvers<boolean>(), done = Promise.withResolvers<{ exitCode: number; signal: null }>()
  const controller = new AbortController(), child = handle({ done: done.promise, waitForExit: () => exited.promise })
  const operation = managedMediaRunner((spec) => {
    spec.signal?.addEventListener('abort', () => { done.resolve({ exitCode: 1, signal: null }) }, { once: true })
    return child
  })({ ...request(), signal: controller.signal })
  let settled = false
  const outcome = operation.catch(() => { settled = true })
  controller.abort(); await Promise.resolve(); await Promise.resolve()
  expect(settled).toBe(false)
  exited.resolve(true); await outcome
  expect(settled).toBe(true); expect(child.terminate).toHaveBeenCalledOnce()
})
