/** Media process adapter using the Host's managed process range, never a shell. */
import type { SubprocessHandle, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import type { ProcessRunner } from './media-pipeline.ts'

/** Bind media commands to bounded output and whole-range termination. */
export function managedMediaRunner(spawn: (spec: SubprocessSpawnSpec) => SubprocessHandle): ProcessRunner {
  return async (request) => {
    request.signal.throwIfAborted()
    const timeout = new AbortController()
    const timer = setTimeout(() => timeout.abort(new Error('Media stage timed out')), request.timeout)
    const signal = AbortSignal.any([request.signal, timeout.signal])
    let child: SubprocessHandle | undefined
    try {
      child = spawn({
        argv: [request.file, ...request.args], cwd: request.cwd,
        stdio: { stdin: 'ignore', stdout: { maxBytes: 2 * 1024 * 1024 }, stderr: { maxBytes: 65536 } },
        graceMs: 3000, signal, env: request.env,
      })
      const outcome = await child.done
      await child.waitForExit()
      signal.throwIfAborted()
      if (outcome.exitCode !== 0) throw new Error('Media tool failed. Check tool installation and the selected source.')
      const stdout = child.collected.stdout?.readFrom(0)
      if (stdout?.lossy) throw new Error('Media tool output exceeded its budget')
      return { stdout: stdout?.text ?? '', stderr: '' }
    } finally {
      clearTimeout(timer)
      if (child !== undefined) {
        child.terminate()
        await child.waitForExit()
      }
    }
  }
}
