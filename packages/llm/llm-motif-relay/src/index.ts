/**
 * Motif relay: a model route that hands the user's Edit Request to a
 * command-line agent (Claude Code or Codex) running in the Brand folder and
 * returns only that agent's final answer to the same conversation.
 *
 * The route composes the existing subagent providers; it starts no agent until
 * a Session sends a message, streams no progress, and never switches backend on
 * its own.
 *
 * @module @deepseek-ai/dsh-llm-motif-relay
 */

import type { Context } from '@deepseek-ai/cordis'
import { parseCredentialKey } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-credentials'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-working-directory'
import { RelayAdapter } from './adapter.ts'
import type { RelayHost, RelayModel } from './adapter.ts'
import { readBrandSnapshot } from './brand.ts'
import { hostSignInFacts } from './failure.ts'
import type { RelayStatusEvent } from './status.ts'

export const name = 'motif-relay'
export const inject = ['llm', 'agents', 'subagents']

/** Default model-route name on `ctx.llm`. */
const DEFAULT_PROVIDER_NAME = 'motif-relay'
/** Default command-line backend: the Claude Code subagent provider's registry name. */
const DEFAULT_BACKEND = 'claude-code'

/** One model a relay route offers, mapped to its own subagent provider instance. */
export interface RelayModelConfig {
  /** Model id the Session stores and the request carries. Defaults to the provider name. */
  id?: string
  /** Registered subagent provider instance that runs this model. Defaults to the route backend. */
  provider?: string
  /** Selector label. Defaults to the model id. */
  name?: string
  /** Optional user-facing distinction between otherwise similar models. */
  description?: string
  /** Command-line backend behind the provider, for sign-in instructions and status. Defaults to the route backend. */
  backend?: string
}

/**
 * Deployment-owned relay settings. Permission mode and every other
 * command-line option belong to the subagent provider instance; this plugin
 * fixes only the route, the backends and models it offers, the Brand files, and
 * the budgets.
 */
export interface Config {
  /** Model-route name registered on `ctx.llm` (default `motif-relay`). */
  providerName?: string
  /** Registered subagent backend that runs each send when `models` is omitted (default `claude-code`). */
  backend?: string
  /** Model id selected by default (default: the first offered model). */
  model?: string
  /**
   * Models this route offers. Each entry names a registered subagent provider
   * instance, so one provider row per native model is what makes a real
   * selector possible. Omitted means one model: the route backend itself.
   */
  models?: RelayModelConfig[]
  /** Selector label for this route (default: the backend name). */
  displayName?: string
  /** Brand definition file relative to the Brand folder (default `brand.md`). */
  brandFile?: string
  /** Timeline directory relative to the Brand folder (default `timeline`). */
  timelineDir?: string
  /** Timeline file extensions carried into the task (default `['.md', '.json']`). */
  timelineExtensions?: string[]
  /** Timeline files carried by one task (default `20`). */
  maxTimelineFiles?: number
  /** Timeline text bytes carried by one task (default `64000`). */
  maxTimelineBytes?: number
  /** Earlier conversation messages carried into the task (default `6`). */
  conversationMessages?: number
  /** Earlier conversation characters carried into the task (default `4000`). */
  conversationChars?: number
  /** Deadline for one send in milliseconds (default `900000`, fifteen minutes). */
  timeoutMs?: number
  /**
   * Native sign-in preflight (default `auto`). `skip` assumes a sign-in the Host
   * cannot see — for example credentials supplied through the provider row's `env`.
   */
  /** Enable Motif stored-key preflight only for routes wired to credential records. */
  storedCredentials?: boolean
  signInCheck?: 'auto' | 'skip'
}

/** Schemastery declaration of every accepted relay setting. */
export const Config: z<Config> = z.object({
  providerName: z.string().min(1).default(DEFAULT_PROVIDER_NAME),
  backend: z.string().min(1).default(DEFAULT_BACKEND),
  model: z.string().min(1),
  models: z.array(z.object({
    id: z.string().min(1),
    provider: z.string().min(1),
    name: z.string().min(1),
    description: z.string(),
    backend: z.string().min(1),
  })),
  displayName: z.string().min(1),
  brandFile: z.string().min(1).default('brand.md'),
  timelineDir: z.string().min(1).default('timeline'),
  timelineExtensions: z.array(z.string().min(1)).default(['.md', '.json']),
  maxTimelineFiles: z.number().default(20),
  maxTimelineBytes: z.number().default(64_000),
  conversationMessages: z.number().default(6),
  conversationChars: z.number().default(4_000),
  timeoutMs: z.number().default(900_000),
  storedCredentials: z.boolean().default(false),
  signInCheck: z.union([z.const('auto'), z.const('skip')]).default('auto'),
})

/** Every optional field with its default materialized. */
type ResolvedConfig = Required<Omit<Config, 'models'>> & { models: RelayModel[] }

function assertPositiveInteger(field: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`motif-relay: ${field} must be a positive safe integer, got ${value}`)
  }
}

/**
 * Resolve one configuration generation, failing loud on an unusable value.
 * @param config - accepted plugin configuration.
 * @returns every field with its default materialized.
 */
export function resolveConfig(config: Config): ResolvedConfig {
  const backend = config.backend ?? DEFAULT_BACKEND
  const providerName = config.providerName ?? DEFAULT_PROVIDER_NAME
  const brandFile = config.brandFile ?? 'brand.md'
  const timelineDir = config.timelineDir ?? 'timeline'
  const extensions = config.timelineExtensions ?? ['.md', '.json']
  for (const extension of extensions) {
    if (!extension.startsWith('.')) {
      throw new Error(`motif-relay: timelineExtensions entries must start with a dot, got ${JSON.stringify(extension)}`)
    }
  }
  const models: RelayModel[] = (config.models ?? []).map((entry) => {
    const provider = entry.provider ?? backend
    const id = entry.id ?? provider
    return {
      id,
      provider,
      name: entry.name ?? id,
      ...entry.description === undefined ? {} : { description: entry.description },
      backend: entry.backend ?? backend,
    }
  })
  const offered = models.length === 0
    ? [{ id: config.model ?? backend, provider: backend, name: config.displayName ?? config.model ?? backend, backend }]
    : models
  const seen = new Set<string>()
  for (const model of offered) {
    if (seen.has(model.id)) throw new Error(`motif-relay: duplicate model id ${JSON.stringify(model.id)}`)
    seen.add(model.id)
    if (model.id === '') throw new Error('motif-relay: every model needs an id')
    if (model.provider === '') throw new Error('motif-relay: every model needs a provider')
  }
  const firstOffered = offered.at(0)
  if (firstOffered === undefined) throw new Error('motif-relay: models must not be empty')
  const defaultModel = config.model ?? firstOffered.id
  if (!seen.has(defaultModel)) {
    throw new Error(`motif-relay: model ${JSON.stringify(defaultModel)} is not in models (${[...seen].join(', ')})`)
  }
  const resolved: ResolvedConfig = {
    providerName,
    backend,
    model: defaultModel,
    models: offered,
    displayName: config.displayName ?? backend,
    brandFile,
    timelineDir,
    timelineExtensions: extensions,
    maxTimelineFiles: config.maxTimelineFiles ?? 20,
    maxTimelineBytes: config.maxTimelineBytes ?? 64_000,
    conversationMessages: config.conversationMessages ?? 6,
    conversationChars: config.conversationChars ?? 4_000,
    timeoutMs: config.timeoutMs ?? 900_000,
    storedCredentials: config.storedCredentials ?? false,
    signInCheck: config.signInCheck ?? 'auto',
  }
  assertPositiveInteger('maxTimelineFiles', resolved.maxTimelineFiles)
  assertPositiveInteger('maxTimelineBytes', resolved.maxTimelineBytes)
  assertPositiveInteger('conversationMessages', resolved.conversationMessages)
  assertPositiveInteger('conversationChars', resolved.conversationChars)
  assertPositiveInteger('timeoutMs', resolved.timeoutMs)
  return resolved
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * One relay send reached a coarse state. `finished` and `failed` are terminal;
     * a cancelled send emits no terminal state because the turn itself reports it.
     * @mode emit
     * @param event - Session, backend, and state reached.
     */
    'motif-relay/status'(event: RelayStatusEvent): void
  }
}

/**
 * Register the relay model route over the configured subagent providers.
 * @param ctx - context carrying the LLM, Agent, and subagent seams.
 * @param config - route, offered models, Brand-file rules, and budgets.
 */
export function apply(ctx: Context, config: Config): void {
  const resolved = resolveConfig(config)
  const host: RelayHost = {
    hasApiKey: async (backend) => {
      if (!resolved.storedCredentials) return false
      const provider = backend === 'claude-code' ? 'anthropic' : backend === 'codex' ? 'openai' : undefined
      if (provider === undefined) return false
      try {
        const credentials = ctx.get('credentials')
        if (credentials === undefined) return false
        const record = await credentials.readRecord(parseCredentialKey(`motif/${provider}`))
        return record?.kind === 'api-key' && !!record.key?.trim()
      } catch {
        throw new Error('Could not inspect the stored API key. Check Settings > AI; no fallback was attempted.')
      }
    },
    resolve: (sessionId) => {
      const agent = ctx.agents.get(sessionId)
      if (agent === undefined) return undefined
      const directory = ctx.get('workingDirectory')
      const brandRoot = directory === undefined
        ? agent.session.header.cwd ?? process.cwd()
        : directory.get(agent.session)
      return { agent, brandRoot }
    },
    start: spec => ctx.subagents.startActivation({
      provider: spec.provider,
      parent: spec.parent,
      prompt: [...spec.prompt],
      label: 'motif-relay',
      delivery: 'caller',
      signal: spec.signal,
    }),
    readBrand: brandRoot => readBrandSnapshot(brandRoot, {
      brandFile: resolved.brandFile,
      timelineDir: resolved.timelineDir,
      timelineExtensions: resolved.timelineExtensions,
      maxTimelineFiles: resolved.maxTimelineFiles,
      maxTimelineBytes: resolved.maxTimelineBytes,
    }),
    status: (sessionId, backend, model, status) => {
      ctx.emit('motif-relay/status', { sessionId, backend, model, status })
    },
  }
  ctx.effect(() => ctx.llm.registerAdapter([resolved.providerName], new RelayAdapter({
    models: resolved.models,
    defaultModel: resolved.model,
    displayName: resolved.displayName,
    host,
    limits: {
      brand: {
        brandFile: resolved.brandFile,
        timelineDir: resolved.timelineDir,
        timelineExtensions: resolved.timelineExtensions,
        maxTimelineFiles: resolved.maxTimelineFiles,
        maxTimelineBytes: resolved.maxTimelineBytes,
      },
      conversation: {
        maxMessages: resolved.conversationMessages,
        maxChars: resolved.conversationChars,
      },
      timeoutMs: resolved.timeoutMs,
    },
    signIn: hostSignInFacts(resolved.signInCheck === 'skip' ? { exists: () => true } : {}),
  })), 'motif-relay: model route')

  ctx.logger.info(
    'motif-relay: registered %s with %d model(s) over backend %s',
    resolved.providerName,
    resolved.models.length,
    resolved.backend,
  )
}

export type * from './adapter.ts'
export type * from './brand.ts'
export type * from './conversation.ts'
export type * from './failure.ts'
export type * from './status.ts'
export type * from './task.ts'
export { buildRelayTask } from './task.ts'
export { conversationSummary, latestEditRequest } from './conversation.ts'
export { readBrandSnapshot } from './brand.ts'
export {
  cancelledFailure,
  classifyDiagnostic,
  detectSignInState,
  failureFromError,
  failureFromResult,
  missingSignInFailure,
  timeoutFailureFor,
} from './failure.ts'
