import { describe, expect, it, vi } from 'vitest'
import type { CredentialRecord } from '@deepseek-ai/dsh-credentials/types'
import {
  apiKeyStatus,
  credentialRecordKey,
  deleteApiKey,
  maskApiKey,
  saveApiKey,
  storedApiKey,
  testApiKey,
  validateApiKey,
} from '../src/credentials.ts'
import type { MotifCredentialStore } from '../src/credentials.ts'

/** In-memory MotifCredentialStore honouring the modifyRecord contract. */
function makeStore(initial: Record<string, CredentialRecord> = {}): MotifCredentialStore & { records: Record<string, CredentialRecord> } {
  const records = { ...initial }
  return {
    records,
    readRecord: async key => records[key],
    modifyRecord: async (key, mutate) => {
      const next = await mutate(records[key])
      if (next !== undefined) records[key] = next
      return records[key]
    },
    deleteRecord: async (key) => { Reflect.deleteProperty(records, key) },
  }
}

/** fetch stub answering one status. */
function fetchWith(status: number): typeof fetch {
  return vi.fn(async () => new Response('{}', { status })) as unknown as typeof fetch
}

describe('validateApiKey', () => {
  it('trims surrounding whitespace and accepts the key', () => {
    expect(validateApiKey('  sk-ant-test-123  ')).toEqual({ ok: true, value: 'sk-ant-test-123' })
  })

  it('rejects an empty key', () => {
    const result = validateApiKey('   ')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.detail).toContain('Enter an API key')
  })

  it('rejects characters no provider issues', () => {
    const result = validateApiKey('sk ant\ttab')
    expect(result.ok).toBe(false)
  })
})

describe('maskApiKey', () => {
  it('shows only the last four characters', () => {
    expect(maskApiKey('sk-ant-api03-abcdefgh')).toBe('…efgh')
  })
})

describe('stored credential persistence', () => {
  it('addresses records inside the motif scope', () => {
    expect(credentialRecordKey('anthropic')).toBe('motif/anthropic')
    expect(credentialRecordKey('openai')).toBe('motif/openai')
  })

  it('stores a key and reads it back', async () => {
    const store = makeStore()
    await saveApiKey(store, 'anthropic', 'sk-ant-one')
    expect(await storedApiKey(store, 'anthropic')).toBe('sk-ant-one')
    expect(store.records['motif/anthropic']).toEqual({ kind: 'api-key', key: 'sk-ant-one' })
  })

  it('replaces a previous key for the same provider', async () => {
    const store = makeStore()
    await saveApiKey(store, 'openai', 'sk-first')
    await saveApiKey(store, 'openai', 'sk-second')
    expect(await storedApiKey(store, 'openai')).toBe('sk-second')
  })

  it('keeps providers independent', async () => {
    const store = makeStore()
    await saveApiKey(store, 'anthropic', 'sk-ant')
    await saveApiKey(store, 'openai', 'sk-oai')
    await deleteApiKey(store, 'anthropic')
    expect(await storedApiKey(store, 'anthropic')).toBeUndefined()
    expect(await storedApiKey(store, 'openai')).toBe('sk-oai')
  })

  it('delete is a no-op when nothing is stored', async () => {
    const store = makeStore()
    await expect(deleteApiKey(store, 'openai')).resolves.toBeUndefined()
  })
})

describe('apiKeyStatus', () => {
  it('reports unconfigured without a stored record', async () => {
    const status = await apiKeyStatus(makeStore(), 'openai')
    expect(status).toMatchObject({ provider: 'openai', configured: false, env: 'OPENAI_API_KEY', backend: 'codex' })
    expect(status.masked).toBeUndefined()
  })

  it('reports a masked preview and never the value', async () => {
    const store = makeStore()
    await saveApiKey(store, 'anthropic', 'sk-ant-secret-value-1234')
    const status = await apiKeyStatus(store, 'anthropic')
    expect(status.configured).toBe(true)
    expect(status.masked).toBe('…1234')
    expect(JSON.stringify(status)).not.toContain('sk-ant-secret-value-1234')
    expect(status).toMatchObject({ env: 'ANTHROPIC_API_KEY', backend: 'claude-code' })
  })
})

describe('testApiKey', () => {
  it('accepts when the provider answers 200', async () => {
    const result = await testApiKey('anthropic', 'sk-ant-x', { fetch: fetchWith(200) })
    expect(result).toEqual({ ok: true, detail: 'Anthropic accepted the models-list check. Session/Relay generation has not been verified by this check.' })
  })

  it('sends the provider-specific auth headers', async () => {
    const mock = vi.fn(async () => new Response('{}', { status: 200 }))
    await testApiKey('openai', 'sk-oai-x', { fetch: mock as unknown as typeof fetch })
    const [url, init] = mock.mock.calls[0] ?? []
    expect(url).toBe('https://api.openai.com/v1/models')
    expect((init as RequestInit).headers).toEqual({ authorization: 'Bearer sk-oai-x' })
  })

  it('reports a rejected key on 401 and 403', async () => {
    for (const status of [401, 403]) {
      const result = await testApiKey('openai', 'sk-bad', { fetch: fetchWith(status) })
      expect(result).toEqual({ ok: false, detail: 'OpenAI rejected this key.' })
    }
  })

  it('reports an unexpected status without claiming rejection', async () => {
    const result = await testApiKey('anthropic', 'sk-ant-x', { fetch: fetchWith(500) })
    expect(result.ok).toBe(false)
    expect(result.detail).toContain('500')
    expect(result.detail).toContain('could not be verified')
  })

  it('reports a network failure truthfully', async () => {
    const failing = vi.fn(async () => { throw new Error('socket hang up') })
    const result = await testApiKey('openai', 'sk-x', { fetch: failing as unknown as typeof fetch })
    expect(result.ok).toBe(false)
    expect(result.detail).toContain('could not be reached')
  })
})

it('refuses redirects on authenticated verification requests', async () => {
  const call = vi.fn(async (_url: unknown, init?: RequestInit) => {
    expect(init?.redirect).toBe('error')
    return new Response('{}', { status: 200 })
  })
  await testApiKey('anthropic', 'sk-test', { fetch: call as typeof fetch })
  expect(call).toHaveBeenCalledTimes(1)
})

it('does not mistake either provider models check for successful Relay generation', async () => {
  for (const provider of ['anthropic', 'openai'] as const) {
    const result = await testApiKey(provider, 'sk-synthetic', { fetch: fetchWith(200) })
    expect(result.ok).toBe(true)
    expect(result.detail).toContain('models-list')
    expect(result.detail).toContain('generation has not been verified')
  }
})
