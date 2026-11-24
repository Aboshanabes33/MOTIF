import type { PostHogOptions } from 'posthog-node'
import { expect, it, vi } from 'vitest'
import { createHostAnalytics } from '../src/posthog.ts'
const env = { NODE_ENV: 'production', MOTIF_ANALYTICS_CONSENT: 'true', MOTIF_POSTHOG_ENVIRONMENT: 'production',
  MOTIF_POSTHOG_KEY: 'test-key', MOTIF_POSTHOG_HOST: 'https://eu.i.posthog.com' }
it('does not construct SDK without all explicit configuration and consent', async () => {
  const factory = vi.fn()
  for (const value of [{}, { ...env, MOTIF_ANALYTICS_CONSENT: 'false' }, { ...env, NODE_ENV: 'development' },
    { ...env, MOTIF_POSTHOG_HOST: 'https://other.test' }, { ...env, MOTIF_POSTHOG_ENVIRONMENT: 'development' }]) {
    await createHostAnalytics(value, factory).close()
  }
  expect(factory).not.toHaveBeenCalled()
})
it('requires verified identity, drops after sign-out and closes once', async () => {
  const sink = { identify: vi.fn(), capture: vi.fn(), shutdown: vi.fn(async () => {}) }
  const factory = vi.fn(() => sink)
  const host = createHostAnalytics(env, factory)
  host.analytics.track('brand_created')
  expect(sink.capture).not.toHaveBeenCalled()
  host.analytics.signIn('account_12345678')
  host.analytics.track('brand_created', { method: 'manual', prompt: 'private' })
  expect(sink.capture).toHaveBeenCalledWith({ distinctId: 'account_12345678', event: 'motif_brand_created', properties: { method: 'manual' } })
  host.analytics.signOut()
  host.analytics.track('job_started')
  expect(sink.capture).toHaveBeenCalledTimes(1)
  await host.close()
  expect(sink.shutdown).toHaveBeenCalledOnce()
  expect(factory.mock.calls[0]?.[1]).toMatchObject({ enableExceptionAutocapture: false, disableGeoip: true })
})
it('startup survives an SDK constructor failure', () => {
  expect(() => createHostAnalytics(env, () => { throw new Error('offline') })).not.toThrow()
})

it('final SDK filter drops automatic events and strips SDK-added and arbitrary properties', () => {
  let options: PostHogOptions | undefined
  createHostAnalytics(env, (_key, value) => { options = value; return { identify: vi.fn(), capture: vi.fn() } })
  const filter = options?.beforeSend
  if (typeof filter !== 'function') throw new Error('Expected final filter')
  expect(filter({ distinctId: 'account_12345678', event: '$exception', properties: { secret: 'raw' } })).toBeNull()
  expect(filter({ distinctId: 'private@email.test', event: 'motif_job_started' })).toBeNull()
  expect(filter({ distinctId: 'account_12345678', event: 'motif_brand_created', properties: { method: 'manual', path: '/private', $set: { email: 'private' } } }))
    .toEqual({ distinctId: 'account_12345678', event: 'motif_brand_created', properties: { method: 'manual', $geoip_disable: true } })
})

it('drops queued transport after sign-out and cannot replay after re-consent', async () => {
  let options: PostHogOptions | undefined
  const capture = vi.fn(), identify = vi.fn()
  const host = createHostAnalytics(env, (_key, value) => { options = value; return { capture, identify } })
  const transport = options?.fetch
  if (!transport) throw new Error('Missing transport gate')
  const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('must not contact network'))
  try {
    await transport('https://eu.i.posthog.com/batch/', { method: 'POST', headers: {}, body: 'queued' })
    expect(network).not.toHaveBeenCalled()
    host.analytics.signIn('account_12345678')
    host.analytics.track('job_started')
    host.analytics.setPolicy({ environment: 'production', consent: false, configured: true })
    host.analytics.setPolicy({ environment: 'production', consent: true, configured: true })
    host.analytics.signIn('account_12345678')
    host.analytics.track('job_started')
    await transport('https://eu.i.posthog.com/batch/', { method: 'POST', headers: {}, body: 'queued' })
    expect(network).not.toHaveBeenCalled()
    expect(capture).toHaveBeenCalledTimes(1)
    expect(host.analytics.authenticated).toBe(false)
  } finally { network.mockRestore(); await host.close() }
})

it('aborts active network requests and makes close idempotent', async () => {
  let options: PostHogOptions | undefined
  let signal: AbortSignal | null | undefined
  const shutdown = vi.fn(async () => {})
  const host = createHostAnalytics(env, (_key, value) => {
    options = value
    return { capture: vi.fn(), identify: vi.fn(), shutdown }
  })
  const network = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    signal = init?.signal
    return new Response('{}', { status: 200 })
  })
  try {
    host.analytics.signIn('account_12345678')
    await options?.fetch?.('https://eu.i.posthog.com/batch/', { method: 'POST', headers: {} })
    expect(signal?.aborted).toBe(false)
    host.analytics.signOut()
    expect(signal?.aborted).toBe(true)
    await Promise.all([host.close(), host.close()])
    expect(shutdown).toHaveBeenCalledOnce()
  } finally { network.mockRestore() }
})
