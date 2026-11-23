import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_COMMANDS,
  installBackend,
  platformExecutable,
  signInBackend,
  testBackend,
} from '../src/connection.ts'
import type { ConnectionInternals } from '../src/connection.ts'

type ExecCall = { file: string; args: readonly string[] }
type Exec = NonNullable<ConnectionInternals['exec']>

/** One queued exec double: each entry is the outcome of the next call. */
function makeExec(outcomes: Array<Error | { stdout: string; stderr: string }>): { exec: Exec; calls: ExecCall[] } {
  const calls: ExecCall[] = []
  const queue = [...outcomes]
  const exec: Exec = async (file, args) => {
    calls.push({ file, args })
    const next = queue.shift()
    if (next === undefined) throw new Error(`unexpected exec: ${file}`)
    if (next instanceof Error) throw next
    return next
  }
  return { exec, calls }
}

const NOT_INSTALLED = Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' })
const VERSION_OK = { stdout: '1.0.0\n', stderr: '' }
const INSTALL_OK = { stdout: 'added 1 package\n', stderr: '' }

describe('platformExecutable', () => {
  it('adds the .cmd shim extension to bare names on Windows', () => {
    expect(platformExecutable('npm', 'win32')).toBe('npm.cmd')
    expect(platformExecutable('claude', 'win32')).toBe('claude.cmd')
    expect(platformExecutable('codex', 'win32')).toBe('codex.cmd')
  })

  it('leaves names with an extension or a path untouched on Windows', () => {
    expect(platformExecutable('npm.cmd', 'win32')).toBe('npm.cmd')
    expect(platformExecutable('C:\\tools\\claude.exe', 'win32')).toBe('C:\\tools\\claude.exe')
    expect(platformExecutable('C:\\Program Files\\nodejs\\npm.cmd', 'win32')).toBe('C:\\Program Files\\nodejs\\npm.cmd')
    expect(platformExecutable('./bin/claude', 'win32')).toBe('./bin/claude')
  })

  it('leaves every spelling untouched on macOS and Linux', () => {
    for (const platform of ['darwin', 'linux']) {
      expect(platformExecutable('npm', platform)).toBe('npm')
      expect(platformExecutable('claude', platform)).toBe('claude')
      expect(platformExecutable('/opt/tools/claude', platform)).toBe('/opt/tools/claude')
    }
  })
})

describe('installBackend', () => {
  it('installs through npm.cmd on Windows, with no shell and array arguments', async () => {
    const { exec, calls } = makeExec([NOT_INSTALLED, INSTALL_OK, VERSION_OK])
    const result = await installBackend('claude-code', DEFAULT_COMMANDS, { exec, platform: 'win32' })
    expect(result.ok).toBe(true)
    expect(result.message).toContain('installed')
    expect(calls[0]).toEqual({ file: 'claude.cmd', args: ['--version'] })
    expect(calls[1]).toEqual({ file: 'npm.cmd', args: ['install', '-g', '@anthropic-ai/claude-code'] })
    expect(calls[2]).toEqual({ file: 'claude.cmd', args: ['--version'] })
  })

  it('installs through plain npm on macOS and Linux', async () => {
    for (const platform of ['darwin', 'linux']) {
      const { exec, calls } = makeExec([NOT_INSTALLED, INSTALL_OK, VERSION_OK])
      const result = await installBackend('codex', DEFAULT_COMMANDS, { exec, platform })
      expect(result.ok).toBe(true)
      expect(calls[1]).toEqual({ file: 'npm', args: ['install', '-g', '@openai/codex'] })
      expect(calls[0]?.file).toBe('codex')
    }
  })

  it('short-circuits when the tool already answers', async () => {
    const { exec, calls } = makeExec([VERSION_OK])
    const result = await installBackend('claude-code', DEFAULT_COMMANDS, { exec, platform: 'win32' })
    expect(result).toEqual({ ok: true, message: 'Claude Code is already installed.' })
    expect(calls).toHaveLength(1)
  })

  it('explains a missing npm with platform-correct guidance', async () => {
    const win = makeExec([NOT_INSTALLED, Object.assign(new Error('spawn npm ENOENT'), { code: 'ENOENT' })])
    const winResult = await installBackend('claude-code', DEFAULT_COMMANDS, { exec: win.exec, platform: 'win32' })
    expect(winResult.ok).toBe(false)
    expect(winResult.message).toContain('npm.cmd')
    expect(winResult.message).toContain('Node.js')

    const linux = makeExec([NOT_INSTALLED, Object.assign(new Error('spawn npm ENOENT'), { code: 'ENOENT' })])
    const linuxResult = await installBackend('claude-code', DEFAULT_COMMANDS, { exec: linux.exec, platform: 'linux' })
    expect(linuxResult.ok).toBe(false)
    expect(linuxResult.message).toContain('provides npm')
    expect(linuxResult.message).not.toContain('.cmd')
  })

  it("carries npm's own error tail on failure", async () => {
    const failure = Object.assign(new Error('Command failed: npm.cmd install -g'), {
      stderr: 'npm ERR! code E404\nnpm ERR! 404 Not Found - GET https://registry.npmjs.org/nope',
    })
    const { exec } = makeExec([NOT_INSTALLED, failure])
    const result = await installBackend('claude-code', DEFAULT_COMMANDS, { exec, platform: 'win32' })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('404 Not Found')
    expect(result.message).toContain('npm install -g @anthropic-ai/claude-code')
  })

  it('reports when the tool still does not answer after installation', async () => {
    const { exec } = makeExec([NOT_INSTALLED, INSTALL_OK, NOT_INSTALLED])
    const result = await installBackend('claude-code', DEFAULT_COMMANDS, { exec, platform: 'win32' })
    expect(result).toEqual({ ok: false, message: 'Claude Code still does not answer after installation.' })
  })

  it('uses a configured absolute path with spaces exactly as given', async () => {
    const { exec, calls } = makeExec([VERSION_OK])
    await installBackend('claude-code', { claudeCode: 'C:\\Program Files\\Claude\\claude.exe', codex: 'codex' }, { exec, platform: 'win32' })
    expect(calls[0]).toEqual({ file: 'C:\\Program Files\\Claude\\claude.exe', args: ['--version'] })
  })
})

describe('signInBackend', () => {
  it('spawns the platform-correct executable', async () => {
    const { exec } = makeExec([VERSION_OK])
    const spawn = vi.fn(() => ({ unref: () => {} }))
    const result = await signInBackend('codex', DEFAULT_COMMANDS, { exec, spawn, platform: 'win32' })
    expect(result.ok).toBe(true)
    expect(spawn).toHaveBeenCalledWith('codex.cmd', ['login'])
  })

  it('explains a failed start without hiding the terminal fallback', async () => {
    const { exec } = makeExec([VERSION_OK])
    const spawn = vi.fn(() => { throw Object.assign(new Error('spawn codex.cmd ENOENT'), { code: 'ENOENT' }) })
    const result = await signInBackend('codex', DEFAULT_COMMANDS, { exec, spawn, platform: 'win32' })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('codex login')
  })
})

describe('testBackend', () => {
  it('probes through the platform-correct executable', async () => {
    const { exec, calls } = makeExec([VERSION_OK, { stdout: 'OK', stderr: '' }])
    const result = await testBackend('claude-code', DEFAULT_COMMANDS, { exec, platform: 'win32' })
    expect(result.ok).toBe(true)
    expect(calls[1]).toEqual({ file: 'claude.cmd', args: ['-p', 'Reply with exactly: OK'] })
  })
})
