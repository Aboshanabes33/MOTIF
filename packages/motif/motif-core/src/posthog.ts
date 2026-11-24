/** Host-only PostHog SDK adapter. No renderer SDK or automatic collection. */
import { PostHog, type PostHogOptions } from 'posthog-node'
import { MotifAnalytics, PRODUCT_EVENTS, productProperties, type AnalyticsSink, type ProductEventName } from './product-analytics.ts'

/** One explicitly opted-in Host instance; a verified identity must still be supplied internally. */
export function createHostAnalytics(
  env: Readonly<Record<string, string | undefined>>,
  create: (key: string, options: PostHogOptions) => AnalyticsSink = (key, options) => new PostHog(key, options),
): { analytics: MotifAnalytics; close(): Promise<void> } {
  let sink: AnalyticsSink | undefined
  let revoked = false
  const current: { analytics?: MotifAnalytics } = {}
  const requests = new AbortController()
  const configured = env.MOTIF_ANALYTICS_CONSENT === 'true' && env.NODE_ENV === 'production'
    && env.MOTIF_POSTHOG_ENVIRONMENT === 'production' && !!env.MOTIF_POSTHOG_KEY
  if (configured && env.MOTIF_POSTHOG_KEY) {
    try {
      const host = new URL(env.MOTIF_POSTHOG_HOST ?? '')
      // Explicit ingestion regions only. Do not send telemetry to an arbitrary configuration URL.
      if (!['https://us.i.posthog.com/', 'https://eu.i.posthog.com/'].includes(host.href)) throw new Error('Invalid ingestion host')
      sink = create(env.MOTIF_POSTHOG_KEY, {
        host: host.origin, enableExceptionAutocapture: false, enableLocalEvaluation: false,
        // Last gate runs when the SDK dequeues, not just when capture was called.
        fetch: async (url, options) => {
          if (revoked || !current.analytics?.authenticated) return { status: 200, text: async () => '', json: async () => ({}) }
          const destination = new URL(url)
          if (destination.origin !== host.origin) throw new Error('Analytics destination refused')
          return await fetch(url, { ...options, redirect: 'error',
            signal: options.signal ? AbortSignal.any([options.signal, requests.signal]) : requests.signal })
        },
        featureFlagsPollingInterval: null, disableGeoip: true, privacyMode: true,
        flushAt: 20, flushInterval: 30000, maxQueueSize: 100, requestTimeout: 3000, fetchRetryCount: 0,
        beforeSend: (event) => {
          if (typeof event.distinctId !== 'string' || !/^account_[a-zA-Z0-9_-]{8,80}$/.test(event.distinctId)) return null
          const name = event.event.replace(/^motif_/, '') as ProductEventName
          if (event.event !== `motif_${name}` || !Object.hasOwn(PRODUCT_EVENTS, name)) return null
          return { distinctId: event.distinctId, event: event.event,
            properties: { ...productProperties(name, event.properties ?? {}), $geoip_disable: true } }
        },
      })
    } catch { sink = undefined }
  }
  const sdk = sink
  const revoke = (): void => { revoked = true; requests.abort() }
  sink = sdk && { identify: value => sdk.identify(value), capture: value => sdk.capture(value), revoke }
  const analytics = new MotifAnalytics(sink, { environment: 'production', consent: configured, configured: !!sink })
  current.analytics = analytics
  const boundary = analytics
  let closing: Promise<void> | undefined
  return { analytics: boundary, close: () => closing ??= (async () => {
    boundary.signOut()
    try { await sdk?.shutdown?.() } catch { /* Best effort only. */ }
  })() }
}
