import { describe, expect, it } from 'vitest'
import type { SubagentResult } from '@deepseek-ai/dsh-subagent'
import {
  classifyDiagnostic,
  detectSignInState,
  failureFromError,
  failureFromResult,
  timeoutFailureFor,
} from '../src/failure.ts'
import type { RelayFailureContext } from '../src/failure.ts'

const context = (overrides: Partial<RelayFailureContext> = {}): RelayFailureContext => ({
  backend: 'claude-code',
  timeoutMs: 900_000,
  signIn: 'present',
  ...overrides,
})

const result = (overrides: Partial<SubagentResult>): SubagentResult => ({
  output: [{ type: 'text', text: 'Answer' }],
  stopReason: 'completed',
  ...overrides,
})

describe('detectSignInState', () => {
  it('reports a stored Claude Code credential file', () => {
    const state = detectSignInState('claude-code', {
      platform: 'linux',
      home: '/home/user',
      env: {},
      exists: path => path === '/home/user/.claude/.credentials.json',
    })

    expect(state).toBe('present')
  })

  it('reports an absent Codex sign-in under CODEX_HOME', () => {
    const state = detectSignInState('codex', {
      platform: 'linux',
      home: '/home/user',
      env: { CODEX_HOME: '/brands/codex' },
      exists: path => path === '/brands/codex/auth.json',
    })

    expect(state).toBe('present')
  })

  it('cannot observe the macOS keychain login', () => {
    const state = detectSignInState('claude-code', {
      platform: 'darwin',
      home: '/Users/user',
      env: {},
      exists: () => false,
    })

    expect(state).toBe('unknown')
  })

  it('does not claim a sign-in for an unknown backend', () => {
    expect(detectSignInState('stand-in', { platform: 'linux', home: '/home', env: {}, exists: () => true }))
      .toBe('unknown')
  })
})

describe('failure classification', () => {
  it('reports a usage limit as an actionable limit failure', () => {
    const failure = classifyDiagnostic(
      'Product subagent failure (product: Claude Code; stage: query-run; category: limit)',
      context(),
    )

    expect(failure.kind).toBe('limit-reached')
    expect(failure.code).toBe('QUOTA')
    expect(failure.message).toContain('usage limit')
  })

  it('names the sign-in command when the computer stores no sign-in', () => {
    const failure = classifyDiagnostic(undefined, context({ signIn: 'absent' }))

    expect(failure.kind).toBe('not-signed-in')
    expect(failure.code).toBe('AUTH')
    expect(failure.message).toContain('claude login')
  })

  it('names the Codex sign-in command for the Codex backend', () => {
    const failure = failureFromError(new Error('startup failed'), context({ backend: 'codex', signIn: 'absent' }))

    expect(failure.kind).toBe('not-signed-in')
    expect(failure.message).toContain('codex login')
  })

  it('keeps provider facts in a runtime-unavailable message', () => {
    const failure = classifyDiagnostic(
      'Product subagent failure (product: Codex; stage: initialize; category: unknown; exit code: 1)',
      context({ backend: 'codex' }),
    )

    expect(failure.kind).toBe('runtime-unavailable')
    expect(failure.code).toBe('HTTP_503')
    expect(failure.message).toContain('category: unknown')
  })

  it('maps an exhausted activation pool to the limit failure', () => {
    const failure = failureFromError(Object.assign(new Error('busy'), { code: 'ACTIVATION_LIMIT_REACHED' }), context())

    expect(failure.kind).toBe('limit-reached')
  })

  it('reports an empty completed answer', () => {
    const failure = failureFromResult(result({ output: [{ type: 'text', text: '  ' }] }), context())

    expect(failure?.kind).toBe('empty-answer')
    expect(failure?.code).toBe('EMPTY_RESPONSE')
  })

  it('accepts a completed answer', () => {
    expect(failureFromResult(result({}), context())).toBeUndefined()
  })

  it('reports cancellation without a failure diagnostic', () => {
    expect(failureFromResult(result({ stopReason: 'aborted' }), context())?.kind).toBe('cancelled')
  })

  it('renders the deadline in whole minutes', () => {
    const failure = timeoutFailureFor(context({ timeoutMs: 900_000 }))

    expect(failure.kind).toBe('timeout')
    expect(failure.code).toBe('HTTP_504')
    expect(failure.message).toContain('15 minutes')
  })
})
