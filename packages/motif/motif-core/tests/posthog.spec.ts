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
