# Sentry integration status

Partial Host SDK stage for #82. Not a completed production monitoring rollout.

motif-core now creates an isolated @sentry/node 11.16.0 NodeClient, not a global Sentry.init. No default or optional integrations, global exception hooks, request instrumentation, session collection, tracing, browser replay or renderer capture is installed. Existing local crash reporting is unchanged. SDK v11 dataCollection explicitly disables user, cookie, header/body, query, GraphQL, AI/MCP, DB/queue content and local-variable collection. beforeSend rebuilds the final event from safeErrorEvent's fixed schema after scope enrichment. Transactions are dropped. No raw exceptions, stack paths, prompts, transcripts, filenames, media, user data or credentials are passed to the SDK.

Requires NODE_ENV=production, MOTIF_SENTRY_ENABLED=true and an HTTPS MOTIF_SENTRY_DSN. Missing or invalid configuration and SDK construction failure leave monitoring disabled. Brand-create failures are captured only by their Host owner and the same Error object is deduplicated. The original error is rethrown for normal local handling, never replaced. Client close has a bounded flush timeout.

No remote events were sent during implementation. Focused initialization/privacy/ownership tests use a fake client. Real controlled event verification needs a non-production project and explicit permission to transmit the safe event to it.

Remaining: Electron-main uncaught failures, separate Host startup/Relay/media owners, renderer-safe fallback ownership, correlation/release metadata, source-map release pipeline and real non-production dashboard smoke test. This stage does not claim meaningful stack traces: only the safe operation/code survives. Do not close #82 or claim production error monitoring is complete.

Official contracts checked: https://docs.sentry.io/platforms/javascript/guides/node/configuration/options/ and https://docs.sentry.io/platforms/javascript/guides/node/configuration/integrations/ . Installed v11 types are authoritative for option names. No source maps uploaded and no secrets configured. Affected motif-core compile and nine focused tests pass; full-build caveat remains tracked in #86.
