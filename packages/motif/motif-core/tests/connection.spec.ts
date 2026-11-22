import { describe, expect, it, vi } from 'vitest'
import { inspectConnections, installBackend, signInBackend, testBackend } from '../src/connection.ts'

function internals(overrides: { installed?: boolean; answer?: string; signedIn?: boolean } = {}) {
  const exec = vi.fn(async (file: string, args: readonly string[]) => {
    if (args[0] === '--version') {
      if (overrides.installed === false) throw new Error('missing')
      return { stdout: `${file} 1.0.0`, stderr: '' }
    }
    if (overrides.answer === 'throw') throw new Error('not signed in')
    return { stdout: overrides.answer ?? 'OK', stderr: '' }
  })
  const spawn = vi.fn(() => ({ unref: () => {} }))
  return {
    exec,
    spawn,
    exists: (path: string) => overrides.signedIn === true && path.endsWith('auth.json') || overrides.signedIn === true && path.endsWith('.credentials.json'),
    env: { HOME: '/home/test' },
  }
}

describe('AI connection', () => {
  it('reports an installed and signed-in backend without starting the tool beyond --version', async () => {
    const seams = internals({ signedIn: true })
    const cards = await inspectConnections(undefined, seams)

    expect(cards[0]).toMatchObject({ backend: 'claude-code', installed: true, signedIn: 'yes' })
    expect(seams.exec).toHaveBeenCalledWith('claude', ['--version'], expect.anything())
  })

  it('tells the user to sign in when the native credentials are absent', async () => {
    const cards = await inspectConnections(undefined, internals({ signedIn: false }))

    expect(cards[0]).toMatchObject({ signedIn: 'no' })
    expect(cards[0]?.detail).toContain('never sees your password')
  })

  it('installs a missing tool with its official package', async () => {
    const seams = internals({ installed: false })
    seams.exec.mockImplementationOnce(async () => { throw new Error('missing') })
      .mockImplementationOnce(async () => ({ stdout: 'added', stderr: '' }))
      .mockImplementationOnce(async () => ({ stdout: '1.0.0', stderr: '' }))

    await expect(installBackend('codex', undefined, seams)).resolves.toMatchObject({ ok: true })
    expect(seams.exec).toHaveBeenCalledWith('npm', ['install', '-g', '@openai/codex'], expect.anything())
  })

  it('starts the provider login detached and reports it', async () => {
    const seams = internals()
    await expect(signInBackend('claude-code', undefined, seams)).resolves.toMatchObject({ ok: true })
    expect(seams.spawn).toHaveBeenCalledWith('claude', ['login'])
  })

  it('passes one short request and reports the answer', async () => {
    await expect(testBackend('claude-code', undefined, internals({ answer: 'OK' })))
      .resolves.toMatchObject({ ok: true, message: 'Test request passed: OK' })
  })

  it('maps a failed request on a signed-out machine to the sign-in instruction', async () => {
    await expect(testBackend('codex', undefined, internals({ answer: 'throw', signedIn: false })))
      .resolves.toMatchObject({ ok: false })
  })
})
