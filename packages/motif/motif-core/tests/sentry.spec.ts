import { expect, it, vi } from 'vitest'
import type { NodeOptions } from '@sentry/node'
import { createHostMonitoring } from '../src/sentry.ts'
const env = { NODE_ENV: 'production', MOTIF_SENTRY_ENABLED: 'true', MOTIF_SENTRY_DSN: 'https://test-key@sentry.example.test/1' }
it('never constructs SDK without explicit config, in development, or on invalid DSN', async () => {
  const factory = vi.fn()
  for (const value of [{}, { ...env, NODE_ENV: 'development' }, { ...env, MOTIF_SENTRY_ENABLED: 'false' }, { ...env, MOTIF_SENTRY_DSN: 'http://invalid.test' }]) {
    await createHostMonitoring(value, factory).close()
  }
  expect(factory).not.toHaveBeenCalled()
})
it('owns manual Host errors only and drops duplicates', async () => {
  const client = { captureEvent: vi.fn(), close: vi.fn(async () => true) }
  const host = createHostMonitoring(env, () => client)
  const error = new Error('private prompt, path and credential')
  host.monitoring.capture(error, 'brand-create')
  host.monitoring.capture(error, 'brand-create')
  host.monitoring.capture(new Error('forwarded'), 'brand-create', 'failed', false)
  expect(client.captureEvent).toHaveBeenCalledTimes(1)
  expect(JSON.stringify(client.captureEvent.mock.calls)).not.toContain('private')
  await host.close()
  expect(client.close).toHaveBeenCalledWith(2000)
})
it('has no automatic integrations and rebuilds final event after scope enrichment', () => {
  let options: NodeOptions | undefined
  createHostMonitoring(env, (value) => { options = value; return { captureEvent: vi.fn(), close: async () => true } })
  expect(options).toMatchObject({ integrations: [], defaultIntegrations: false, tracesSampleRate: 0, maxBreadcrumbs: 0 })
  const filter = options?.beforeSend
  if (!filter) throw new Error('Missing filter')
  expect(filter({ type: undefined, message: 'raw secret' }, {})).toBeNull()
  const event = filter({ type: undefined, message: 'raw secret', user: { email: 'private' }, extra: { path: '/private' },
    tags: { operation: 'brand-create', code: 'failed', runtime: 'host', environment: 'production' } }, {})
  expect(event).toEqual({ type: undefined, message: 'MOTIF operation failed', level: 'error',
    tags: { operation: 'brand-create', code: 'failed', runtime: 'host', environment: 'production' } })
})
it('constructor failure cannot block startup', () => {
  expect(() => createHostMonitoring(env, () => { throw new Error('SDK failure') })).not.toThrow()
})

it('fences capture before shutdown settles and closes the SDK only once', async () => {
  let finish!: (value: boolean) => void
  const client = { captureEvent: vi.fn(), close: vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve })) }
  const host = createHostMonitoring(env, () => client)
  const first = host.close(), second = host.close()
  host.monitoring.capture(new Error('late private failure'), 'brand-create')
  expect(host.monitoring.enabled).toBe(false)
  expect(client.captureEvent).not.toHaveBeenCalled()
  expect(client.close).toHaveBeenCalledOnce()
  finish(true)
  await Promise.all([first, second])
})
