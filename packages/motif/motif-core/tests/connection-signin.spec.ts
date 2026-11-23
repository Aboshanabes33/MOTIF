import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { signInBackend } from '../src/connection.ts'
import type { ConnectionInternals, SignInChild } from '../src/connection.ts'

const COMMANDS = { claudeCode: 'claude', codex: 'codex' }

/** Fake child process whose error/spawn events the test schedules. */
function fakeChild(plan: 'spawn' | 'error' | 'throw'): SignInChild {
  if (plan === 'throw') {
    return {
      unref: () => {},
      on: () => { throw new Error('spawn ENOENT') },
    }
  }
  const emitter = new EventEmitter()
  queueMicrotask(() => {
    if (plan === 'spawn') emitter.emit('spawn')
    else emitter.emit('error', Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }))
  })
  return {
    unref: () => {},
    on: (event: string, listener: (...args: never[]) => void) => emitter.on(event, listener),
  } as SignInChild
}

interface HarnessOptions {
  readonly platform?: NodeJS.Platform
  readonly execResults?: Readonly<Record<string, 'ok' | 'fail'>>
  readonly spawnPlan?: 'spawn' | 'error' | 'throw'
}

function harness(options: HarnessOptions) {
  const execCalls: string[] = []
  const exec = vi.fn(async (file: string, args: readonly string[]) => {
    if (args[0] === '--version') return { stdout: '1.0.0', stderr: '' }
    execCalls.push(file)
    const key = file
    const result = options.execResults?.[key] ?? 'fail'
    if (result === 'fail') throw new Error(`${file}: command not found`)
    return { stdout: '', stderr: '' }
  })
  const spawn = vi.fn(() => fakeChild(options.spawnPlan ?? 'spawn'))
  const internals: ConnectionInternals = {
    exec: exec as ConnectionInternals['exec'],
    spawn,
    platform: options.platform,
  }
  return { exec, execCalls, spawn, internals }
}

describe('signInBackend', () => {
  it('reports failure when the tool is not installed', async () => {
    const { internals } = harness({ execResults: {} })
    const exec = async (): Promise<{ stdout: string; stderr: string }> => { throw new Error('not found') }
    const result = await signInBackend('claude-code', COMMANDS, { ...internals, exec })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Install the official Claude Code tool first')
  })

  it('opens a real terminal on macOS and only then claims success', async () => {
    const { exec, execCalls, spawn, internals } = harness({ platform: 'darwin', execResults: { osascript: 'ok' } })
    const result = await signInBackend('claude-code', COMMANDS, internals)
    expect(result.ok).toBe(true)
    expect(execCalls).toEqual(['osascript'])
    expect(spawn).not.toHaveBeenCalled()
    expect(result.message).toContain('claude login')
    expect(result.message).toContain('terminal')
    expect(result.message).toContain('Test')
    expect(exec).toHaveBeenCalledWith('osascript', expect.arrayContaining(['-e']), expect.anything())
  })

  it('opens cmd start on Windows', async () => {
    const { execCalls, spawn, internals } = harness({ platform: 'win32', execResults: { cmd: 'ok' } })
    const result = await signInBackend('codex', COMMANDS, internals)
    expect(result.ok).toBe(true)
    expect(execCalls).toEqual(['cmd'])
    expect(spawn).not.toHaveBeenCalled()
  })

  it('falls through Linux terminals until one answers', async () => {
    const { execCalls, internals } = harness({ platform: 'linux', execResults: { 'gnome-terminal': 'ok' } })
    const result = await signInBackend('claude-code', COMMANDS, internals)
    expect(result.ok).toBe(true)
    expect(execCalls).toEqual(['x-terminal-emulator', 'gnome-terminal'])
    expect(result.message).toContain('terminal')
  })

  it('falls back to a confirmed background launch without claiming a window opened', async () => {
    const { spawn, internals } = harness({ platform: 'linux', execResults: {}, spawnPlan: 'spawn' })
    const result = await signInBackend('claude-code', COMMANDS, internals)
    expect(result.ok).toBe(true)
    expect(spawn).toHaveBeenCalledWith('claude', ['login'])
    expect(result.message).not.toContain('window opened')
    expect(result.message).toContain('background')
    expect(result.message).toContain('run `claude login` in a terminal')
  })

  it('reports the spawn error event instead of claiming success', async () => {
    const { internals } = harness({ platform: 'linux', execResults: {}, spawnPlan: 'error' })
    const result = await signInBackend('claude-code', COMMANDS, internals)
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Could not start Claude Code sign-in')
    expect(result.message).toContain('ENOENT')
    expect(result.message).toContain('Run `claude login` in a terminal yourself')
  })

  it('reports a synchronous spawn throw instead of claiming success', async () => {
    const { internals } = harness({ platform: 'linux', execResults: {}, spawnPlan: 'throw' })
    const result = await signInBackend('claude-code', COMMANDS, internals)
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Could not start Claude Code sign-in')
  })

  it('skips terminal launchers on platforms without one and uses the confirmed fallback', async () => {
    const { execCalls, spawn, internals } = harness({ platform: 'aix', spawnPlan: 'spawn' })
    const result = await signInBackend('claude-code', COMMANDS, internals)
    expect(execCalls).toEqual([])
    expect(spawn).toHaveBeenCalled()
    expect(result.ok).toBe(true)
  })

  it('refuses to interpolate a shell-hostile command into a terminal launcher', async () => {
    const { execCalls, spawn, internals } = harness({ platform: 'darwin', execResults: { osascript: 'ok' }, spawnPlan: 'spawn' })
    const hostile = { claudeCode: 'claude" & rm -rf ~ & echo "', codex: 'codex' }
    const result = await signInBackend('claude-code', hostile, internals)
    expect(execCalls).toEqual([])
    expect(spawn).toHaveBeenCalledWith(hostile.claudeCode, ['login'])
    expect(result.ok).toBe(true)
    expect(result.message).toContain('background')
  })

  it('rejects a Windows metacharacter command before cmd start interpolation', async () => {
    const { execCalls, spawn, internals } = harness({ platform: 'win32', execResults: { cmd: 'ok' }, spawnPlan: 'spawn' })
    const hostile = { claudeCode: 'claude & calc', codex: 'codex' }
    const result = await signInBackend('claude-code', hostile, internals)
    expect(execCalls).toEqual([])
    expect(spawn).toHaveBeenCalledWith(hostile.claudeCode, ['login'])
    expect(result.ok).toBe(true)
  })
})
