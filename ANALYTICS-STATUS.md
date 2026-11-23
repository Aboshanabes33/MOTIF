# PostHog integration status

Partial work, not a shipped integration and not grounds to close #51. The central analytics boundary is implemented and tested, but no production PostHog instance or real UI/Host event source calls it yet.

The app already has desktop-only productAnalytics over authenticated RPC and an OTEL Host sender. Reuse that ownership/policy layer rather than initialize PostHog in each component or duplicate captures in renderer and Host. Official Node capture/identify contracts checked at https://posthog.com/docs/libraries/node and https://posthog.com/docs/libraries/node/reference . Consent guidance checked at https://posthog.com/docs/privacy/data-collection .

The boundary accepts only fixed event names and enum property values, never arbitrary text. No prompt, transcript, media, path, name, email, credential or raw exception is allowed. It drops all events before verified account identity, without configuration, without consent or in development. It does not queue events for later consent. Sign-out clears the identity. Use an opaque backend-issued account ID, not a token or email.

Remaining: choose an explicit consent setting and deployment/project host, wire a single posthog-node SDK instance on the Host with autocapture/replay disabled and development separation, map real successful product actions, connect verified #50 identity/sign-out, add shutdown handling, update exact package/lockfile and review privacy policy. No actual user data has been sent to PostHog by this work.
