import { describe, expect, it, vi } from 'vitest'
import { RelayAdapter } from '../src/adapter.ts'
import type { RelayHost, RelayModel } from '../src/adapter.ts'
import type { RelayStatus } from '../src/status.ts'

const MODEL: RelayModel = { id: 'relay-claude', provider: 'subagent-claude', name: 'Claude (relay)', backend: 'claude-code' }

interface HarnessOptions {
  readonly readBrand?: RelayHost['readBrand']
  readonly startResult?: 'ok' | 'throw'
  readonly runResult?: 'ok' | 'timeout-never'
}

function harness(options: HarnessOptions = {}) {
  const statuses: RelayStatus[] = []
  const dispose = vi.fn(async () => {})
  const host: RelayHost = {
    resolve: () => ({ agent: {} as never, brandRoot: '/brands/acme' }),
    readBrand: options.readBrand ?? (async () => ({ definition: undefined, timelineFiles: [] })),
    start: async () => {
      if (options.startResult === 'throw') throw new Error('provider unavailable')
      return {
        result: options.runResult === 'timeout-never'
          ? new Promise<never>(() => {})
          : Promise.resolve({ stopReason: 'completed', output: [{ type: 'text', text: 'done' }] } as never),
        dispose,
      } as never
    },
    status: (_session, _backend, _model, status) => { statuses.push(status) },
  }
  const adapter = new RelayAdapter({
    models: [MODEL],
    defaultModel: MODEL.id,
    displayName: 'Motif',
    host,
    limits: {
      brand: { brandFile: 'brand.md', timelineDir: 'timeline', timelineExtensions: ['.md'], maxTimelineFiles: 20, maxTimelineBytes: 64_000 },
      conversation: { maxMessages: 6, maxChars: 4_000 },
      timeoutMs: 50,
    },
    signIn: { env: {}, home: '/nonexistent', exists: () => true },
  })
  return { adapter, statuses, dispose }
}

const OPTIONS = {
  sessionId: 'session-1',
  model: MODEL.id,
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Make it shorter' }] }],
} as const

async function collect(adapter: RelayAdapter, options: object): Promise<unknown[]> {
  const chunks: unknown[] = []
  for await (const chunk of adapter.stream(options as never)) chunks.push(chunk)
  return chunks
}

describe('RelayAdapter lifecycle status', () => {
  it('emits failed exactly once when Brand snapshot preparation throws', async () => {
    const { adapter, statuses } = harness({
      readBrand: async () => { throw new Error('EACCES: brand.md') },
    })
    await expect(collect(adapter, { ...OPTIONS })).rejects.toThrow()
    expect(statuses).toEqual(['started', 'failed'])
  })

  it('applies the deadline to context preparation and emits failed once', async () => {
    const { adapter, statuses } = harness({
      readBrand: () => new Promise<never>(() => {}),
    })
    await expect(collect(adapter, { ...OPTIONS })).rejects.toThrow()
    expect(statuses).toEqual(['started', 'failed'])
  })

  it('cancels during preparation without emitting a terminal status', async () => {
    const controller = new AbortController()
    const { adapter, statuses } = harness({
      readBrand: () => new Promise<never>(() => {}),
    })
    const pending = collect(adapter, { ...OPTIONS, signal: controller.signal })
    setTimeout(() => { controller.abort() }, 5)
    await expect(pending).rejects.toThrow()
    expect(statuses).toEqual(['started'])
  })

  it('emits failed exactly once when the activation cannot start', async () => {
    const { adapter, statuses } = harness({ startResult: 'throw' })
    await expect(collect(adapter, { ...OPTIONS })).rejects.toThrow()
    expect(statuses).toEqual(['started', 'failed'])
  })

  it('times out a hung run, disposes the child, and emits failed once', async () => {
    const { adapter, statuses, dispose } = harness({ runResult: 'timeout-never' })
    await expect(collect(adapter, { ...OPTIONS })).rejects.toThrow()
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(statuses).toEqual(['started', 'working', 'failed'])
  })

  it('emits finished exactly once on success', async () => {
    const { adapter, statuses } = harness()
    const chunks = await collect(adapter, { ...OPTIONS })
    expect(statuses).toEqual(['started', 'working', 'finished'])
    expect(chunks.some(chunk => (chunk as { type: string }).type === 'finish')).toBe(true)
  })
})
