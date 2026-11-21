import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HarnessError, LlmError } from '@deepseek-ai/dsh-llm'
import { defaultInstallationIdPath, resolveOrCreateInstallationId } from '../src/installation-id.ts'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const dirs: string[] = []

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-pi-install-id-'))
  dirs.push(dir)
  return dir
}

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('llm-pi-ai installation ID store', () => {
  it('resolves the default path under $DSH_HOME/state/llm-pi-ai/installation-id', async () => {
    const home = await tempDir()
    vi.stubEnv('DSH_HOME', home)
    expect(defaultInstallationIdPath()).toBe(join(home, 'state', 'llm-pi-ai', 'installation-id'))
  })

  it('creates a private UUID file on first use and reuses it on later calls', async () => {
    const home = await tempDir()
    vi.stubEnv('DSH_HOME', home)

    const first = await resolveOrCreateInstallationId()
    const second = await resolveOrCreateInstallationId()

    expect(first).toMatch(UUID_PATTERN)
    expect(second).toBe(first)
    const file = defaultInstallationIdPath()
    await expect(readFile(file, 'utf8')).resolves.toBe(`${first}\n`)
    if (process.platform !== 'win32') {
      const info = await stat(file)
      expect(info.mode & 0o777).toBe(0o600)
    }
  })

  it('adopts a UUID written by a competing holder while waiting for the file lock', async () => {
    const dir = await tempDir()
    const file = join(dir, 'state', 'llm-pi-ai', 'installation-id')
    const lock = `${file}.lock`
    const winnerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    await mkdir(dirname(file), { recursive: true })
    await writeFile(lock, `${process.pid}\n`, { mode: 0o600 })

    setTimeout(() => {
      void writeFile(file, `${winnerId}\n`, { mode: 0o600 }).then(() => rm(lock, { force: true }))
    }, 40)

    const resolved = await resolveOrCreateInstallationId({
      path: file,
      randomUUID: () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    })
    expect(resolved).toBe(winnerId)
  })

  it('rethrows LlmError directly if a competing writer wrote malformed content before releasing the lock', async () => {
    const dir = await tempDir()
    const file = join(dir, 'state', 'llm-pi-ai', 'installation-id')
    const lock = `${file}.lock`
    await mkdir(dirname(file), { recursive: true })
    await writeFile(lock, `${process.pid}\n`, { mode: 0o600 })

    setTimeout(() => {
      void writeFile(file, 'corrupt-during-race\n', { mode: 0o600 }).then(() => rm(lock, { force: true }))
    }, 40)

    await expect(resolveOrCreateInstallationId({ path: file })).rejects.toSatisfy((error: unknown) => (
      error instanceof HarnessError
      && error instanceof LlmError
      && error.code === 'AUTH'
      && error.message.includes('invalid installation ID')
    ))
  })

  it('fails loudly with LlmError (HarnessError) when the file is unreadable or malformed', async () => {
    const dir = await tempDir()

    const directoryTarget = join(dir, 'is-a-directory')
    await mkdir(directoryTarget)
    await expect(resolveOrCreateInstallationId({ path: directoryTarget })).rejects.toSatisfy((error: unknown) => (
      error instanceof HarnessError
      && error instanceof LlmError
      && error.code === 'AUTH'
      && error.message.includes('failed to read installation ID')
    ))

    const corruptFile = join(dir, 'corrupt-id')
    await writeFile(corruptFile, 'corrupt-value\n')
    await expect(resolveOrCreateInstallationId({ path: corruptFile })).rejects.toSatisfy((error: unknown) => (
      error instanceof HarnessError
      && error instanceof LlmError
      && error.code === 'AUTH'
      && error.message.includes('invalid installation ID')
    ))
    await expect(readFile(corruptFile, 'utf8')).resolves.toBe('corrupt-value\n')
  })

  it('fails loudly when the parent directory cannot be created or written', async () => {
    const dir = await tempDir()

    const fileAsParent = join(dir, 'blocking-file')
    await writeFile(fileAsParent, 'x')
    await expect(resolveOrCreateInstallationId({ path: join(fileAsParent, 'installation-id') })).rejects.toSatisfy((error: unknown) => (
      error instanceof HarnessError
      && error instanceof LlmError
      && error.code === 'AUTH'
      && error.message.includes('failed to read installation ID')
    ))

    if (process.platform !== 'win32') {
      const readOnlyParent = join(dir, 'readonly-parent')
      await mkdir(readOnlyParent, { mode: 0o700 })
      await chmod(readOnlyParent, 0o500)
      try {
        await expect(resolveOrCreateInstallationId({ path: join(readOnlyParent, 'nested', 'installation-id') }))
          .rejects.toSatisfy((error: unknown) => (
            error instanceof HarnessError
            && error instanceof LlmError
            && error.code === 'AUTH'
            && error.message.includes('failed to create installation ID directory')
          ))
      } finally {
        await chmod(readOnlyParent, 0o700)
      }

      const readOnlyDir = join(dir, 'readonly')
      await mkdir(readOnlyDir, { mode: 0o700 })
      await chmod(readOnlyDir, 0o500)
      try {
        await expect(resolveOrCreateInstallationId({ path: join(readOnlyDir, 'installation-id') })).rejects.toSatisfy((error: unknown) => (
          error instanceof HarnessError
          && error instanceof LlmError
          && error.code === 'AUTH'
          && error.message.includes('failed to persist installation ID')
        ))
      } finally {
        await chmod(readOnlyDir, 0o700)
      }
    }
  })

  it('propagates cancellation when aborted before or during lock wait', async () => {
    const dir = await tempDir()
    const file = join(dir, 'installation-id')
    const controller = new AbortController()
    controller.abort()

    await expect(resolveOrCreateInstallationId({ path: file, signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })

    const lock = `${file}.lock`
    await writeFile(lock, `${process.pid}\n`, { mode: 0o600 })
    const waitController = new AbortController()
    setTimeout(() => { waitController.abort() }, 30)
    await expect(resolveOrCreateInstallationId({ path: file, signal: waitController.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
  })
})
