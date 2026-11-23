# Convex authentication: decision and integration gaps

No authentication or data migration is implemented by this document. The issue remains open.

## Decision (owner, 2026-11-23)

- MOTIF is a shared multi-user platform: multiple people sign in. Single-user local identity is ruled out.
- Backend/auth platform: Convex (convex.dev).
- The owner has a Convex account but no project yet.
- Sign-in methods required: Google, Apple, GitHub, and email+password.

Official Convex docs verified on 2026-11-23:
- https://docs.convex.dev/auth/authkit/add-to-app
- https://docs.convex.dev/auth/functions-auth

The documented React route uses WorkOS AuthKit and ConvexProviderWithAuthKit. Client auth state must be useConvexAuth, not merely AuthKit's user object. Backend functions call ctx.auth.getUserIdentity and authorize ownership; browser visibility is not security. WorkOS client/redirect configuration and a deployed Convex auth configuration are needed for a real lifecycle smoke.

## Provisioning steps the owner must do (cannot be done silently)

1. Convex project: sign in at dashboard.convex.dev (easiest with his GitHub) and create the project, or be present when `npx convex dev` first-run provisioning prompts the login.
2. OAuth applications per provider (each yields a client ID and secret; secrets go into Convex/WorkOS configuration, never into chat or the repo):
   - GitHub: OAuth App under github.com/settings/developers. Minutes, free.
   - Google: OAuth client in Google Cloud Console with the app's redirect origins.
   - Apple: Sign in with Apple requires a paid Apple Developer account ($99/year), a Services ID and key. If no Apple Developer membership exists, Apple sign-in waits; the other three methods work without it.
   - Email+password: no external app needed (Convex password provider / AuthKit email).
3. Decide redirect origins for development and production builds (desktop deep link vs web URL).

## Integration requirements (unchanged by the decision)

MOTIF currently has local Host Brand folders, workspace registry, sessions, settings, native CLI connections and a shared Cordis renderer. Adding Convex tables beside those services would leave the original Host APIs as a cross-account bypass. The implementation must bind verified identity to each protected Host RPC, file/media endpoint and job; derive owner namespace from verified issuer+subject, never from a caller-supplied user ID; fence reconnect/session expiry and in-flight jobs; and ensure developer mode exposes no bypass.

Safe migration: leave existing folders untouched and unclaimed. After sign-in, show an explicit import/claim inventory and preserve a backup and audit mapping. A server-side atomic claim must bind an unclaimed record to exactly one verified owner; concurrent claims must have one winner. Do not auto-claim based on matching email or current OS username, and never silently delete or orphan the old folder.

Required tests before completion: sign-up/sign-in/sign-out/restoration/expired token, missing config, issuer/audience/signature refusal, two-user cross-read/write prevention at every data boundary, job ownership/cancellation, reconnection, concurrent legacy claim and rollback. Desktop and web must both be exercised where supported. No mock login state can establish these properties.
