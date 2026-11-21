/**
 * Per-installation UUID owned by `llm-pi-ai` for third-party pi-ai sign-in flows
 * (such as OpenAI's Sign in with ChatGPT `LoginOptions.getDeviceId`).
 *
 * Persisted at `$DSH_HOME/state/llm-pi-ai/installation-id` via {@link dshPath}
 * rather than in the credentials seam (`ctx.credentials`): `.credentials.yaml`
 * stores user secrets and authorization grants, and {@link credentialStoreFrom}
 * maps every record in scope `llm-pi-ai` to a signed-in provider entry, whereas
 * this identifier is non-secret installation state that must survive provider
 * sign-outs and credential resets. It is also independent of
 * `deepseekAccount.getDeviceIdentity()`, which identifies the user to DeepSeek
 * and must not be sent to OpenAI.
 *
 * @module dsh-llm-pi-ai/installation-id
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { dshPath } from '@deepseek-ai/dsh-home-paths'
import { LlmError } from '@deepseek-ai/dsh-llm'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Options for resolving or creating the persisted installation ID. */
export interface InstallationIdOptions {
  /** Override the target path; defaults to `dshPath('state', 'llm-pi-ai', 'installation-id')`. */
  path?: string
  /** Aborts lock acquisition and file setup before persistence completes. */
  signal?: AbortSignal
  /** UUID generator override for tests; defaults to `crypto.randomUUID`. */
  randomUUID?: () => string
}

/** Default file holding the per-installation UUID under the Motif home. */
export function defaultInstallationIdPath(): string {
  return dshPath('state', 'llm-pi-ai', 'installation-id')
}

async function readPersistedInstallationId(file: string): Promise<string | undefined> {
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw new LlmError(
      `llm-pi-ai: failed to read installation ID at ${file}; inspect file permissions or remove the unreadable path`,
      'AUTH',
      { cause: error },
    )
  }
  const value = raw.trim()
  if (!UUID_PATTERN.test(value)) {
    throw new LlmError(
      `llm-pi-ai: invalid installation ID in ${file}; remove or replace the file with a valid UUID`,
      'AUTH',
    )
  }
  return value
}

/**
 * Return the installation's persisted UUID, generating and atomically saving one
 * under a cross-process file lock on first use.
 *
 * Reads stay lock-free because writes replace the file atomically via
 * {@link writeFileAtomic}. When the file is absent, {@link withFileLock}
 * serializes creation and re-reads inside the lock so concurrent first runs
 * converge on the same UUID. Read errors (other than `ENOENT`), malformed
 * file contents, and write or lock failures reject with {@link LlmError}
 * (`AUTH`) rather than falling back to a throwaway UUID.
 * @param options - optional path, cancellation signal, and UUID generator overrides.
 * @returns the persisted UUID string.
 */
export async function resolveOrCreateInstallationId(options: InstallationIdOptions = {}): Promise<string> {
  options.signal?.throwIfAborted()
  const file = options.path ?? defaultInstallationIdPath()
  const existing = await readPersistedInstallationId(file)
  if (existing !== undefined) return existing

  try {
    await mkdir(dirname(file), { recursive: true, mode: 0o700 })
  } catch (error: unknown) {
    throw new LlmError(
      `llm-pi-ai: failed to create installation ID directory for ${file}; ensure the parent path is a writable directory`,
      'AUTH',
      { cause: error },
    )
  }

  try {
    return await withFileLock(
      file,
      async () => {
        const raced = await readPersistedInstallationId(file)
        if (raced !== undefined) return raced
        const created = (options.randomUUID ?? randomUUID)()
        await writeFileAtomic(file, `${created}\n`, { mode: 0o600, dirMode: 0o700 })
        return created
      },
      options.signal === undefined ? undefined : { signal: options.signal },
    )
  } catch (error: unknown) {
    if (error instanceof LlmError) throw error
    if (options.signal?.aborted) throw error
    throw new LlmError(
      `llm-pi-ai: failed to persist installation ID at ${file}; ensure the directory is writable`,
      'AUTH',
      { cause: error },
    )
  }
}
