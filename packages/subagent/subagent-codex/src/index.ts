/**
 * Profile-named Codex one-shot subagent provider. Every accepted run starts a
 * fresh official package-local Codex wrapper with `app-server --stdio` in the
 * delegating Session's workspace and publishes only after an ephemeral thread exists.
 *
 * @module @deepseek-ai/dsh-subagent-codex
 */

import type { Context } from '@deepseek-ai/cordis'
import { parseCredentialKey, redactCredential } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-credentials'
import z from '@deepseek-ai/schemastery'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import {
  assertPositiveFinite,
  NO_START_CAPABILITIES,
  assertUsableCwd,
  type ResolvedSubagentStartRequest,
  type SubagentCapabilities,
  type SubagentProvider,
} from '@deepseek-ai/dsh-subagent'
import {
  CODEX_PERMISSION_MODES,
  DEFAULT_CODEX_PERMISSION_MODE,
  DEFAULT_DISPOSE_GRACE_MS,
  codexStartupFailure,
  startCodexRun,
  type CodexPermissionMode,
  type CodexRunSpec,
} from './run.ts'

export const name = 'subagent-codex'
export const inject = ['subagents', 'subprocess']

const DEFAULT_PROVIDER_NAME = 'codex'

/** Deployment-owned model, permission, environment, and process-release settings. */
export interface Config {
  /** Provider name on `ctx.subagents` (default `codex`). */
  providerName?: string
  /** Native Codex model fixed for this instance; omitted to inherit Codex settings. */
  model?: string
  /**
   * Explicit environment entries layered over the subprocess seam's
   * credential-scrubbed parent environment.
   */
  env?: Record<string, string>
  /** Host record resolved fresh for each run. A saved key wins over CLI login. */
  credentialRecord?: string
  /** Native non-interactive permission mode fixed for this Provider instance. */
  permissionMode?: CodexPermissionMode
  /** Grace in milliseconds between app-server managed-range termination tiers. */
  disposeGraceMs?: number
}

export const Config: z<Config> = z.object({
  providerName: z.string().min(1).default(DEFAULT_PROVIDER_NAME),
  model: z.string().min(1),
  env: z.dict(z.string()).default({}),
  credentialRecord: z.string().min(1),
  permissionMode: z.union([...CODEX_PERMISSION_MODES])
    .default(DEFAULT_CODEX_PERMISSION_MODE),
  disposeGraceMs: z.number().default(DEFAULT_DISPOSE_GRACE_MS),
})

type ResolvedConfig = Omit<Required<Config>, 'model' | 'credentialRecord'> & Pick<Config, 'model' | 'credentialRecord'>

class CodexProvider implements SubagentProvider {
  readonly capabilities: SubagentCapabilities = NO_START_CAPABILITIES
  readonly inheritsParentContext = false

  constructor(
    readonly name: string,
    private readonly ctx: Context,
    private readonly config: ResolvedConfig,
  ) {}

  async start(request: ResolvedSubagentStartRequest) {
    let cwd: string
    try {
      cwd = assertUsableCwd('subagent-codex', 'child cwd', request.cwd)
    } catch (error: unknown) {
      if (request.signal.aborted) {
        throw new Error(
          'subagent-codex: request was aborted before app-server startup',
        )
      }
      throw codexStartupFailure(error)
    }
    let apiKey: string | undefined
    if (this.config.credentialRecord !== undefined) {
      try {
        const store = this.ctx.get('credentials')
        if (store === undefined) throw new Error()
        const record = await store.readRecord(parseCredentialKey(this.config.credentialRecord))
        if (record !== undefined) {
          if (record.kind !== 'api-key' || !record.key?.trim()) throw new Error()
          apiKey = record.key
        }
      } catch {
        throw new Error('Could not read the stored openai key. Check Settings > AI; no other authentication method was tried.')
      }
    }
    const spec: CodexRunSpec = {
      cwd,
      ...this.config.model === undefined ? {} : { model: this.config.model },
      permissionMode: this.config.permissionMode,
      env: this.config.env,
      ...apiKey === undefined ? {} : { apiKey },
      disposeGraceMs: this.config.disposeGraceMs,
      spawn: spawnSpec => this.ctx.subprocess.spawn(spawnSpec),
      onError: (error, stopReason) => {
        if (apiKey !== undefined) {
          this.ctx.logger.warn('OpenAI API-key execution failed; check Settings > AI.')
          return
        }
        this.ctx.logger.warn(
          `subagent-codex "${this.name}": child run failed (${stopReason}): ${error.message}`,
        )
      },
    }
    try {
      const run = await startCodexRun(request, spec)
      if (apiKey === undefined) return run
      const secret = apiKey
      const safeError = () => new Error('OpenAI API-key request failed. Check the key, API access and billing in Settings > AI. No OAuth fallback was attempted.')
      return {
        id: run.id,
        result: run.result.then(result => redactCredential(result, secret), () => { throw safeError() }),
        dispose: async () => { try { await run.dispose() } catch { throw safeError() } },
      }
    } catch (error) {
      if (apiKey === undefined) throw error
      throw new Error('OpenAI API-key runtime could not start. Check the key and runtime in Settings > AI. No OAuth fallback was attempted.')
    }
  }
}

/**
 * Register one Profile-named Codex provider.
 * @param ctx - context carrying shared subagent and subprocess services.
 * @param config - registry name, optional model, permission mode, child environment, and disposal grace.
 */
export function apply(ctx: Context, config: Config): void {
  const resolved: ResolvedConfig = {
    providerName: config.providerName ?? DEFAULT_PROVIDER_NAME,
    ...config.model === undefined ? {} : { model: config.model },
    env: config.env as Record<string, string>,
    ...config.credentialRecord === undefined ? {} : { credentialRecord: config.credentialRecord },
    permissionMode: config.permissionMode ?? DEFAULT_CODEX_PERMISSION_MODE,
    disposeGraceMs: config.disposeGraceMs as number,
  }
  assertPositiveFinite(
    'subagent-codex',
    'disposeGraceMs',
    resolved.disposeGraceMs,
  )
  if (resolved.disposeGraceMs > MAX_TIMER_DELAY_MS) {
    throw new Error(
      `subagent-codex: disposeGraceMs must be no greater than ${MAX_TIMER_DELAY_MS}`,
    )
  }
  ctx.subagents.registerProvider(new CodexProvider(
    resolved.providerName,
    ctx,
    resolved,
  ))
}
