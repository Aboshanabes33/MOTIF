/**
 * Failure classification for one relay send. Every outcome maps to one fixed,
 * actionable message and one provider-neutral failure code; the relay never
 * retries on another backend and never hides which backend failed.
 *
 * @module @deepseek-ai/dsh-llm-motif-relay/failure
 */

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { BuiltinLlmFailureCode } from '@deepseek-ai/dsh-llm'
import type { SubagentResult } from '@deepseek-ai/dsh-subagent'

/** Stable reasons a relay send can fail. */
export type RelayFailureKind =
  | 'not-signed-in'
  | 'limit-reached'
  | 'runtime-unavailable'
  | 'timeout'
  | 'cancelled'
  | 'empty-answer'

/** One actionable relay failure. */
export interface RelayFailure {
  /** Stable reason a surface can branch on without reading the message. */
  readonly kind: RelayFailureKind
  /** Complete, actionable sentence shown to the user. */
  readonly message: string
  /** Provider-neutral LLM failure code carried by the terminal stream finish. */
  readonly code: BuiltinLlmFailureCode
}

/** Fixed deployment facts one classification needs. */
export interface RelayFailureContext {
  /** Registered command-line backend name (`claude-code`, `codex`, or a deployment name). */
  readonly backend: string
  /** Deadline applied to one send. */
  readonly timeoutMs: number
  /** Whether this computer stores a sign-in for the backend. */
  readonly signIn: SignInState
}

/** Whether a local sign-in can be observed, cannot be observed, or is absent. */
export type SignInState = 'present' | 'absent' | 'unknown'

/** Inputs for {@link detectSignInState}, all explicit so tests need no real home directory. */
export interface SignInFacts {
  /** Node platform name; the macOS keychain hides Claude Code sign-in from this check. */
  readonly platform: string
  /** User home directory supplying the default configuration folder. */
  readonly home: string
  /** Launch environment supplying `CLAUDE_CONFIG_DIR` / `CODEX_HOME`. */
  readonly env: Readonly<Record<string, string | undefined>>
  /** Synchronous existence check for one absolute path. */
  readonly exists: (path: string) => boolean
}

const DISPLAY_NAMES: Readonly<Record<string, string>> = {
  'claude-code': 'Claude Code',
  'codex': 'Codex',
}

const SIGN_IN_COMMANDS: Readonly<Record<string, string>> = {
  'claude-code': 'claude login',
  'codex': 'codex login',
}

function displayName(backend: string): string {
  return DISPLAY_NAMES[backend] ?? backend
}

function signInCommand(backend: string): string | undefined {
  return SIGN_IN_COMMANDS[backend]
}

function configurationFile(backend: string, facts: SignInFacts): { path: string; hidden: boolean } | undefined {
  switch (backend) {
    case 'claude-code': {
      const configured = facts.env['CLAUDE_CONFIG_DIR']
      const directory = configured ?? join(facts.home, '.claude')
      // The default macOS login lives in the keychain, not in this file, so
      // absence proves nothing there. An explicit configuration directory is
      // always file-backed.
      const hidden = configured === undefined && facts.platform === 'darwin'
      return { path: join(directory, '.credentials.json'), hidden }
    }
    case 'codex': {
      const directory = facts.env['CODEX_HOME'] ?? join(facts.home, '.codex')
      return { path: join(directory, 'auth.json'), hidden: false }
    }
    default:
      return undefined
  }
}

/**
 * Decide whether this computer stores a sign-in the backend can read.
 * @param backend - registered command-line backend name.
 * @param facts - platform, home directory, launch environment, and existence check.
 * @returns `present`, `absent`, or `unknown` when the backend or platform hides the answer.
 */
export function detectSignInState(backend: string, facts: SignInFacts): SignInState {
  const file = configurationFile(backend, facts)
  if (file === undefined || file.hidden) return 'unknown'
  return facts.exists(file.path) ? 'present' : 'absent'
}

/**
 * Build {@link SignInFacts} from the running Host.
 * @param options - optional existence check override for tests.
 * @returns facts describing this computer's native configuration folders.
 */
export function hostSignInFacts(
  options: { readonly exists?: (path: string) => boolean } = {},
): SignInFacts {
  const exists = options.exists ?? ((path: string): boolean => {
    try {
      return existsSync(path)
    } catch (_probeFailed) {
      return false
    }
  })
  return {
    platform: process.platform,
    home: homedir(),
    env: process.env,
    exists,
  }
}


/**
 * The failure reported when this computer stores no sign-in for the backend.
 * @param context - backend identity, deadline, and sign-in state.
 * @returns the actionable sign-in failure.
 */
export function missingSignInFailure(context: RelayFailureContext): RelayFailure {
  const backend = context.backend
  const command = signInCommand(backend)
  const action = command === undefined
    ? `Sign in to ${displayName(backend)} on this computer`
    : `Run "${command}" in a terminal as the same user that runs Motif`
  return {
    kind: 'not-signed-in',
    message: `${displayName(backend)} is not signed in on this computer. ${action}, then send the Edit Request again.`,
    code: 'AUTH',
  }
}

function limitReached(backend: string): RelayFailure {
  return {
    kind: 'limit-reached',
    message: `${displayName(backend)} reached its usage limit for this account. Wait until the limit resets, then send the Edit Request again.`,
    code: 'QUOTA',
  }
}

function runtimeUnavailable(backend: string, detail?: string): RelayFailure {
  const suffix = detail === undefined ? '' : ` (${detail})`
  return {
    kind: 'runtime-unavailable',
    message: `The ${displayName(backend)} runtime did not answer. Check that the ${displayName(backend)} plugin is installed and signed in, then try again.${suffix}`,
    code: 'HTTP_503',
  }
}

function timeoutFailure(context: RelayFailureContext): RelayFailure {
  const minutes = Math.max(1, Math.round(context.timeoutMs / 60_000))
  return {
    kind: 'timeout',
    message: `${displayName(context.backend)} did not finish within ${minutes} minutes, so Motif stopped the run. Check the Brand folder for partial changes, then try a smaller Edit Request.`,
    code: 'HTTP_504',
  }
}

/**
 * Classify one failed command-line diagnostic.
 *
 * Providers publish only fixed, safe facts: product, lifecycle stage, category,
 * and observed process outcome. Classification reads those facts, never raw
 * product text.
 * @param diagnostic - provider diagnostic, when the provider supplied one.
 * @param context - backend identity, deadline, and sign-in state.
 * @returns the matching actionable failure.
 */
export function classifyDiagnostic(
  diagnostic: string | undefined,
  context: RelayFailureContext,
): RelayFailure {
  const category = diagnostic === undefined ? undefined : /category: ([a-z-]+)/u.exec(diagnostic)?.[1]
  if (category === 'limit') return limitReached(context.backend)
  if (context.signIn === 'absent') return missingSignInFailure(context)
  if (diagnostic === undefined) return runtimeUnavailable(context.backend)
  return runtimeUnavailable(context.backend, diagnostic)
}

/**
 * Classify one settled subagent result.
 * @param result - terminal result returned by the command-line backend.
 * @param context - backend identity, deadline, and sign-in state.
 * @returns the failure to report, or undefined for a successful answer or a local cancellation.
 */
export function failureFromResult(
  result: SubagentResult,
  context: RelayFailureContext,
): RelayFailure | undefined {
  if (result.stopReason === 'completed') {
    const text = result.output
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('')
      .trim()
    if (text.length === 0) {
      return {
        kind: 'empty-answer',
        message: `${displayName(context.backend)} finished without an answer. Send the Edit Request again, or check the Brand folder for partial changes.`,
        code: 'EMPTY_RESPONSE',
      }
    }
    return undefined
  }
  if (result.stopReason === 'aborted') return cancelledFailure(context)
  return classifyDiagnostic(result.diagnostic, context)
}

/**
 * Classify a rejection from the subagent start boundary.
 * @param error - rejection raised before the run published.
 * @param context - backend identity, deadline, and sign-in state.
 * @returns the matching actionable failure.
 */
export function failureFromError(
  error: unknown,
  context: RelayFailureContext,
): RelayFailure {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? (error as { readonly code?: unknown }).code
    : undefined
  if (code === 'ACTIVATION_LIMIT_REACHED' || code === 'DRAINING') {
    return limitReached(context.backend)
  }
  const message = error instanceof Error ? error.message : ''
  if (message.includes('category: limit')) return limitReached(context.backend)
  if (message.includes('Product subagent failure')) {
    return classifyDiagnostic(message, context)
  }
  if (message.includes('cancel') || message.includes('abort')) return cancelledFailure(context)
  return context.signIn === 'absent'
    ? missingSignInFailure(context)
    : runtimeUnavailable(context.backend)
}

/**
 * The failure reported when the user cancels the send.
 * @param context - backend identity, deadline, and sign-in state.
 * @returns the cancellation failure.
 */
export function cancelledFailure(context: RelayFailureContext): RelayFailure {
  return {
    kind: 'cancelled',
    message: `The ${displayName(context.backend)} run was cancelled.`,
    code: 'ABORTED',
  }
}

/**
 * The failure reported when the deadline expires.
 * @param context - backend identity and the deadline that expired.
 * @returns the timeout failure.
 */
export function timeoutFailureFor(context: RelayFailureContext): RelayFailure {
  return timeoutFailure(context)
}
