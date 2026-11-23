# Sentry integration status

This is a tested privacy/ownership boundary only, not a complete Sentry integration. No SDK is initialized or events sent. Do not close #52 from this patch.

Architecture checked: Electron main owns fatal recovery and local crash reports; a separate Node Host owns Relay/filesystem/process services; the renderer is a Cordis/React client shared with the web application. A single Electron SDK main initialization with its supported renderer bridge is the likely desktop route, but the separate Host needs an explicit owner rather than duplicate SDK initializations or uploading the local crash report verbatim. Web renderer and standalone Host need separate supported browser/Node SDKs. Preserve existing local crash reporting.

Official guidance checked:
- https://docs.sentry.io/platforms/javascript/guides/electron/
- https://docs.sentry.io/platforms/javascript/guides/electron/configuration/options/
- https://docs.sentry.io/platforms/javascript/guides/node/configuration/options/
- https://docs.sentry.io/platforms/javascript/guides/electron/data-management/sensitive-data/

The utility emits a fixed message and closed-enum operation/code/runtime/environment tags, plus a validated version string. It intentionally drops raw error text, stack context, filenames, prompts, transcripts, keys, credentials, media and user/request fields. This is safer than a denylist but less diagnostic. Cancellation is not an error event. Owners capture once; renderer presentation of a Host-owned failure must not recapture it.

Remaining: select exact supported SDK versions, integrate at actual boot boundaries, disable all automatic sensitive collection/replay/tracing, apply safeErrorEvent in every SDK egress hook, preserve SDK event envelope fields safely, environment/DSN setup, release metadata, source-map upload without public source disclosure, job/Relay capture wiring, cross-process correlation/ownership, shutdown behavior and real smoke tests. Missing DSN must remain a no-op and initialization exceptions must never prevent startup. DSN/release configuration must not enable capture of user content by default.
