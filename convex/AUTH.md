# Convex authentication for MOTIF (issue #50)

This directory is the Convex backend for MOTIF's shared multi-user platform. It implements email+password
authentication with Convex Auth v2, running entirely inside the owner's own Convex deployment. No external
auth service (no WorkOS, no Clerk) is involved. Google, GitHub, and Apple sign-in are intentionally deferred:
each needs an OAuth app registered with its provider, and Apple additionally needs a paid Apple Developer
membership. The owner chose email+password first.

## What is deployed

Dev deployment `fantastic-gull-31` (project `motif`, team `abo-shanabes`), pushed with `npx convex dev`:

- `convex.config.ts` registers the Convex Auth core, the email and password components, and the Resend
  component used to deliver validation, recovery, and security-notification emails.
- `auth.config.ts` accepts Convex Auth access tokens; the deployment signs them with its own key, so there
  are no token secrets to configure.
- `auth.ts` exports the full email+password flow: sign-up, email validation, sign-in, sign-out, session
  refresh, password change, email change, and password recovery.
- `schema.ts` adds `users` (profiles, created by the auth callback) and `brands`, the reference
  identity-bound application table.
- `brands.ts` is the reference implementation of the issue-50 identity boundary: every function derives the
  owner from `ctx.auth.getUserIdentity()` and refuses anything it cannot verify. Caller-supplied owner ids
  are never accepted, and cross-owner reads and writes fail closed.

## Required configuration (owner action)

Email delivery goes through Resend. Until a real key is set, sign-up and recovery emails will fail to send:

1. Create a free Resend account (https://resend.com).
2. Create an API key and deliver it through the Instinct vault link, never through chat.
3. For development, `SENDER_EMAIL=onboarding@resend.dev` delivers only to the Resend account owner's own
   email address. For production, verify a sending domain in Resend and update `SENDER_EMAIL`.
4. Set `SITE_URL` on the deployment to the frontend origin so emailed links point at the app
   (default is `http://localhost:3080`).

The agent sets the env vars with `npx convex env set` once the key arrives via the vault.

## What remains (not in this PR)

- Live acceptance of the separate `apps/web/account.html` client described below. `VITE_CONVEX_URL` comes from `.env.local`, which stays untracked.
- Binding the legacy Host services (Brand folders, workspace registry, sessions, settings, native CLI
  connections) to verified identity, per the decision plan: owner namespace from verified issuer+subject,
  never a caller-supplied user id; fenced reconnect/session expiry and in-flight jobs; no developer-mode
  bypass; explicit import/claim inventory for legacy local data with an atomic single-winner server-side
  claim, backup, and audit mapping. Until that lands, the local Host APIs remain single-user local data and
  must not be exposed as shared.
- OAuth providers (Google, GitHub, Apple) once the owner registers them.
- End-to-end tests: sign-up/sign-in/sign-out/restoration/expired token, missing config, issuer/audience/
  signature refusal, two-user cross-read/write prevention at every data boundary, job ownership and
  cancellation, reconnection, concurrent legacy claim and rollback.

Docs verified 2026-11-23: https://docs.convex.dev/auth/convex-auth,
https://docs.convex.dev/auth/convex-auth/getting-started,
https://docs.convex.dev/auth/convex-auth/methods/email-password

## Account client (PR-only implementation, November 24)

The Web build emits `account.html`, a separate React/Convex Auth v2 client. It includes sign-up, email validation, sign-in, password recovery/reset, restored sessions and sign-out, with owner-bound account Brand listing/creation. It never imports `AppWebEntry`, Host bootstrap, local RPC, native CLI, model credentials or filesystem data. A signed-in user does not gain a shared Host connection. Local single-user `index.html` remains separate. This is not finished multi-user runtime isolation.

Build with an explicit HTTPS `VITE_CONVEX_URL`. With no valid deployment URL the page shows an unavailable explanation and does not request credentials. Do not add private keys to VITE variables. The default SITE_URL is now port 3080; production must set its exact account-client origin. Email links target `account.html?flow=validate` and `account.html?flow=reset`. The installed library holds browser secrets and handles refresh coordination; links must open in the browser that started them. Email-change UI is not included.

Code-only tests cover restoration, sign-in failure/password clearing, recovery navigation and the no-shared-Host boundary. The standalone production entry builds. Live sign-up/mail delivery and two-user end-to-end data boundaries have NOT been validated in this PR. Earlier claims above about deployment are historical, not reverified here.

To finish live account acceptance requires:

- Owner-authorized Convex deployment access and the generated backend files/codegen, then deploy the existing functions/components with the final URL.
- Resend API key via secure secret entry, a verified sender/domain (or owner-only development sender), SENDER_EMAIL and exact SITE_URL.
- Two controlled test email accounts and permission for test sign-up/recovery mail, session revocation and cross-user Brand checks.
- A separately approved isolated runtime provisioner, JWT verifier and authenticated gateway. Each owner needs a private process/container/VM or OS user with private home, credentials, jobs and generation fencing. No connection to the current shared local Host is permitted as a substitute. Provisioning/deployment/spend are outside this PR.
