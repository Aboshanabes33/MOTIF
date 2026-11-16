# MOTIF Unified Provider Authentication

Status: implemented and unit-tested against mocked provider networks on 2026-11-16. No real
provider account has been charged or called from this checkout, so an API key flow is verified
to the request shaping, Pi SDK boundary and tests—not to a live billable account.

## Audit outcome

The demo had one Pi SDK credential boundary (`pi.server.ts`) and one shared registry, but the
page held only a random browser token in `localStorage`. Every link was kept in process memory,
any provider connection was not durable, metadata and credentials were not encrypted at rest, a
second tab belonged to the same process-global slot rather than a verified principal, and the UI
presented an unsupported ChatGPT preset. It did not read `OPENAI_API_KEY` at request time, and it
never used Pi's default `auth.json`, which were important foundations to keep.

MOTIF still has no real browser login or database. It now has a narrow, replaceable owner
boundary: a signed, `HttpOnly`, `SameSite=Lax` cookie (`motif.principal`) created by the server.
It is not a user account, does not replace Whop/Convex/Supabase identity, and must be mapped to a
real user id before multi-user data access is opened. The current provider store is an encrypted,
process-local vault; it is the smallest safe default for this checkout, not the final Convex
schema required by ABSH-37/ABSH-9.

Supabase is deliberately not installed: the repository does not use it, the same mission's
Linear architecture issues point to Convex, and adding this unrelated data plane would blur the
boundary. The vault interface (`connection-vault.server.ts`) is the seam to replace with a
Convex-owned secret manager or an external KMS/secret store later.

## Official findings

- **OpenAI / ChatGPT / Codex**
  - OpenAI's public API authenticates with API keys or workload identity, not with a
    third-party grant to a visitor's ChatGPT plan.
  - OpenAI documents Sign in with ChatGPT for approved first-party/Codex use and preview
    employers; MOTIF must not reuse Codex CLI's OAuth client or imply ChatGPT Plus/Pro is an
    API entitlement.
  - Sources: <https://developers.openai.com/api/reference/overview>,
    <https://platform.openai.com/docs/actions/authentication>,
    <https://developers.openai.com/siwc/quickstart>,
    <https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations>
  - **Offered:** API key only.

- **Anthropic Claude**
  - Anthropic's face to third-party developers is the API, cloud providers and API-key auth.
  - Anthropic's legal guidance bars arbitrary third-party applications from offering Claude.ai
    login or collecting/routing Claude.ai credentials.
  - Source: <https://code.claude.com/docs/en/legal-and-compliance>
  - **Offered:** API key only, with the Claude Pro/Max limitation stated in the dialog.

- **OpenRouter**
  - OpenRouter documents BYOAI: a browser flow starts at `https://openrouter.ai/auth`, verifies
    the state and PKCE/S256 result, then exchanges the code for a user-controlled API key.
  - MOTIF offers that flow in addition to a normal API key.
  - Sources: <https://openrouter.ai/docs/guides/overview/auth/oauth>,
    <https://openrouter.ai/docs/api_reference/authentication>
  - **Offered:** OpenRouter BYOAI PKCE and API key.

- **xAI Grok / SuperGrok**
  - xAI documents API-key authentication for the API. Device-code/OAuth documentation in the
    installed Pi SDK is Grok Build/X CLI/enterprise shaped, not a public third-party OAuth API
    for hosted arbitrary applications.
  - Sources: <https://docs.x.ai/docs/api-reference#api-key>,
    <https://docs.x.ai/developers/rest-api-reference/inference/models>,
    <https://docs.x.ai/build/enterprise>, <https://docs.x.ai/build/settings/reference>
  - **Offered:** API key only.

- **Google Gemini**
  - Gemini API keys are the supported simple integration for hosted apps. Google OAuth is for
    Cloud/ADC-style access and is not a consumer Gemini entitlement for an arbitrary hosted app.
  - Sources: <https://ai.google.dev/gemini-api/docs/api-key>,
    <https://ai.google.dev/gemini-api/docs/oauth>
  - **Offered:** API key only.

- **GitHub Copilot**
  - GitHub documents an OAuth flow for multi-user apps with a registered GitHub OAuth App or
    GitHub App, per-user token isolation, server-side exchange and a Copilot subscription.
  - Pi's bundled Copilot device flow reuses first-party Copilot/VS Code identity material and is
    deliberately not surfaced by MOTIF.
  - Sources:
    <https://docs.github.com/en/copilot/how-tos/copilot-sdk/setup/github-oauth>,
    <https://docs.github.com/en/copilot/how-tos/copilot-sdk/setup/auth/authenticate>,
    <https://docs.github.com/en/copilot/reference/copilot-allowlist-reference>
  - **Offered:** not enabled. A MOTIF-owned, per-user OAuth App and token exchange are required
    before the button may appear.

- **OpenCode Zen / Go**
  - OpenCode is open source (MIT), but its CLI/server stores provider credentials in the server's
    global SQLite database. Its line/`connect` UI and `/provider/{id}/oauth/*` endpoints are
    server/CLI features, not a portable client-secret-free library for per-user MOTIF credentials.
  - MOTIF does not import or run the OpenCode runtime to obtain SSH/OAuth state.
  - Sources: <https://opencode.ai/docs/providers/>, <https://opencode.ai/docs/sdk/>,
    <https://opencode.ai/v1/docs/server/>, <https://github.com/anomalyco/opencode>,
    <https://github.com/anomalyco/opencode/blob/dev/LICENSE>
  - **Offered:** OpenCode Zen and OpenCode Go API keys only.

- **Pi runtime**
  - Pi owns provider-specific authentication and model IDs. Its installed credentials are behind
    the `CredentialStore` contract, not behind a MOTIF OAuth abstraction. MOTIF therefore reuses
    Pi for credential-backed model resolution/completion rather than replacing provider adapters.
  - Sources: <https://github.com/earendil-works/pi>,
    <https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/providers.md>,
    <https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/models.md>,
    <https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/custom-provider.md>,
    installed packages `@earendil-works/pi-ai@1.5.2` and
    `@earendil-works/pi-coding-agent@1.5.2`.

## Implemented architecture

```text
browser dialog (AccountLink.tsx)
  -> TanStack server functions (account-link.functions.ts)
  -> AccountLinks manager (account-link.server.ts)
       -> provider-registry.ts       (the only provider/method/docs registry)
       -> provider-validation.server.ts (does this credential work? what can it reach?)
       -> connection-vault.server.ts  (AES-256-GCM, principal-isolated credentials + metadata)
       -> principal.server.ts          (signed HttpOnly motif.principal cookie)
       -> pi.server.ts                 (Pi ModelRuntime; only Pi SDK import boundary)
  -> AI calls (ai.server.ts -> Pi)     (active connection only; no server key fallback)
  -> OpenRouter callback (/api/auth/$provider/callback)
```

- One registry lists providers, permitted methods, docs, restrictions, validation endpoints,
  availability and default models. Adding a supported API-key provider is a descriptor plus a Pi
  provider ID/model check, not a UI rewrite.
- The authentication layer (`AccountLinks`, callback route) resolves the principal, verifies the
  key/code, writes metadata only after validation, tracks model eligibility and disconnects.
- Pi performs inference and credential-backed model resolution.
- The UI renders only `providerViews()`, so unavailable/unapproved methods are not buttons.
- Model selection is a connection property and `acceptsImages()` is the vision gate for both
  choosing a model and sending a prompt.
- OAuth and API-key methods are separate from subscription entitlement and from model selection.
  Neither is marked connected until credentials pass validation and storage succeeds.

## Credential and OAuth security

- Browser JavaScript never receives an API key, OAuth client secret, access token or refresh
  token. The principal cookie contains an opaque signed id only.
- Credentials and PKCE flows are serialized into an AES-256-GCM envelope in
  `.motif/connections.enc` by default (override with `MOTIF_SECRETS_FILE`), with atomic writes
  and `0600` permissions. Raw JSON is never written.
- `MOTIF_SESSION_SECRET` (or `MOTIF_CREDENTIALS_KEY` for the vault independently) is required in
  production. In development only, missing secrets fail less loudly via ephemeral in-memory keys.
- The vault uses HKDF from the session secret when no independent vault key is configured.
- PKCE flows store only a one-time state/verifier server-side. The callback consumes state once,
  rejects wrong/expired/replayed states, validates the minted key, and only then stores it.
- Disconnect deletes the local stored credential and metadata; it cannot revoke a key at the
  issuing provider, and the UI/docs say so.
- Provider errors are reason-mapped (`rejected`, `limited`, `unreachable`, `not_linked`,
  `no_vision`) and are not echoed with provider request bodies, which can repeat key material.
- No provider key is read from `OPENAI_API_KEY` or other process env fallbacks at request time.
- Pi's default `auth.json` is not used: its file credential store expands `!command` and `$ENV`.
- Server-only `*.server.ts` imports remain build-enforced; browser code has no credential store.

## Deployment requirements and current blockers

- Set `MOTIF_SESSION_SECRET` to at least 32 random characters and, if desired,
  `MOTIF_CREDENTIALS_KEY` to a base64 32-byte key.
- Set `MOTIF_PUBLIC_BASE_URL` to the absolute public origin for stable OAuth callbacks. If unset,
  the start server infers the origin from the incoming request; production deployments should set
  it explicitly.
- A single long-running Node.js process is supported. Vault writes are process-serialized but do
  not implement cross-process/distributed locking. Use Convex/KMS-backed shared secret storage
  before multiple replicas or serverless workers are used.
- The cookie principal is not Whop/Convex identity. Do not expose provider data across workspaces
  until the deployment maps it to the real user and enforces row/ownership checks. ABSH-37 and
  ABSH-43 remain the right work.
- Provider API calls are made server-side by Pi. MOTIF intentionally has no proxy quotaing or
  rate limiting yet.
