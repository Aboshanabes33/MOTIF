# MOTIF Unified Provider Authentication

**Verification boundary (2026-11-18):** audited revision `9e2fec4` against ABSH-10 and its
sub-issues. The production web app, signed cookie, encrypted file and Pi run in the browser
journey; only the external provider is simulated. This is not evidence of provider approval, live
model entitlement or a successful charge. The authorized sandbox check is opt-in (below).

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
  - Identity-only sign-in does not consent to inference. The [integration cookbook](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt) directs remotely hosted/paid apps to request access for plan usage. No approval or registered client for MOTIF was established. Even approved preview access is not the full API (no video/audio inputs or Files API). Neither another app's OAuth registration nor its MIT license grants that access.
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
  - **Offered:** Gemini Developer API project key only, not a Google identity login or [Vertex AI cloud credentials](https://cloud.google.com/docs/authentication).

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
  - MOTIF has no OpenCode CLI/SDK dependency or child process. Compare the [upstream credential schema at audited revision bb01d3e](https://github.com/anomalyco/opencode/blob/bb01d3eeccbca4db324d5997db1507ca919a274c/packages/core/src/credential/sql.ts) with MOTIF’s `package.json`, `provider-registry.ts` and `pi.server.ts`. Only the gateways are used.
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

- Typed keys are transient password-field input. Server responses never include a stored key, OAuth client secret, access token or refresh token. The principal cookie contains an opaque signed id only.
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
- Set `MOTIF_PUBLIC_BASE_URL` on the server to the canonical HTTPS origin for production OAuth. Only development infers an origin from the request. Users never configure a redirect URL.
- A single long-running Node.js process is supported. Vault writes are process-serialized but do
  not implement cross-process/distributed locking. Use Convex/KMS-backed shared secret storage
  before multiple replicas or serverless workers are used.
- The cookie principal is not Whop/Convex identity. Do not expose provider data across workspaces
  until the deployment maps it to the real user and enforces row/ownership checks. ABSH-37 and
  ABSH-43 remain the right work.
- Provider API calls are made server-side by Pi. MOTIF intentionally has no proxy quotaing or
  rate limiting yet.

## Epic 7 acceptance audit

| Sub-issues | Evidence at `9e2fec4` | Outcome on this branch |
|---|---|---|
| 72–79, 81, 83–85, 87: products, policies, custody | `package.json`, `provider-registry.ts`, `pi.server.ts`, official findings above. Pi 1.5.2, not an OpenCode process, handles chat. | Retain supported methods. No ChatGPT inference grant, Claude consumer credential, Copilot registration, or Vertex integration assumed. Provider/security peer sign-off is external. |
| 80, 82: keys, architecture, model/session selection | The existing dialog and signed principal worked. `mergeModels` returned **all** Pi models; `status` and `chooseModel` discarded the validation response. | Save the intersection with the validated catalogue, including modality and pricing metadata. OpenRouter uses its authenticated [user model list](https://github.com/OpenRouterTeam/typescript-sdk/blob/main/src/funcs/modelsListForUser.ts). A listing is not a guarantee of credit or inference permission. No billable validation prompt. |
| 76, 86, 88: OAuth | S256 exchange and owner-bound state existed; a declined callback skipped state consumption. | A matching denial consumes that attempt without exchanging. Missing session, mismatch, expiry and replay cannot link. Redirect only to fixed local outcomes with no-store/no-referrer. Exclude callback query strings and submitted forms from proxy access logs. |
| 90, 91, 93: errors, reconnect and status | `needs_reconnect` was defined but inference did not update it; a failed status fetch could leave “Checking…” indefinitely. | Last validation, known expiry, authentication rejection, transient failure, quota, unknown and retry are distinct. Reconnecting validates before replacing the old key. A stale inference cannot invalidate its replacement. Optional server-only `MOTIF_SENTRY_DSN` sends only provider ID, operation and classified reason, not request/response data. |
| 89, 92, 94, 95: duplicates | Canonical scope is **56, 59, 61, 54** respectively. | Reuse the encrypted vault. Confirm local removal, invalidate pending connects and never claim remote revocation. OpenRouter BYOAI issues a key, **not a refresh token**. Honor `expires_at` when supplied; otherwise there is no invented expiration. None of the enabled methods authorizes an automatic refresh grant. A 403 can be model-specific, not an expired credential. |

### Operational boundaries

- The selected provider/model is saved for the signed browser principal across reloads and process restarts with stable secrets. This is not cross-device identity or persistence of the editor's demo transcript. Existing v1 vaults without discovered models retain their selected model; reconnect to populate the full filtered list.
- Keys, including BYOAI-minted keys, consume the issuing provider's account balance, project quota or gateway allowance. If compromised, revoke at that provider first, disconnect in MOTIF, then issue a replacement. MOTIF does not request management keys for remote deletion. In-flight provider work already dispatched cannot be recalled.
- The encrypted vault protects a stolen file, not a compromised running server or stolen principal cookie. Run one least-privileged service user, terminate TLS, keep the encryption key in a separate secret manager, and restrict backup access and retention. A restored **old** vault may contain disconnected keys: do not restore to serving traffic without reconciling revocations. Keep callback query strings, headers, form bodies and provider errors out of application, proxy and analytics capture.
- New model/status fields are additive; no second database or migration is needed. For rollback stop the service first; do not roll back credential contents to roll back code. If a vault key is lost, the supported recovery is a fresh vault and owner reconnection. For a compromised encryption key, revoke affected provider keys before provisioning new vault material. Managed re-encryption, verified account identity and multi-replica coordination remain Epic 6 deployment decisions, not features of this single-process vault.

### Reproduce the checks

1. `npm ci && npm test` runs the server/vault, Pi and component tests without live provider credentials. `npx tsc --noEmit` checks types.
2. Install a compatible headless Chromium (`npx playwright-core install chromium` or set `CHROMIUM_PATH` to an installed executable). `npm run test:e2e` builds and runs a fresh production server with a temporary vault, a real browser, isolated provider HTTP fixtures and no production secrets. It covers consent denial, PKCE exchange, callback return, selection surviving reload, inference through Pi, quota, confirmed disconnect and API-key reconnect.
3. **Authorized sandbox only:** provision a restricted, nonproduction key and allowed model via a local secret manager. Set `MOTIF_RUN_PROVIDER_SANDBOX=1`, `MOTIF_SANDBOX_PROVIDER` (registry ID), `MOTIF_SANDBOX_MODEL` and `MOTIF_SANDBOX_API_KEY`, then `npx vitest run src/test/provider-sandbox.test.ts`. This makes one short inference and may spend provider credit. Without opt-in the check is skipped. Never submit secrets in issues, test output or chat.
4. A real consent screen requires a human-approved test tenant: on the staging HTTPS origin, decline first, restart, approve, select a listed model and run one authorized request. Confirm local disconnect and revoke the sandbox key at the provider. Record only provider, date, model and outcome. Do not enable ChatGPT plan usage to run this check.
