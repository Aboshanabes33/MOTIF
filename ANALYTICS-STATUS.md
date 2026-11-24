# PostHog integration status

Partial SDK integration for #81, not a working end-to-end verified analytics rollout.

Host motif-core now owns one posthog-node 6.0.5 adapter per controller lifetime, with bounded queue, explicit close, exception autocapture off, no browser SDK/replay, local evaluation disabled, GeoIP off, privacyMode on and a final closed event/property filter. Brand creation records only after successful workspace registration. Startup and SDK failure are nonfatal.

Configuration requires NODE_ENV=production, MOTIF_ANALYTICS_CONSENT=true, MOTIF_POSTHOG_ENVIRONMENT=production, MOTIF_POSTHOG_KEY and explicit MOTIF_POSTHOG_HOST (https://us.i.posthog.com or https://eu.i.posthog.com). Missing any condition disables construction. Development is disabled, not sent to a production project. A development project rollout is not configured yet.

Crucially, no verified account lifecycle is wired: this controller NEVER calls signIn, so it emits no product events yet, even when configured. Do not substitute a renderer claim, environment account ID, email or native CLI login for verified application authentication. #79's authenticated isolated-runtime flow must supply the lifecycle internally before enabling collection.

Boundary event names remain motif_onboarding_completed, motif_mode_changed, motif_brand_created, motif_workspace_opened, motif_edit_requested, motif_provider_selected, motif_job_started/completed/failed. Only predefined enum properties are accepted. No free text, prompts, transcripts, media, paths, names, emails, credentials or raw errors. The final SDK beforeSend drops non-taxonomy/automatic/identity profile events and rebuilds properties. Identity is an opaque backend-verified account id; signOut clears it and pre-auth events are not buffered.

Remaining: verified identity/sign-out wiring, explicit consent UX, all action mappings besides Brand success, development project separation, real non-production PostHog dashboard verification, and policy review. Do not close #81. No remote test events or private user data sent during this work.

SDK contract: https://posthog.com/docs/libraries/node . Local package types were checked against the installed version. Focused tests: posthog.spec.ts and product-analytics.spec.ts. Affected motif-core compile passes; full repository baseline remains caveated by #86.

## Revocation hardening (review follow-up)

The Host adapter now checks current verified-identity/consent state again at the SDK transport, not only at capture. Sign-out, policy disable, account switching or close irreversibly revokes this instance, aborts active fetch signals and drops queued transport without contacting the ingestion service. Re-consent must create a fresh adapter and perform verified sign-in again; it cannot replay an old queue. Close is idempotent. Requests already received by a server before revocation cannot be recalled. No remote smoke test was run. The real application still has no verified auth wiring and emits no product events.
