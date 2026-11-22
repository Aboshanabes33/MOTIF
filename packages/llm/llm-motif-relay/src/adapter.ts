/**
 * Model-route adapter that delegates every request to one configured
 * command-line backend and returns only its final answer as the assistant
 * message. The Session, its log, and its turns stay ordinary; only the model
 * call leaves the Host.
 *
 * @module @deepseek-ai/dsh-llm-motif-relay/adapter
 */

import type { Agent } from '@deepseek-ai/dsh-agent'
import type {
  ContentBlock,
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { LlmAdapter, LlmError } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {
  SubagentActivation,
  SubagentResult,
} from '@deepseek-ai/dsh-subagent'
import type { BrandSnapshot, BrandFileConfig } from './brand.ts'
import { conversationSummary, latestEditRequest } from './conversation.ts'
import type { ConversationBudget } from './conversation.ts'
import {
  cancelledFailure,
  detectSignInState,
  failureFromError,
  failureFromResult,
  missingSignInFailure,
  timeoutFailureFor,
} from './failure.ts'
import type { RelayFailure, RelayFailureContext } from './failure.ts'
import type { SignInFacts } from './failure.ts'
import type { RelayStatus } from './status.ts'
import { buildRelayTask } from './task.ts'

/** Live Session target of one relay send. */
export interface RelayTarget {
  /** Exact live Agent the command-line child is created under. */
  readonly agent: Agent
  /** Absolute Brand folder holding the definition and timeline files. */
  readonly brandRoot: string
}

/** One model a relay route offers; each maps to its own subagent provider instance. */
export interface RelayModel {
  /** Model id the Session stores and the request carries. */
  readonly id: string
  /** Registered subagent provider instance that runs this model. */
  readonly provider: string
  /** Selector label. */
  readonly name: string
  /** Optional user-facing distinction between otherwise similar models. */
  readonly description?: string
  /** Command-line backend the provider runs (`claude-code` or `codex`), for sign-in instructions and status. */
  readonly backend: string
}

/** One delegation accepted by the configured backend. */
export interface RelayStartSpec {
  /** Delegating parent Agent, used for origin, directory, and depth. */
  readonly parent: Agent
  /** Subagent provider instance selected for this send. */
  readonly provider: string
  /** The single composed task text. */
  readonly prompt: readonly ContentBlock[]
  /** Cancellation owned by this send; it aborts before publication only. */
  readonly signal: AbortSignal
}

/** Host capabilities one relay send needs. */
export interface RelayHost {
  /**
   * Resolve the live Session this request belongs to.
   * @param sessionId - Session identity stamped on the model request.
   * @returns the Agent and its Brand folder, or undefined when no Agent owns it.
   */
  resolve(sessionId: SessionId): RelayTarget | undefined
  /**
   * Start one caller-delivered child under the selected provider instance.
   * @param spec - parent, provider, task text, and cancellation.
   * @returns the accepted activation.
   */
  start(spec: RelayStartSpec): Promise<SubagentActivation>
  /**
   * Read the Brand folder for this send.
   * @param brandRoot - absolute Brand folder path.
   * @returns the definition and timeline within the configured budget.
   */
  readBrand(brandRoot: string): Promise<BrandSnapshot>
  /**
   * Publish one coarse status fact.
   * @param sessionId - Session whose turn is delegating.
   * @param backend - command-line backend that ran the send.
   * @param status - state reached.
   */
  status(sessionId: SessionId, backend: string, status: RelayStatus): void
}

/** Fixed budgets applied to every relay send. */
export interface RelayAdapterLimits {
  /** Brand definition and timeline file rules. */
  readonly brand: BrandFileConfig
  /** Earlier-conversation budget. */
  readonly conversation: ConversationBudget
  /** Deadline for one send, after which the child is disposed. */
  readonly timeoutMs: number
}

/** Construction inputs for {@link RelayAdapter}. */
export interface RelayAdapterOptions {
  /** Models this route offers, each backed by its own subagent provider instance. */
  readonly models: readonly RelayModel[]
  /** Model id selected when the request carries none. */
  readonly defaultModel: string
  /** Human-readable route name for selectors and diagnostics. */
  readonly displayName: string
  /** Host capabilities the adapter delegates through. */
  readonly host: RelayHost
  /** Fixed budgets. */
  readonly limits: RelayAdapterLimits
  /** Local sign-in facts used to report a missing login instead of a generic startup failure. */
  readonly signIn: SignInFacts
}

function failureError(failure: RelayFailure): LlmError {
  return new LlmError(failure.message, failure.code)
}

function textOf(result: SubagentResult): string {
  return result.output
    .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('')
}

/**
 * Stream one relay send as text chunks.
 *
 * The request's `sessionId` selects the live Agent and Brand folder; the last
 * user text becomes the Edit Request; earlier messages become the conversation
 * digest. Nothing else from the assembled request reaches the child.
 */
export class RelayAdapter extends LlmAdapter {
  constructor(private readonly options: RelayAdapterOptions) {
    super()
  }

  /**
   * Describe this route for selectors and diagnostics.
   * @param provider - route this adapter registered.
   * @returns the route id and its display label.
   */
  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: `${this.options.displayName} (relay)` }
  }

  /**
   * Advertise every model this route was configured with.
   * @param provider - route this adapter registered.
   * @returns the configured models in declaration order.
   */
  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve(this.options.models.map(model => ({
      provider,
      id: model.id,
      name: model.name,
      ...model.description === undefined ? {} : { description: model.description },
    })))
  }

  /**
   * Resolve the relay model without network I/O.
   * @param provider - route this adapter registered.
   * @param model - exact model id.
   * @returns provider/model identity only.
   */
  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: model })
  }

  /**
   * Delegate one assembled model request and stream the child's final answer.
   * @param options - assembled request; `sessionId` selects the Session and `messages` supply the task.
   * @returns one text block and a terminal `stop` finish, or a thrown `LlmError` for a classified failure.
   */
  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const sessionId = options.sessionId
    if (sessionId === undefined) {
      throw new LlmError('motif-relay: the relay needs the Session identity stamped by the loop', 'INVALID_REQUEST')
    }
    if (options.purpose !== undefined) {
      throw new LlmError(
        `motif-relay: auxiliary model calls (${options.purpose}) are not relayed to a command-line agent`,
        'INVALID_REQUEST',
      )
    }
    const target = this.options.host.resolve(sessionId)
    if (target === undefined) {
      throw new LlmError('motif-relay: no live Agent owns this Session', 'INVALID_REQUEST')
    }
    const editRequest = latestEditRequest(options.messages)
    if (editRequest === undefined) {
      throw new LlmError('motif-relay: the request carries no Edit Request text', 'INVALID_REQUEST')
    }

    const selected = this.options.models.find(model => model.id === (options.model ?? this.options.defaultModel))
    if (selected === undefined) {
      throw new LlmError(
        `motif-relay: model ${JSON.stringify(options.model ?? this.options.defaultModel)} is not offered by ${this.options.displayName}; configured: ${this.options.models.map(model => model.id).join(', ')}`,
        'INVALID_REQUEST',
      )
    }
    const context: RelayFailureContext = {
      backend: selected.backend,
      timeoutMs: this.options.limits.timeoutMs,
      signIn: detectSignInState(selected.backend, this.options.signIn),
    }
    if (context.signIn === 'absent') {
      throw failureError(missingSignInFailure(context))
    }

    this.options.host.status(sessionId, selected.backend, 'started')
    const brand = await this.options.host.readBrand(target.brandRoot)
    const task = buildRelayTask({
      editRequest,
      brand: brand.definition,
      timelineFiles: brand.timelineFiles,
      conversation: conversationSummary(options.messages, this.options.limits.conversation),
    })

    if (options.signal?.aborted === true) {
      throw new LlmError('motif-relay: the send was cancelled before the run started', 'ABORTED')
    }

    const controller = new AbortController()
    let timedOut = false
    const onAbort = (): void => { controller.abort() }
    options.signal?.addEventListener('abort', onAbort, { once: true })
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, this.options.limits.timeoutMs)
    const release = (): void => {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', onAbort)
    }

    let activation: SubagentActivation
    try {
      activation = await this.options.host.start({
        parent: target.agent,
        provider: selected.provider,
        prompt: [{ type: 'text', text: task }],
        signal: controller.signal,
      })
    } catch (error: unknown) {
      release()
      this.options.host.status(sessionId, selected.backend, 'failed')
      throw failureError(failureFromError(error, context))
    }
    this.options.host.status(sessionId, selected.backend, 'working')

    const cancelled = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => {
        reject(timedOut ? timeoutFailureFor(context) : cancelledFailure(context))
      }, { once: true })
    })
    let result: SubagentResult
    try {
      result = await Promise.race([activation.result, cancelled])
    } catch (error: unknown) {
      await activation.dispose().then(() => undefined, () => undefined)
      release()
      const failure = isRelayFailure(error) ? error : failureFromError(error, context)
      if (failure.kind !== 'cancelled') this.options.host.status(sessionId, selected.backend, 'failed')
      throw failureError(failure)
    }
    release()

    const failure = failureFromResult(result, context)
    if (failure !== undefined) {
      if (failure.kind !== 'cancelled') this.options.host.status(sessionId, selected.backend, 'failed')
      throw failureError(failure)
    }
    this.options.host.status(sessionId, selected.backend, 'finished')

    const answer = textOf(result)
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: answer }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: answer } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

function isRelayFailure(value: unknown): value is RelayFailure {
  return typeof value === 'object'
    && value !== null
    && 'kind' in value
    && 'message' in value
    && 'code' in value
}
