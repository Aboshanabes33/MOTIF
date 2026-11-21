/**
 * Composition-only stand-in for a command-line backend. It returns one final
 * answer, records the exact task text it received, and can fail with fixed
 * provider diagnostic facts so the relay's failure path is exercised without a
 * real Claude Code or Codex process.
 */

import { randomUUID } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session'
import {
  NO_START_CAPABILITIES,
  type ResolvedSubagentStartRequest,
  type SubagentProvider,
  type SubagentResult,
  type SubagentRun,
} from '@deepseek-ai/dsh-subagent'

export const name = 'motif-relay-stand-in'
export const inject = ['subagents']

/** @returns the registered provider name, answer text, and optional failure category. */
export interface Config {
  providerName?: string
  answer?: string
  failCategory?: string
}

export const Config: z<Config> = z.object({
  providerName: z.string().min(1).default('claude-code'),
  answer: z.string().default('Trimmed the intro to four seconds.'),
  failCategory: z.string().default(''),
})

function promptText(request: ResolvedSubagentStartRequest): string {
  return request.prompt.flatMap(block => block.type === 'text' ? [block.text] : []).join('')
}

class StandInProvider implements SubagentProvider {
  readonly capabilities = NO_START_CAPABILITIES
  readonly inheritsParentContext = false

  constructor(
    readonly name: string,
    private readonly config: Required<Config>,
  ) {}

  async start(request: ResolvedSubagentStartRequest): Promise<SubagentRun> {
    const promptsFile = process.env['MOTIF_RELAY_PROMPTS_FILE']
    if (promptsFile !== undefined) {
      appendFileSync(promptsFile, `${JSON.stringify({ prompt: promptText(request) })}\n`)
    }
    const result = this.config.failCategory === ''
      ? {
        output: [{ type: 'text' as const, text: this.config.answer }],
        stopReason: 'completed' as const,
      }
      : {
        output: [],
        stopReason: 'error' as const,
        diagnostic: `Product subagent failure (product: Stand-in; stage: query-run; category: ${this.config.failCategory})`,
      }
    const delayMs = Number(process.env['MOTIF_RELAY_STAND_IN_DELAY_MS'] ?? '0')
    if (!Number.isFinite(delayMs) || delayMs <= 0) {
      return {
        id: brandString<SessionId>(randomUUID()),
        result: Promise.resolve(result),
        dispose: async () => {},
      }
    }
    // Slow backend: the caller's cancellation must be able to stop the run, and
    // disposal settles the pending result so teardown can finish.
    const settled = Promise.withResolvers<SubagentResult>()
    const timer = setTimeout(() => { settled.resolve(result) }, delayMs)
    return {
      id: brandString<SessionId>(randomUUID()),
      result: settled.promise,
      dispose: async () => {
        clearTimeout(timer)
        settled.resolve({ output: [], stopReason: 'error' })
      },
    }
  }
}

/**
 * Register the stand-in backend under the configured provider name.
 * @param ctx - Loader context supplying the subagent seam.
 * @param config - provider name, answer text, and optional failure category.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.subagents.registerProvider(new StandInProvider(
    config.providerName ?? 'claude-code',
    {
      providerName: config.providerName ?? 'claude-code',
      answer: config.answer ?? 'Trimmed the intro to four seconds.',
      failCategory: config.failCategory ?? '',
    },
  ))
}
