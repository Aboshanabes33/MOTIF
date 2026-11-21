import { randomUUID } from 'node:crypto'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { brandString } from '@deepseek-ai/dsh-brand'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm/message'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {
  SubagentActivation,
  SubagentResult,
} from '@deepseek-ai/dsh-subagent'
import { describe, expect, it, vi } from 'vitest'
import { RelayAdapter } from '../src/adapter.ts'
import type { RelayHost, RelayStartSpec } from '../src/adapter.ts'
import type { BrandSnapshot } from '../src/brand.ts'
import type { RelayStatus } from '../src/status.ts'

const SESSION = brandString<SessionId>('relay-session')
const agent = {} as Agent

const user = (text: string) => createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
const assistant = (text: string) => createAssistantMessage({
  content: [{ type: 'text', text }],
  source: { provider: 'motif-relay', model: 'claude-code' },
})

function activation(result: Promise<SubagentResult>): SubagentActivation & { readonly dispose: ReturnType<typeof vi.fn> } {
  return {
    childId: brandString<SessionId>(randomUUID()),
    name: 'agent-1',
    result,
    dispose: vi.fn(async () => {}),
  }
}

interface Harness {
  readonly adapter: RelayAdapter
  readonly starts: RelayStartSpec[]
  readonly statuses: RelayStatus[]
  readonly readBrand: ReturnType<typeof vi.fn>
}

function harness(options: {
  readonly result?: Promise<SubagentResult>
  readonly startError?: Error
  readonly brand?: BrandSnapshot
  readonly timeoutMs?: number
} = {}): Harness {
  const starts: RelayStartSpec[] = []
  const statuses: RelayStatus[] = []
  const readBrand = vi.fn(async (): Promise<BrandSnapshot> => options.brand ?? {
    definition: { text: 'Primary color: #1d4ed8' },
    timelineFiles: [{ path: 'timeline/main.json', text: '{"clips":[]}' }],
  })
  const host: RelayHost = {
    resolve: () => ({ agent, brandRoot: '/brands/acme' }),
    start: async (spec) => {
      starts.push(spec)
      if (options.startError !== undefined) throw options.startError
      return activation(options.result ?? Promise.resolve({
        output: [{ type: 'text', text: 'Trimmed the intro to four seconds.' }],
        stopReason: 'completed',
      }))
    },
    readBrand,
    status: (_sessionId, status) => { statuses.push(status) },
  }
  return {
    adapter: new RelayAdapter({
      backend: 'claude-code',
      model: 'claude-code',
      displayName: 'Claude Code',
      host,
      limits: {
        brand: {
          brandFile: 'brand.md',
          timelineDir: 'timeline',
          timelineExtensions: ['.json'],
          maxTimelineFiles: 20,
          maxTimelineBytes: 64_000,
        },
        conversation: { maxMessages: 4, maxChars: 2_000 },
        timeoutMs: options.timeoutMs ?? 900_000,
      },
      signIn: { platform: 'linux', home: '/home/user', env: {}, exists: () => true },
    }),
    starts,
    statuses,
    readBrand,
  }
}

function request(messages: GenerateOptions['messages'], signal?: AbortSignal): GenerateOptions {
  return {
    provider: 'motif-relay',
    model: 'claude-code',
    messages,
    sessionId: SESSION,
    ...signal === undefined ? {} : { signal },
  }
}

async function collect(adapter: RelayAdapter, options: GenerateOptions): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of adapter.stream(options)) chunks.push(chunk)
  return chunks
}

function taskText(spec: RelayStartSpec | undefined): string {
  const block = spec?.prompt[0]
  return block !== undefined && block.type === 'text' ? block.text : ''
}

function answerOf(chunks: readonly StreamChunk[]): string {
  return chunks.flatMap(chunk => chunk.type === 'text-delta' ? [chunk.text] : []).join('')
}

describe('RelayAdapter', () => {
  it('returns the final answer as the assistant text and reports coarse status', async () => {
    const fixture = harness()

    const chunks = await collect(fixture.adapter, request([user('Cut the intro to four seconds.')]))

    expect(answerOf(chunks)).toBe('Trimmed the intro to four seconds.')
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'stop' } })
    expect(fixture.statuses).toEqual(['started', 'working', 'finished'])
    expect(fixture.starts).toHaveLength(1)
    expect(taskText(fixture.starts[0])).toContain('Cut the intro to four seconds.')
  })

  it('carries the earlier conversation so a follow-up needs no Session continuity', async () => {
    const fixture = harness()

    await collect(fixture.adapter, request([
      user('Add captions to every clip.'),
      assistant('Added captions to every clip.'),
      user('Make the captions bold.'),
    ]))

    const task = taskText(fixture.starts[0])
    expect(task).toContain('User: Add captions to every clip.')
    expect(task).toContain('Assistant: Added captions to every clip.')
    expect(task).toContain('## Edit Request\nMake the captions bold.')
  })

  it('re-reads the Brand folder, so a manual timeline change reaches the next send', async () => {
    const fixture = harness()
    await collect(fixture.adapter, request([user('First edit.')]))
    fixture.readBrand.mockResolvedValueOnce({
      definition: { text: 'Primary color: #111111' },
      timelineFiles: [{ path: 'timeline/main.json', text: '{"clips":[{"start":0,"end":4}]}' }],
    })

    await collect(fixture.adapter, request([user('Second edit.')]))

    expect(fixture.readBrand).toHaveBeenCalledTimes(2)
    const second = taskText(fixture.starts[1])
    expect(second).toContain('#111111')
    expect(second).toContain('"end":4')
  })

  it('reports a provider limit as an actionable failure and a failed status', async () => {
    const fixture = harness({
      result: Promise.resolve({
        output: [],
        stopReason: 'error',
        diagnostic: 'Product subagent failure (product: Claude Code; stage: query-run; category: limit)',
      }),
    })

    const error = await collect(fixture.adapter, request([user('Edit.')])).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(LlmError)
    expect((error as LlmError).code).toBe('QUOTA')
    expect((error as LlmError).message).toContain('usage limit')
    expect(fixture.statuses).toEqual(['started', 'working', 'failed'])
  })

  it('never falls back to another backend when the configured one is unavailable', async () => {
    const fixture = harness({
      startError: Object.assign(new Error('no runtime'), { code: 'NO_PROVIDER' }),
    })

    const error = await collect(fixture.adapter, request([user('Edit.')])).catch((caught: unknown) => caught)

    expect((error as LlmError).code).toBe('HTTP_503')
    expect(fixture.starts).toHaveLength(1)
    expect(fixture.statuses).toEqual(['started', 'failed'])
  })

  it('disposes the run and reports cancellation when the turn is cancelled', async () => {
    const never = new Promise<SubagentResult>(() => {})
    const fixture = harness({ result: never })
    const controller = new AbortController()
    const pending = collect(fixture.adapter, request([user('Edit.')], controller.signal)).catch((caught: unknown) => caught)

    await vi.waitFor(() => { expect(fixture.statuses).toContain('working') })
    controller.abort()
    const error = await pending

    expect((error as LlmError).code).toBe('ABORTED')
    expect(fixture.statuses).toEqual(['started', 'working'])
  })

  it('reports the deadline instead of waiting forever', async () => {
    const never = new Promise<SubagentResult>(() => {})
    const fixture = harness({ result: never, timeoutMs: 20 })

    const error = await collect(fixture.adapter, request([user('Edit.')])).catch((caught: unknown) => caught)

    expect((error as LlmError).code).toBe('HTTP_504')
    expect((error as LlmError).message).toContain('minutes')
  })

  it('refuses a request with no Session identity', async () => {
    const fixture = harness()

    const error = await collect(fixture.adapter, {
      provider: 'motif-relay',
      model: 'claude-code',
      messages: [user('Edit.')],
    }).catch((caught: unknown) => caught)

    expect((error as LlmError).code).toBe('INVALID_REQUEST')
  })
})
