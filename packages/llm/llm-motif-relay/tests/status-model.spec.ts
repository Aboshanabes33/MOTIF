import { describe, expect, it, vi } from 'vitest'
import { RelayAdapter } from '../src/adapter.ts'
import type { RelayHost, RelayModel } from '../src/adapter.ts'
import type { RelayStatus } from '../src/status.ts'

const MODEL: RelayModel = { id: 'relay-claude', provider: 'subagent-claude', name: 'Claude (relay)', backend: 'claude-code' }

/** The status events one send published, in order. */
interface Recorded {
  backend: string
  model: string
  status: RelayStatus
}

function harness() {
  const events: Recorded[] = []
  const host: RelayHost = {
    resolve: () => ({ agent: {} as never, brandRoot: '/brands/acme' }),
    readBrand: async () => ({ definition: undefined, timelineFiles: [] }),
    start: async () => ({
      result: Promise.resolve({ stopReason: 'completed', output: [{ type: 'text', text: 'done' }] } as never),
      dispose: vi.fn(async () => {}),
    } as never),
    status: (_session, backend, model, status) => { events.push({ backend, model, status }) },
  }
  const adapter = new RelayAdapter({
    models: [MODEL],
    defaultModel: MODEL.id,
    displayName: 'Motif',
    host,
    limits: {
      brand: { brandFile: 'brand.md', timelineDir: 'timeline', timelineExtensions: ['.md'], maxTimelineFiles: 20, maxTimelineBytes: 64_000 },
      conversation: { maxMessages: 6, maxChars: 4_000 },
      timeoutMs: 5_000,
    },
    signIn: { env: {}, home: '/nonexistent', exists: () => true },
  })
  return { adapter, events }
}

const OPTIONS = {
  sessionId: 'session-1',
  model: MODEL.id,
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Make it shorter' }] }],
} as const

describe('relay status events', () => {
  it('carry the selected model through every state of one send', async () => {
    const { adapter, events } = harness()
    for await (const chunk of adapter.stream({ ...OPTIONS } as never)) void chunk
    expect(events).toEqual([
      { backend: 'claude-code', model: 'relay-claude', status: 'started' },
      { backend: 'claude-code', model: 'relay-claude', status: 'working' },
      { backend: 'claude-code', model: 'relay-claude', status: 'finished' },
    ])
  })
})
