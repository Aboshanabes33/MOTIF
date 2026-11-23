/**
 * Native AI-account connection: detect the official command-line tool, install
 * it when missing, start its own sign-in, and prove the result with one short
 * request. No token is read, copied, or stored.
 *
 * @module @deepseek-ai/dsh-motif-core/connection
 */

import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { resolveWindowsCommand } from './windows-command.ts'
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
  /** Platform override for executable resolution (default `process.platform`). */
  readonly platform?: string
  /** Environment used for credential paths and child processes. */
  readonly env?: NodeJS.ProcessEnv
  /** Override the existence probe. */
  readonly exists?: (path: string) => boolean
  /** Override `execFile` for version/test calls. */
  readonly exec?: (file: string, args: readonly string[], options: {
    timeout: number
    maxBuffer?: number
  }) => Promise<{ stdout: string; stderr: string }>
  /** Override the detached sign-in spawn. */
  readonly spawn?: (file: string, args: readonly string[]) => SignInChild
  /** Override the platform (default `process.platform`). */
  readonly platform?: NodeJS.Platform
}

/** The slice of a spawned sign-in process the launch confirmation needs. */
export interface SignInChild {
  unref(): void
  on(event: 'error', listener: (error: Error) => void): unknown
  on(event: 'spawn', listener: () => void): unknown
}

const DEFAULT_INTERNALS: ConnectionInternals = {}
const PROBE_TTL_MS = 3_000
interface ProbeEntry { expires: number; generation: number; promise: Promise<boolean> }
const probes = new WeakMap<ConnectionInternals, Map<string, ProbeEntry>>()
const generations = new WeakMap<ConnectionInternals, Map<string, number>>()
function probeKey(backend: MotifBackend, commands: MotifCommands): string {
  return `${backend}:${commandOf(backend, commands)}`
}
/** Invalidate only this host context and provider. In-flight stale probes cannot repopulate the cache. */
export function invalidateConnectionProbe(backend: MotifBackend, commands = DEFAULT_COMMANDS, internals = DEFAULT_INTERNALS): void {
  const key = probeKey(backend, commands)
  probes.get(internals)?.delete(key)
  let epochs = generations.get(internals)
  if (!epochs) { epochs = new Map(); generations.set(internals, epochs) }
  epochs.set(key, (epochs.get(key) ?? 0) + 1)
}
function probe(backend: MotifBackend, commands: MotifCommands, internals: ConnectionInternals): Promise<boolean> {
  const key = probeKey(backend, commands)
  let cache = probes.get(internals)
  if (!cache) { cache = new Map(); probes.set(internals, cache) }
  const cached = cache.get(key)
  if (cached && cached.expires > Date.now()) return cached.promise
  const generation = generations.get(internals)?.get(key) ?? 0
  const entry: ProbeEntry = { expires: Infinity, generation, promise: installed(commandOf(backend, commands), internals) }
  cache.set(key, entry)
  void entry.promise.finally(() => {
    if (cache?.get(key) === entry) entry.expires = Date.now() + PROBE_TTL_MS
  })
  return entry.promise
}

function commandOf(backend: MotifBackend, commands: MotifCommands): string {
  return backend === 'claude-code' ? commands.claudeCode : commands.codex
}

/**
 * Spell one command the way the current platform can execute it directly.
 *
 * npm-installed command-line tools ship a `<name>.cmd` shim on Windows, and
 * `execFile`/`spawn` resolve no `PATHEXT` there, so a bare name cannot run
 * without the extension. Only bare names gain the extension: an absolute or
 * relative path (with separators) or a name already carrying one is used
 * exactly as configured, which keeps paths with spaces intact - arguments
 * always travel as an array and nothing is interpolated through a shell.
 * @param command - configured executable name or path.
 * @param platform - platform the spelling is for.
 * @returns the executable to pass to `execFile`/`spawn`.
 */
export function platformExecutable(command: string, platform: string): string {
  const bare = !command.includes('/') && !command.includes('\\')
  const hasExtension = /\.[a-z0-9]+$/i.test(command)
  return platform === 'win32' && bare && !hasExtension ? `${command}.cmd` : command
}

/** Platform one operation resolves executables for. */
function platformOf(internals: ConnectionInternals): string {
  return internals.platform ?? process.platform
}

/** One display sentence from a failed process start. */
function startError(error: unknown, label: string, platform: string): string {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  if (code === 'ENOENT') {
    return platform === 'win32'
      ? `${label} was not found. On Windows the tool runs through its .cmd shim; install Node.js (which provides npm.cmd), then check again.`
      : `${label} was not found. Install Node.js (which provides npm), then check again.`
  }
  const stderr = (error as { stderr?: string } | undefined)?.stderr?.trim()
  const tail = stderr !== undefined && stderr !== '' ? stderr : error instanceof Error ? error.message : String(error)
  return `${label} could not run: ${tail.slice(0, 300)}`
}

async function installed(command: string, internals: ConnectionInternals): Promise<boolean> {
  const exec = internals.exec ?? (async (file, args, options) => {
    const launch = resolveWindowsCommand(file, args, { platform: internals.platform, env: internals.env })
    return await run(launch.file, [...launch.args], {
      timeout: options.timeout,
      maxBuffer: options.maxBuffer,
      env: internals.env,
      windowsHide: true,
    }) })
  try {
    await exec(platformExecutable(command, platformOf(internals)), ['--version'], { timeout: 5_000 })
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
  internals: ConnectionInternals = DEFAULT_INTERNALS,
): Promise<MotifConnection[]> {
  const facts = hostSignInFacts(internals.exists === undefined ? {} : { exists: internals.exists })
  if (internals.env !== undefined) {
    // A test environment supplies the credential roots; keep the real platform otherwise.
    Object.assign(facts, { env: internals.env, home: internals.env.HOME ?? internals.env.USERPROFILE ?? facts.home })
  }
  const cards: MotifConnection[] = []
  for (const backend of ['claude-code', 'codex'] as const) {
    const found = await probe(backend, commands, internals)
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
            : 'Signed in on this computer.',
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
  internals: ConnectionInternals = DEFAULT_INTERNALS,
): Promise<MotifActionResult> {
  invalidateConnectionProbe(backend, commands, internals)
  try {
    const command = commandOf(backend, commands)
    if (await installed(command, internals)) return { ok: true, message: `${LABELS[backend]} is already installed.` }
    const exec = internals.exec ?? (async (file, args, options) => {
      const launch = resolveWindowsCommand(file, args, { platform: internals.platform, env: internals.env })
      return await run(launch.file, [...launch.args], {
        timeout: options.timeout,
        maxBuffer: options.maxBuffer,
        env: internals.env,
        windowsHide: true,
      }) })
    const platform = platformOf(internals)
    try {
      // One npm process installs the official package; its output is captured
      // whole, so a failure message can carry npm's own tail. The install can
      // take several minutes on a slow network, which the button's busy state
      // covers while this request runs.
      await exec(platformExecutable('npm', platform), ['install', '-g', PACKAGES[backend]], { timeout: 600_000, maxBuffer: 8 * 1024 * 1024 })
    } catch (error: unknown) {
      return {
        ok: false,
        message: `Could not install ${LABELS[backend]} - ${startError(error, 'npm', platform)} You can also run “npm install -g ${PACKAGES[backend]}” in a terminal, then check again.`,
      }
    }
    return await installed(command, internals)
      ? { ok: true, message: `${LABELS[backend]} is installed. The next step is sign-in.` }
      : { ok: false, message: `${LABELS[backend]} still does not answer after installation.` }
  } finally { invalidateConnectionProbe(backend, commands, internals) }
}

const LABELS_COMMAND = 'Motif'

/** One way to open an interactive terminal running the sign-in command. */
interface TerminalLauncher {
  readonly file: string
  readonly args: (command: string) => readonly string[]
}

/**
 * Terminal launchers for the host platform, most likely first. `login` is an
 * interactive flow: it needs a real terminal the user can see and answer.
 */
function terminalLaunchers(platform: NodeJS.Platform): readonly TerminalLauncher[] {
  if (platform === 'darwin') {
    return [{
      file: 'osascript',
      args: command => ['-e', 'tell application "Terminal" to activate', '-e', `tell application "Terminal" to do script "${command} login"`],
    }]
  }
  if (platform === 'win32') {
    return [{ file: 'cmd', args: command => ['/c', 'start', `${LABELS_COMMAND} sign-in`, 'cmd', '/k', command, 'login'] }]
  }
  return [
    { file: 'x-terminal-emulator', args: command => ['-e', command, 'login'] },
    { file: 'gnome-terminal', args: command => ['--', command, 'login'] },
    { file: 'konsole', args: command => ['-e', command, 'login'] },
  ]
}

/** True when this platform has any terminal launcher worth trying. */
function hasTerminalLauncher(platform: NodeJS.Platform): boolean {
  return platform === 'darwin' || platform === 'win32' || platform === 'linux' || platform === 'freebsd'
}

/**
 * Terminal launchers interpolate the command into a host string (AppleScript
 * on macOS, `cmd start` arguments on Windows), so a configured command name
 * carrying quoting or command-separator characters would change what the
 * terminal runs. Such a command skips the windowed launchers entirely; the
 * detached spawn fallback passes arguments as an array and stays safe.
 * @param command - configured executable name or path.
 * @returns true when interpolation cannot alter the launched command.
 */
export function terminalSafeCommand(command: string): boolean {
  return command !== '' && !/["\\`$&|;<>%^\r\n]/.test(command)
}

/**
 * Confirm a detached child actually started: resolve on the `spawn` event,
 * reject on the `error` event. Merely calling spawn() proves nothing.
 */
function confirmLaunch(child: SignInChild): Promise<void> {
  return new Promise<void>((resolvePromise, reject) => {
    child.on('error', reject)
    child.on('spawn', () => { resolvePromise() })
  })
}

/**
 * Start the provider's own sign-in flow. The process owns the browser and the
 * credentials; Motif only starts it and later re-reads the native evidence.
 * `login` is interactive, so Motif first tries to open it in a real terminal
 * window; without any terminal it starts the command detached and says so
 * honestly. Success is only reported after the launch is confirmed.
 * @param backend - backend to sign in.
 * @param commands - executable names.
 * @param internals - test seams.
 * @returns the outcome and one display sentence.
 */
export async function signInBackend(
  backend: MotifBackend,
  commands: MotifCommands = DEFAULT_COMMANDS,
  internals: ConnectionInternals = DEFAULT_INTERNALS,
): Promise<MotifActionResult> {
  invalidateConnectionProbe(backend, commands, internals)
  try {
    const command = commandOf(backend, commands)
    if (!await installed(command, internals)) {
      return { ok: false, message: `Install the official ${LABELS[backend]} tool first.` }
    }
    const platform = internals.platform ?? process.platform
    const exec = internals.exec ?? (async (file, args, options) => await run(file, [...args], {
      timeout: options.timeout,
      maxBuffer: options.maxBuffer,
      env: internals.env,
      windowsHide: true,
    }))
    if (hasTerminalLauncher(platform) && terminalSafeCommand(command)) {
      for (const launcher of terminalLaunchers(platform)) {
        try {
          await exec(launcher.file, launcher.args(command), { timeout: 10_000 })
          return {
            ok: true,
            message: `A terminal opened running \`${command} login\`. Finish the sign-in there - it opens ${LABELS[backend]}'s own page - then run Test.`,
          }
        } catch {
          // That terminal is not available; try the next one.
        }
      }
    }
    const spawnSignIn = internals.spawn ?? ((file: string, args: readonly string[]): SignInChild => {
      const launch = resolveWindowsCommand(file, args, { platform: internals.platform, env: internals.env })
      return spawn(launch.file, [...launch.args], {
        detached: true,
        stdio: 'ignore',
        env: internals.env,
        windowsHide: true,
      })
    })
    try {
      const child = spawnSignIn(platformExecutable(command, platform), ['login'])
      await confirmLaunch(child)
      child.unref()
    } catch (error: unknown) {
      return {
        ok: false,
        message: `Could not open ${LABELS[backend]} sign-in - ${startError(error, command, platform)} Run “${command} login” in a terminal.`,
      }
    }
    return {
      ok: true,
      message: `Started \`${command} login\` in the background, but no terminal could be opened for it. If nothing asks you to sign in, run \`${command} login\` in a terminal yourself, then run Test.`,
    }
  } finally { invalidateConnectionProbe(backend, commands, internals) }
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
  internals: ConnectionInternals = DEFAULT_INTERNALS,
): Promise<MotifActionResult> {
  const command = commandOf(backend, commands)
  if (!await installed(command, internals)) {
    return { ok: false, message: `Install the official ${LABELS[backend]} tool first.` }
  }
  const exec = internals.exec ?? (async (file, args, options) => {
    const launch = resolveWindowsCommand(file, args, { platform: internals.platform, env: internals.env })
    return await run(launch.file, [...launch.args], {
      timeout: options.timeout,
      maxBuffer: options.maxBuffer,
      env: internals.env,
      windowsHide: true,
    }) })
  const args = backend === 'claude-code'
    ? ['-p', 'Reply with exactly: OK']
    : ['exec', 'Reply with exactly: OK']
  try {
    const result = await exec(platformExecutable(command, platformOf(internals)), args, { timeout: 60_000, maxBuffer: 1024 * 1024 })
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
