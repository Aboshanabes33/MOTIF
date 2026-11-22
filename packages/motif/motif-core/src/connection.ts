/**
 * Native AI-account connection: detect the official command-line tool, install
 * it when missing, start its own sign-in, and prove the result with one short
 * request. No token is read, copied, or stored.
 *
 * @module @deepseek-ai/dsh-motif-core/connection
 */

import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { hostSignInFacts, detectSignInState } from '@deepseek-ai/dsh-llm-motif-relay/src/failure.ts'
import type { MotifActionResult, MotifBackend, MotifConnection } from './types.ts'

const run = promisify(execFile)

/** Official package each backend installs when its tool is absent. */
const PACKAGES: Readonly<Record<MotifBackend, string>> = {
  'claude-code': '@anthropic-ai/claude-code',
  codex: '@openai/codex',
}

/** Product labels. */
const LABELS: Readonly<Record<MotifBackend, string>> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
}

/** Commands a deployment can override for tests or a non-standard installation. */
export interface MotifCommands {
  /** Claude Code executable (default `claude`). */
  readonly claudeCode: string
  /** Codex executable (default `codex`). */
  readonly codex: string
}

/** Default executable names. */
export const DEFAULT_COMMANDS: MotifCommands = { claudeCode: 'claude', codex: 'codex' }

/** Host integrations replaceable by tests. */
export interface ConnectionInternals {
  /** Environment used for credential paths and child processes. */
  readonly env?: NodeJS.ProcessEnv
  /** Override the existence probe. */
  readonly exists?: (path: string) => boolean
  /** Override `execFile` for version/test calls. */
  readonly exec?: (file: string, args: readonly string[], options: { timeout: number; maxBuffer?: number }) => Promise<{ stdout: string; stderr: string }>
  /** Override the detached sign-in spawn. */
  readonly spawn?: (file: string, args: readonly string[]) => { unref(): void }
}

function commandOf(backend: MotifBackend, commands: MotifCommands): string {
  return backend === 'claude-code' ? commands.claudeCode : commands.codex
}

async function installed(command: string, internals: ConnectionInternals): Promise<boolean> {
  const exec = internals.exec ?? (async (file, args, options) => await run(file, [...args], {
    timeout: options.timeout,
    maxBuffer: options.maxBuffer,
    env: internals.env,
    windowsHide: true,
  }))
  try {
    await exec(command, ['--version'], { timeout: 5_000 })
    return true
  } catch {
    return false
  }
}

/**
 * Read both connection cards without starting a process beyond `--version`.
 * @param commands - executable names.
 * @param internals - test seams.
 * @returns one card per backend.
 */
export async function inspectConnections(
  commands: MotifCommands = DEFAULT_COMMANDS,
  internals: ConnectionInternals = {},
): Promise<MotifConnection[]> {
  const facts = hostSignInFacts(internals.exists === undefined ? {} : { exists: internals.exists })
  if (internals.env !== undefined) {
    // A test environment supplies the credential roots; keep the real platform otherwise.
    Object.assign(facts, { env: internals.env, home: internals.env.HOME ?? internals.env.USERPROFILE ?? facts.home })
  }
  const cards: MotifConnection[] = []
  for (const backend of ['claude-code', 'codex'] as const) {
    const command = commandOf(backend, commands)
    const found = await installed(command, internals)
    const state = detectSignInState(backend, facts)
    const signedIn = state === 'present' ? 'yes' : state === 'absent' ? 'no' : 'unknown'
    cards.push({
      backend,
      label: LABELS[backend],
      installed: found,
      signedIn,
      detail: !found
        ? `Install the official ${LABELS[backend]} tool on this computer.`
        : signedIn === 'no'
          ? `Sign in opens ${LABELS[backend]}'s own page; Motif never sees your password.`
          : signedIn === 'unknown'
            ? 'Run a test request to confirm the sign-in.'
            : `Signed in on this computer.`,
    })
  }
  return cards
}

/**
 * Install the official tool when it is missing.
 * @param backend - backend to install.
 * @param commands - executable names.
 * @param internals - test seams.
 * @returns the outcome and one display sentence.
 */
export async function installBackend(
  backend: MotifBackend,
  commands: MotifCommands = DEFAULT_COMMANDS,
  internals: ConnectionInternals = {},
): Promise<MotifActionResult> {
  const command = commandOf(backend, commands)
  if (await installed(command, internals)) return { ok: true, message: `${LABELS[backend]} is already installed.` }
  const exec = internals.exec ?? (async (file, args, options) => await run(file, [...args], {
    timeout: options.timeout,
    maxBuffer: options.maxBuffer,
    env: internals.env,
    windowsHide: true,
  }))
  try {
    await exec('npm', ['install', '-g', PACKAGES[backend]], { timeout: 600_000, maxBuffer: 8 * 1024 * 1024 })
  } catch (error: unknown) {
    return {
      ok: false,
      message: `Could not install ${LABELS[backend]}. Install ${PACKAGES[backend]} globally, then check again. (${error instanceof Error ? error.message : String(error)})`,
    }
  }
  return await installed(command, internals)
    ? { ok: true, message: `${LABELS[backend]} is installed. The next step is sign-in.` }
    : { ok: false, message: `${LABELS[backend]} still does not answer after installation.` }
}

/**
 * Start the provider's own sign-in flow. The process owns the browser and the
 * credentials; Motif only starts it and later re-reads the native evidence.
 * @param backend - backend to sign in.
 * @param commands - executable names.
 * @param internals - test seams.
 * @returns the outcome and one display sentence.
 */
export async function signInBackend(
  backend: MotifBackend,
  commands: MotifCommands = DEFAULT_COMMANDS,
  internals: ConnectionInternals = {},
): Promise<MotifActionResult> {
  const command = commandOf(backend, commands)
  if (!await installed(command, internals)) {
    return { ok: false, message: `Install the official ${LABELS[backend]} tool first.` }
  }
  try {
    const child = (internals.spawn ?? ((file: string, args: readonly string[]) => spawn(file, [...args], {
      detached: true,
      stdio: 'ignore',
      env: internals.env,
      windowsHide: true,
    })))(command, ['login'])
    child.unref()
  } catch (error: unknown) {
    return {
      ok: false,
      message: `Could not open ${LABELS[backend]} sign-in. Run “${command} login” in a terminal. (${error instanceof Error ? error.message : String(error)})`,
    }
  }
  return {
    ok: true,
    message: `A ${LABELS[backend]} sign-in window opened. Finish it in your browser, then run Test.`,
  }
}

/**
 * Send one short request through the official tool.
 * @param backend - backend to test.
 * @param commands - executable names.
 * @param internals - test seams.
 * @returns the outcome and one display sentence.
 */
export async function testBackend(
  backend: MotifBackend,
  commands: MotifCommands = DEFAULT_COMMANDS,
  internals: ConnectionInternals = {},
): Promise<MotifActionResult> {
  const command = commandOf(backend, commands)
  if (!await installed(command, internals)) {
    return { ok: false, message: `Install the official ${LABELS[backend]} tool first.` }
  }
  const exec = internals.exec ?? (async (file, args, options) => await run(file, [...args], {
    timeout: options.timeout,
    maxBuffer: options.maxBuffer,
    env: internals.env,
    windowsHide: true,
  }))
  const args = backend === 'claude-code'
    ? ['-p', 'Reply with exactly: OK']
    : ['exec', 'Reply with exactly: OK']
  try {
    const result = await exec(command, args, { timeout: 60_000, maxBuffer: 1024 * 1024 })
    const answer = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
    return answer === ''
      ? { ok: false, message: `${LABELS[backend]} answered with no text.` }
      : { ok: true, message: `Test request passed: ${answer.slice(0, 120)}` }
  } catch (error: unknown) {
    const facts = hostSignInFacts(internals.exists === undefined ? {} : { exists: internals.exists })
    const state = detectSignInState(backend, facts)
    const tail = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      message: state === 'absent'
        ? `${LABELS[backend]} is not signed in on this computer. Sign in, then run Test again.`
        : `Test request failed: ${tail.slice(0, 200)}`,
    }
  }
}
