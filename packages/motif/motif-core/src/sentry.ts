/** Isolated Host Sentry client. Does not install global handlers or replace local crash reporting. */
import { NodeClient, makeNodeTransport, defaultStackParser, type NodeOptions } from '@sentry/node'
import { MotifErrorMonitoring, safeErrorEvent, type MonitoringSink } from './error-monitoring.ts'

interface HostMonitoringClient extends MonitoringSink { close(timeout?: number): PromiseLike<boolean> }

/** Construct only with explicit production configuration; never throw during Host startup. */
export function createHostMonitoring(
  env: Readonly<Record<string, string | undefined>>,
  create: (options: NodeOptions) => HostMonitoringClient = options => new NodeClient({
    ...options, integrations: [], transport: makeNodeTransport, stackParser: defaultStackParser,
  }),
): { monitoring: MotifErrorMonitoring; close(): Promise<void> } {
  let client: HostMonitoringClient | undefined
  const enabled = env.NODE_ENV === 'production' && env.MOTIF_SENTRY_ENABLED === 'true' && !!env.MOTIF_SENTRY_DSN
  if (enabled) {
    try {
      const dsn = new URL(env.MOTIF_SENTRY_DSN ?? '')
      if (dsn.protocol !== 'https:' || !dsn.username || dsn.password || dsn.search || dsn.hash) throw new Error('Invalid DSN')
      client = create({
        dsn: dsn.href, environment: 'production', defaultIntegrations: false, integrations: [],
        transport: makeNodeTransport, stackParser: defaultStackParser,
        maxBreadcrumbs: 0, attachStacktrace: false,
        dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false,
          graphQL: { document: false, variables: false }, genAI: { inputs: false, outputs: false },
          mcp: { inputs: false, outputs: false }, databaseQueryData: false, queues: false,
          stackFrameVariables: false, frameContextLines: 0 },
        tracesSampleRate: 0, sendClientReports: false,
        beforeSend: (event) => {
          const safe = safeErrorEvent(event)
          return safe ? { ...safe, type: undefined } : null
        },
        beforeSendTransaction: () => null,
        beforeSendLog: () => null, beforeSendMetric: () => null,
      })
    } catch { client = undefined }
  }
  const monitoring = new MotifErrorMonitoring(client, { dsn: enabled ? 'configured' : '', enabled,
    runtime: 'host', environment: 'production' })
  return { monitoring, close: async () => { try { await client?.close(2000) } catch { /* Best effort only. */ } } }
}
