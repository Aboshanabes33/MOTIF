# Plan: zero-friction OAuth account connection

The owner asked for a connection experience where a user clicks **Connect ChatGPT** or **Connect
OpenCode**, approves on the provider's own page, and MOTIF does the rest: no callback URL, no pasted
redirect, no localhost port, no OAuth vocabulary, no token handling by hand. This document is the
deliverable the owner asked for before implementation: the audit of what exists, what the provider
APIs actually support (verified against the installed packages, not from memory), which flows are
impossible in a remote multi-user web deployment, the design for one that works, and the revised
implementation plan.

Everything below was checked on 2026-11-14 against the code in this repository and the installed
packages. Each claim that drove a decision carries the evidence for it.

---

## 1. Verdict in one page

1. **The one-click experience is achievable for both providers, but only through each provider's
   device-authorization flow — not through the localhost redirect flow the app uses today.**
   - OpenAI: the installed SDK already ships an OpenAI device flow (`openai-codex`), and it works
     from a remote server. It is reachable today, but only by an internal `select` prompt whose
     second option a web user must never see.
   - OpenCode: no device flow exists in the SDK at all. The `pi-provider-opencode-console` extension
     supplies one; it loads and registers correctly against the installed SDK, but it **cannot be
     used per user in a web deployment** because it keeps every account in one shared file.
2. **The current OpenAI path cannot be made seamless as designed.** `openai` — the provider behind
   today's "Sign in with ChatGPT" — hardcodes `http://127.0.0.1:1455/auth/callback` and always asks
   for a pasted redirect URL when the browser is not on the server. It rejects any other redirect URI
   at token exchange. Its only positive property here is that OpenAI registers a fresh client per
   sign-in, i.e. it is designed for third-party apps; the device flow uses the Codex CLI's client
   instead and its availability is decided by OpenAI per account.
3. **So there is a genuine trade-off, and it is the owner's to settle** (§7): the flow that needs no
   configuration uses OpenAI's Codex client and is documented by the provider only for its own CLI;
   the flow that is clearly sanctioned for third-party apps needs a registered client ID and cannot
   avoid the localhost redirect. I recommend offering both, with one of them as the default.
4. **The minimum change that delivers the acceptance criterion is small and contained:** reuse the
   SDK's existing device flow to get a code, replace the blocking `select` prompt with a host-supplied
   choice, and stop emitting the paste prompt in web mode. No port, no callback URL, no pasted
   redirect.
5. **Before "Connected" can be durable, three things in the current implementation must change:**
   credentials live in process memory (a restart forgets every account), only one sign-in can run per
   server (a second user is told to wait), and there is no identity or encryption (the plan's own
   step 9). Those are the dependencies of this work, not part of it.
6. **The asynchronous part of the flow (the server does the work; the browser only watches) is what
   makes concurrency and isolation possible.** The current design blocks an HTTP request while it
   waits for the provider, which is precisely why it had to allow one sign-in at a time.

---

## 2. What exists today (audit)

| Area              | File(s)                                                       | State                                                                       |
| ----------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Providers offered | `src/lib/account-link.ts`                                     | `openai` (key, or sign-in), `opencode` (key), `opencode-go` (key)           |
| Link store        | `src/lib/account-link.server.ts`                              | In memory, one `Link` per browser token, 24 h idle drop, max 500            |
| Provider runtime  | `src/lib/pi.server.ts`                                        | The only file importing the SDK; `ModelRuntime` + `InMemoryCredentialStore` |
| Server functions  | `src/lib/account-link.functions.ts`                           | 7 TanStack Start server functions, Zod-validated                            |
| UI                | `src/components/AccountLink.tsx`, `src/lib/useAccountLink.ts` | Pop-up on open, sign-in view, model picker, unlink, sidebar entry           |
| Token             | `src/lib/link-token.ts`                                       | Random token in `localStorage`; names the link, is not a credential         |
| Tests             | `src/test/*`                                                  | 73 passing; SDK tests run the real SDK with network replaced                |

How a sign-in works today: `startSignIn` calls `runtime.login(providerId, "oauth", …)`, which blocks
the server function until the provider's sign-in finishes or fails, and streams the provider's
`auth_url` / `device_code` / prompts to the pop-up, which polls `getLinkStatus` every 2 s.

**Defects relative to the requirement:**

| #   | Defect                                                                                                  | Evidence                                                                                |
| --- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| A1  | A remote web deployment gets "paste the callback URL" — the exact thing the requirement forbids         | `openai-chatgpt.js:22` fixed `REDIRECT_URI`; `:226` always emits a `manual_code` prompt |
| A2  | Only one sign-in can run on the whole server; a second user is told to wait                             | `account-link.server.ts:100,123,200` (`BUSY`, single `signingIn`)                       |
| A3  | A restart forgets every connected account                                                               | `pi.server.ts:91` in-memory store only                                                  |
| A4  | A link belongs to a browser token, not a Whop identity                                                  | `link-token.ts`; noted as a known gap in `AGENTS.md`                                    |
| A5  | Credentials are not encrypted at rest                                                                   | No persistence at all yet                                                               |
| A6  | The user is shown technical steps: "Open the sign-in page", "copy its address"                          | `AccountLink.tsx` `SignIn` view                                                         |
| A7  | OpenCode users must find and paste an API key; there is no account connection                           | `LINK_PROVIDERS` has no `signIn` for either OpenCode provider                           |
| A8  | Below the SDK's device-code event, the device flow is not reachable without showing the user a `select` | `openai-codex.js:326-330`                                                               |

None of A1–A8 is a bug in the SDK: the SDK is a coding-agent library for a single developer on their
own machine, where a loopback port and a paste field are reasonable. Using it from a shared web app
is what turns those into defects.

---

## 3. Provider APIs, as actually implemented

Checked by reading the installed `@earendil-works/pi-ai@1.5.2` and running the real SDK in the
sandbox (provider registry, login entry points, extension loading). The sandbox cannot reach any
provider host, so live token exchange is **not** verified (§8).

### 3.1 OpenAI: two independent OAuth providers, and they are not interchangeable

The SDK registers two providers that both mean "a ChatGPT subscription":

| Provider       | Sign-in flow                             | Redirect URI                                 | Client ID                                       | Works from a remote server without a paste? |
| -------------- | ---------------------------------------- | -------------------------------------------- | ----------------------------------------------- | ------------------------------------------- |
| `openai`       | Sign in with ChatGPT (third-party style) | `http://127.0.0.1:1455/auth/callback` fixed  | `dynamic_agent_client` (registered per sign-in) | **No**                                      |
| `openai-codex` | Browser login **or** device code         | browser: same port 1455; device: server-side | `app_EMoamEEZ73f0CkXaXp7hrann` (Codex CLI)      | **Yes** (device code)                       |

- `openai` (`providers/openai.js:14`) uses `openai-chatgpt.js`. `auth.openai.com/api/accounts/authorize`
  issues a client ID per sign-in and returns it in the callback, which is how OpenAI invites
  third-party apps into this flow. The flow has **no device branch at all**.
- `openai-codex` (`providers/openai-codex.js:12`) uses `openai-codex.js`. Its login begins with
  `interaction.prompt({ type: "select", … "Browser login (default)" / "Device code login (headless)" })`
  (`:326`). Choosing device code:
  1. `POST https://auth.openai.com/api/accounts/deviceauth/usercode` → `user_code`, `interval`
  2. notify `{ type: "device_code", userCode, verificationUri: "https://auth.openai.com/codex/device" }`
  3. poll `…/deviceauth/token`; `403`/`404` mean pending; `200` returns `authorization_code` + `code_verifier`
  4. `POST /oauth/token` with `redirect_uri=https://auth.openai.com/deviceauth/callback`
     Nothing listens on a port and nothing is pasted. **This is the same protocol the Codex CLI uses for
     headless machines**, and it is confirmed by external implementors porting
     `codex-rs/login/src/device_code_auth.rs`.
- In the sandbox I exercised the entry point: `rt.login("openai-codex","oauth",…)` asks the `select`,
  and answering `"device_code"` proceeds straight to the usercode request (which the sandbox network
  refuses, as expected). The path is live in this SDK version.
- The `AuthEvent` union makes `notify` total: an `openai` sign-in **always** produces a `manual_code`
  prompt (`callback-server.js:121`) when the loopback server does not receive the redirect. On a
  remote deployment it never will.
- Scope difference: `openai-chatgpt` requires `chatgpt.tokens.use.direct` (`:23`, enforced at `:150`)
  and calls `api.openai.com` with the user's token; `openai-codex` stores a `chatgpt_account_id` from the
  ID token and calls `chatgpt.com/backend-api`. They are different contracts with different risk.
- **Availability caveat:** OpenAI decides server-side whether the Codex device flow is enabled for an
  account/client; a `404` on the usercode request means "not enabled for this account". A third-party
  tool that reproduces this flow reports the same, and also reports that the third-party `openai`
  flow is refused outright on ChatGPT Business (`3p_delegated_access_policy_denied`). So for some
  users the Codex device flow is the _only_ way in, and for others the `openai` browser flow is.

### 3.2 OpenCode: the SDK has no account sign-in; the extension does, but is single-tenant

- `providers/opencode.js:14` and `providers/opencode-go.js:13`: `auth: { apiKey: envApiKeyAuth(…) }`.
  **No `oauth` key.** Runner check: both providers report `auth: ["apiKey"]`. So today's plan
  statement "OpenCode Zen and OpenCode Go take an API key only" is correct **for the SDK**.
- `pi-provider-opencode-console@2.1.2` (MIT, publishes raw TypeScript, peer deps `*`) registers
  `opencode-console` and `opencode-go-console` as **OAuth-only** providers. It implements RFC 8628
  against `https://opencode.ai/console`:
  - `POST {server}/auth/device/code` `{ client_id: "opencode-cli", supports_org_scope: true }`
    → `device_code`, `user_code`, `verification_uri_complete` (e.g. `https://opencode.ai/console/device?user_code=…`)
  - `POST {server}/auth/device/token` with the device-code grant; `authorization_pending`,
    `slow_down`, `expired_token`, `access_denied` handled
  - then `GET /api/user`, `GET /api/orgs`, optional org scope from `org_id`, and an org-scoped
    `GET /api/config` catalog (Go: public `https://opencode.ai/inference/go/v1/models`)
  - `client_id: "opencode-cli"`: the OpenCode CLI's own public client. OpenCode documents this flow
    for third-party consoles (an arbitrary `client_id` is accepted; a bad one returns `400`), and
    other projects integrate the same endpoints.
- **Compatibility with our SDK:** verified by loading the extension's `src/index.ts` through the
  Pi extension loader's own `jiti` and feeding its `ExtensionAPI` into the installed
  `ModelRuntime`. Both providers register, `auth` is `["oauth"]`, and `rt.login(...)` reaches the
  network. So the extension is compatible with `1.5.2` in the register/login sense.
- **The blocker:** its credential handling is `readFile`/`writeFile` on
  `join(getAgentDir(), "auth.json")` (`src/auth.ts:29-30,353-370`), and its stream path reloads from
  that same file (`makeStreamLoader` → `loadCredential`). `getAgentDir()` is a **process-wide**
  directory (`config.js:510`). In a multi-user server every user's OpenCode session would land in one
  file, be readable by every user's requests, and be overwritten by the next sign-in. That directly
  violates brief §5 ("never use shared provider credential files between users"). It also bypasses the
  encrypted store this plan requires, and its `refreshProviderCatalog` depends on the file, not on the
  credential the SDK hands it.
- Consequence: **we can reuse the protocol (and its public details), not the extension as-is.** Two
  viable routes, costed in §5.

### 3.3 The rest of the provider matrix (for completeness)

The installed SDK registers 43 providers. Besides OpenAI, only `anthropic`, `github-copilot`,
`openrouter`, `kimi-coding`, `meta`, `xai` and `radius` carry an `oauth` method; none of the OpenCode
providers do. Every OAuth flow except `openai-codex`'s device branch, `github-copilot`, `kimi-coding`
and `meta` depends on a loopback port and/or a paste. That is the general shape of the problem: only
device flows are remote-friendly, so OpenCode's account connection is the difficult half.

---

## 4. Design: remote, multi-user, one click

### 4.1 The shape of a sign-in

The remote deployment cannot receive any redirect: the provider has no URI to redirect to that
belongs to us. So the browser performs **no network role in the flow** — the server talks to the
provider, and the browser only displays what the server learns and watches for the outcome. This is
the same principle as a QR code on a TV: the device polls, the phone approves.

```
Browser                    MOTIF server (Hono)                      Provider
  │  POST /connect {provider}     │
  │─────────────────────────────►│  create attempt{id, state nonce}
  │                              │  device authorization request ────────►
  │                              │◄──────────── user_code, verification_uri
  │◄── 201 {attemptId, url, code, expiresAt}                             │
  │  open provider page (top-level navigation, popup or new tab)         │
  │                              │  poll while pending ──────────────────►
  │  GET /connect/{id} (1–3 s)   │◄──────────────────────────────── 200 tokens
  │─────────────────────────────►│  → refresh/test (model discovery)
  │◄── {status: "connected", account:{email, org}, models:[…]}           │
```

Two rules follow from this and both are load-bearing:

- **A sign-in attempt is an object, not a blocked request.** That is what makes concurrent sign-ins
  from different users trivial: there is one record per attempt, keyed by its own random ID, with its
  own poller and abort controller. No shared port, no global "one at a time" gate (fixes A2).
- **Attempts are bound to the signed-in Whop user, not to a browser token.** The attempt record holds
  the user ID; every read and write checks it. A leaked attempt ID lets nobody do anything, because a
  different session fails the ownership check. This is what closes A4 for this feature.

### 4.2 The one decision the UI makes for the user

For a seamless result the browser must navigate to the provider page **without a click after the
server answers** (a popup opened after an `await` is blocked by every browser). Two workable ways:

- **(a) Popup opened synchronously on the click**, pointed at `about:blank` (or our own
  `/connect/bridge` page that says "Opening OpenAI…"), then given the provider URL as soon as the
  server answers. No click, and our origin can write a signal into that popup so the originating tab
  can react when the user approves and the popup navigates back to us. This is how desktop sign-in
  experiences feel.
- **(b) Top-level navigation to a full-page connect screen** that the server renders once it has the
  URL. Also one click, no paste; costs a page in our app and a "back to MOTIF" step at the end.

I recommend **(a)**, with **(b)** as the fallback when the popup is blocked (returning from
`window.open` must be checked, never assumed). Either way the user's only actions are _click Connect_
and _approve on the provider's page_; the code is already filled in by the provider's
`verification_uri_complete`-style URL where available, and is shown in large type if the provider's
page needs it typed.

### 4.3 OpenAI

Reuse `openai-codex`'s device flow; replace the blocking `select`; never emit the paste prompt in web
mode.

- The `select` (`openai-codex.js:326`) is how the SDK decides between browser and device login. The
  host answers it _immediately_ with `"device_code"` — the user already chose by clicking **Connect
  ChatGPT** — so the `select` never surfaces. That is not a fork of the protocol; it is using the
  documented interaction handler as intended.
- The `manual_code` prompt comes only from the _browser_ branch. Since we never enter it, no paste
  field can appear. As a defence in depth the sign-in loop still refuses to render a `manual_code`
  prompt in web mode and fails the attempt with a friendly message instead (A1 cannot regress).
- The sign-in produces the same `oauth` credential shape as today, so model listing, completion,
  refresh and unlink keep working unchanged; `pi.server.ts` already handles `openai-codex`
  (`getAvailable`, `getAuth`, `completeSimple`). The model catalog is the 8 Codex models.
- **Two OpenAI entries, presented as one choice, not as a technical one.** "Connect ChatGPT" offers
  the device sign-in by default and, in a secondary position, "Having trouble? Sign in in this
  browser (needs this device to reach MOTIF)". The second uses `openai` on a self-hosted/Electron
  build where loopback works, and is hidden on the hosted web app. The copy explains the outcome
  ("uses your ChatGPT plan"), never the mechanism.

### 4.4 OpenCode

Two routes, and the plan's cost depends on which the owner wants:

- **Route 1 (recommended): a MOTIF-owned adapter that speaks the same public device protocol to
  `opencode.ai/console`.** Field-verified endpoint shapes and `opencode-cli` client semantics are in
  §3.2. The exchange and refresh run inside the attempt object and are stored in MOTIF's encrypted,
  per-user credential store, injected into `ModelRuntime` per user; the provider is registered as a
  custom `oauth` provider via `ModelRuntime.registerProvider` (verified: registration, login, `getAuth`
  and routing through a `streamSimple` that delegates to the SDK's own `openai-completions` API all
  work; URLs compose correctly to `…/inference/v1/chat/completions`). Model discovery uses
  `GET /api/config` with `x-org-id`, falling back to the public `/models` catalog.
  - Pros: one code path for web and Electron, no shared file, encrypted at rest, org/account info
    available for the "Connected account" UI, full control of concurrency.
  - Cons: ~250–350 lines we own; the message-format mapping for a mixed-model gateway is the risky
    part (the extension had to solve model routing, headers and API-kind selection, and has a bug
    history there). It also adopts a protocol the provider documents for consoles, not a formal
    third-party contract.
- **Route 2: load the extension per user with an isolated agent directory.** Its credential I/O goes
  through `getAgentDir()`, which honours the process environment variable `PI_CODING_AGENT_DIR`
  (verified). Isolating it per user would mean setting that variable around each operation — a
  process-wide mutable value in an async server, i.e. a race waiting to leak one user's credential
  into another's request. Rejected for the multi-user web app. It remains acceptable for a
  **local/Electron build**, where there is exactly one user and the file is that user's own.
  - If the owner prefers to start small, Route 2 behind a single-user guard is a legitimate first
    release for the local build, and Route 1 follows for the hosted one. The UI contract is the same.

### 4.5 What "Connected" shows

The attempt's terminal state carries what the UI needs, and nothing that is a secret:

```ts
type ConnectResult =
  | { status: "pending"; url: string; userCode?: string; expiresAt: string; intervalMs: number }
  | { status: "connected"; account: ConnectedAccount; models: ModelSummary[] }
  | {
      status: "failed";
      reason: "declined" | "expired" | "unavailable" | "rate_limited" | "unknown";
      message: string;
    };

type ConnectedAccount = {
  providerId: ProviderId; // openai-codex | opencode-console | opencode-go-console | …
  method: "device_code" | "browser" | "api_key";
  label: string; // "ChatGPT Plus", "OpenCode Console"
  account?: { email?: string; name?: string; orgName?: string };
  connectedAt: string;
  expiresAt?: string; // when the session token lapses; unset for API keys
  needsReconnect: boolean; // refresh failed or was refused
  models: ModelSummary[];
  selectedModel: string;
};
```

Never in this payload or any response: access token, refresh token, device code, PKCE verifier,
`org_id` the provider considers sensitive. Only the codes the user must read off the screen are
returned, once, to the owner of the attempt.

### 4.6 Boundaries the rest of MOTIF keeps

The existing `ProviderRuntime` interface already isolates the SDK, and the new work must not widen
it into the UI. The additions stay behind it:

- `beginConnect(userId, providerId)`, `pollConnect(userId, attemptId)`, `cancelConnect(...)`,
  `listConnections(userId)`, `disconnect(userId, providerId)`, `refreshConnection(...)`,
  `selectModel(userId, providerId, modelId)`.
- An `AuthFlowController` inside the adapter that owns attempt records, single-flight polling,
  intervals and back-off, expiry, and aborts. The Hono handlers only validate and delegate; the React
  components only render and poll. This keeps the "backend logic out of components" and
  "providers behind MOTIF-owned interfaces" rules intact, and it is the same object Electron will
  reuse locally.

---

## 5. Revised implementation plan

Phases are ordered so that every phase ends with something demonstrable and nothing depends on a
later phase to be correct. Effort is indicative engineering time, not calendar time.

### Phase 0 — Decisions (blocking, owner)

See §7. Everything below assumes the recommendation: device-first for both providers, `openai` as an
optional secondary for self-host/local builds, OpenCode via a MOTIF-owned adapter, with the
extension allowed only for a future local build.

### Phase 1 — Make the existing flow honest (small, no dependency on decisions)

Goal: nothing in the shipped app asks a web user for a callback URL.

1. Add `"openai-codex"` to `LINK_PROVIDERS` as the ChatGPT subscription sign-in, keeping `openai` for
   API keys; the pop-up shows one "Connect ChatGPT" button per provider, and API keys move into a
   secondary "Use a key instead" affordance.
2. In `pi.server.ts`, answer the `openai-codex` `select` with `"device_code"`; render
   `device_code` events as a first-class "code" state; refuse `manual_code` prompts in web mode.
3. Copy pass over `AccountLink.tsx`: no "open the sign-in page", no "copy its address". Words are
   _Connect_, _Waiting for you to approve in ChatGPT…_, _Connected_.
4. Tests: the SDK adapter test that already drives `openai-codex` gets a device-code case, a
   "manual code is refused" case, and a "select is answered without the user seeing it" case.

Acceptance: a user on a remote browser can connect ChatGPT with two actions (click, approve) and sees
zero technical text. OpenCode still needs an API key at the end of this phase.

### Phase 2 — Attempts: concurrency and isolation (depends on Whop identity from phase 2 of the brief)

1. Hono routes: `POST /api/connections/:provider/connect`, `GET /api/connections/attempts/:id`,
   `DELETE …/:id`, `GET /api/connections`, `DELETE /api/connections/:provider`,
   `POST …/:provider/refresh`, `PATCH …/:provider/model`.
2. `ConnectAttemptStore`: one record per attempt, random 128-bit ID, bound to the Whop user, 15 min
   TTL, per-user and per-IP rate limit (brief §9), abort on cancel and on shutdown.
3. Replace the single `signingIn` gate with per-attempt controllers; keep the existing per-link idle
   sweep semantics in the store layer.
4. Ownership tests with two concurrent users: neither can read, answer or cancel the other's attempt;
   both can complete at the same time.

Acceptance: two users connect different providers simultaneously; a third user's attempt ID is not
even confirmable.

### Phase 3 — Durable, encrypted credentials

1. A `CredentialVault` interface with two implementations: Supabase-backed (AES-256-GCM, per-user
   data key wrapped by a server master key, `credential_id` = HMAC of the Whop user + provider so the
   row does not reveal identity) and OS keychain for the future Electron build (brief §5).
2. Replace `InMemoryCredentialStore` with a per-user store that reads/writes through the vault; keep
   the SDK's rule that it is a `CredentialStore`, so the SDK refresh path (single-flight, `modify`
   serialization) keeps working.
3. Unlink = delete the row + call the SDK's `logout`; record that the provider side is not revoked
   (there is no revocation endpoint for either flow) so the UI copy stays truthful.
4. Token refresh: the SDK already refreshes under its credential lock; add a `needsReconnect` state
   when a refresh is refused, surfaced as "Reconnect" instead of an error.
5. Migration + RLS policies; service-role key stays server-side.

Acceptance: restart the server, every connected account is still there and works; unlinking removes
the ciphertext; a copied `credential_id` from another user's session cannot decrypt anything.

### Phase 4 — OpenCode (Route 1)

1. `opencode-auth.ts`: device authorization, token poll with `slow_down`/`expired_token`/`access_denied`,
   refresh grant (rotating refresh token, persisted atomically), server URL pinned to
   `https://opencode.ai/console` with a scheme+host allowlist and `OPENCODE_CONSOLE_SERVER` only for
   self-hosting, org scope honoured when present.
2. Register `opencode-console` / `opencode-go-console` per user with `oauth` (login wired to the
   attempt store) and a `streamSimple` delegating to the SDK's `openai-completions` /
   `anthropic-messages` / `google-generative-ai` implementations by model family, plus the
   OpenCode identity headers.
3. Catalog: `GET /api/config` with `x-org-id` → fallback to public `/models`; cache per connection,
   no disk.
4. Tests against recorded fixtures for every error branch, plus the "catalog unavailable" path.

Acceptance: "Connect OpenCode" is one click plus an approval; the models the workspace enables are
listed and selectable; a 45-minute-later request refreshes the token once and succeeds.

### Phase 5 — UI state machine

One component states, in plain language: `idle → waiting_for_approval → connected → needs_reconnect |
disconnected`. Each connection card: provider mark, connected account (email/org), plan label, model
selector, _Disconnect_, _Reconnect_. Failure copy maps provider reasons to one sentence and one action
(_Try again_, _Open the approval page_, _Use a key instead_). No OAuth terms anywhere in the UI copy;
the only code shown is a short user code, in a large, selectable block with a copy button.

Acceptance: a non-technical reviewer can connect and disconnect both providers without asking what a
callback URL is (this is the acceptance test for the whole feature).

### Phase 6 — Electron parity

The adapter is already UI-agnostic. The local build uses the vault's keychain implementation, may use
the loopback `openai` flow, and may allow the `pi-provider-opencode-console` extension in single-user
mode. No code moves; only the implementation choices injected at composition time change.

---

## 6. Security rules for this feature

- Attempt IDs are random and owner-checked server-side on every read; the browser never receives a
  token, device code or PKCE value it could replay.
- `state`/PKCE live only in the attempt record; the device flow has no redirect, so there is no URL for
  an attacker to intercept. The one-time user code binds the approval to the attempt server-side.
- Provider URLs are validated (`https:`, allowlisted host) before they are shown or redirected to;
  the UI never renders a provider-supplied message as HTML.
- No credential, token or provider error body reaches the browser or the log; the provider's reply can
  echo a secret. Failures are reduced to reason codes plus the HTTP status.
- Rate limits per user and per IP on `connect`; per user on `poll`; exponential back-off within the
  provider's `interval`. A `429` from the provider surfaces as "try again shortly", never as a retry
  storm (OpenCode's device endpoint is known to rate limit).
- Device codes expire (OpenAI 15 min, OpenCode 10 min); attempts expire with them and are swept.
- Unlink does not revoke at the provider — say so, and keep the client-side secret destroyed.
- Nothing is stored in `auth.json`: `InMemoryCredentialStore`, our vault, and per-user stores only.

---

## 7. Decisions only the owner can make

1. **Which OpenAI flow is the default.** The device flow is seamless but rides the Codex CLI's client
   and OpenAI can disable it per account; the browser flow is sanctioned for third-party apps but
   cannot avoid a localhost redirect. _Recommendation:_ device-first, `openai` offered only where
   loopback can work, and a clear "use an API key instead" for accounts where the device flow is
   disabled.
2. **Whether MOTIF may depend on the Codex device flow at all.** It is OpenAI's own mechanism, used by
   its own CLI, but MOTIF would be a third-party consumer of a client ID it does not own. This has to
   be an explicit acceptance (it is the same class of decision as the existing note about using a
   ChatGPT subscription from one's own app in `docs/decisions.md`). The alternative is to require an
   API key for users whose accounts have it disabled, and to accept the browser flow's localhost
   requirement for self-hosted installs only.
3. **OpenCode: own adapter (Route 1) or extension behind single-user (Route 2) for v1.** _Recommendation:_
   Route 1 for the web app; the extension remains the local-build option.
4. **Whether to register our own OAuth clients with OpenAI/OpenCode.** Long term this is the clean
   answer (our own client ID, provider-sanctioned flows, real revocation). It is an outbound business
   step, not an engineering one, and it removes both caveats above.
5. **Identity scope:** connect flows must bind to a Whop user. If Whop identity is not wired yet, this
   feature should ship behind it rather than widening the browser-token model (brief §5).

---

## 8. What was verified, and what was not

Verified in this sandbox, today:

- The installed SDK's provider registry (43 providers), the `auth` methods of every provider named
  here, and the two OpenAI OAuth implementations down to their constants.
- That `openai-codex`'s `select` leads to a live device-authorization request, by running it.
- That the OpenCode extension loads through the extension loader and registers both providers as
  OAuth-only against the installed runtime, and that its login entry point reaches the network.
- That a custom `oauth` provider registered with `ModelRuntime.registerProvider` logs in, stores
  credentials, appears in `getAvailable`, resolves auth, and routes a request through its
  `streamSimple` to the right gateway URL.
- That OAuth credentials carry MOTIF's extra fields (org, account) through the credential store.
- That `pi-provider-opencode-console` writes/reads a single `getAgentDir()/auth.json`, and that
  `getAgentDir()` honours one process-wide environment variable.
- That the current app's baseline is unchanged: 73 tests pass, typecheck has the one pre-existing
  error at `src/routes/styles.tsx:28`.

Not verified, and required before phase 4 ships:

- A real ChatGPT subscription through the device flow end to end (the sandbox has no account and no
  route to `auth.openai.com`).
- A real OpenCode Console account through the device flow, including org scoping and the `/api/config`
  catalog shape for an account that has one org versus several.
- Whether OpenAI enables the device flow for the accounts MOTIF's users will bring, and its behaviour
  on Team/Enterprise/Business plans.
- The provider terms for a third-party web app consuming either flow; they could not be read from the
  sandbox and should be checked by the owner.

---

## 9. Relationship to the repository's rules

This document does not change the repository structure and adds no dependency; it is phase 1 output of
the brief (audit and plan) scoped to one requirement. It supersedes the OpenCode and ChatGPT sections
of `docs/plans/pi-sdk-account-linking.md` where they say an OpenCode account is linked with a key and
that a remote user must paste a redirect URL. Those two statements are now known to be avoidable; the
underlying SDK hazards, the in-memory store caution and the `auth.json` shell-expansion warning in that
document remain correct and binding.
