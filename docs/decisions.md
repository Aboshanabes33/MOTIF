# Decisions

Questions the owner has settled, newest first. The ones still open are listed in `AGENTS.md`
under "Open decisions". When one is settled, move it here.

## 2026-11-16: Only supported provider auth is shown; the local vault is the interim boundary

**Decided by** the owner, who asked for a production-ready unified AI provider authentication
implementation at the start of ABSH-10/ABSH-96.

**The question.** Which connected-provider methods MOTIF may truthfully present in a web build, and
where the credentials and connection state live until Convex/identity is configured.

**The decision.** Offer only officially supported, BYOAI methods: official API keys for OpenAI,
Anthropic, OpenRouter, xAI, Gemini, OpenCode Zen and OpenCode Go; OpenRouter's documented BYOAI
PKCE flow; and GitHub Copilot OAuth only after a MOTIF-owned app is registered and configured.
Do not expose Pi's Codex/Copilot device flows, Anthropic Claude.ai login, or any ChatGPT
subscription client. Credentials are validated, then encrypted by the signed-browser principal in
a local AES-256-GCM vault. Once the real Convex/Whop boundary exists, replace the vault with that
backend's owner-scoped secret storage; callers above `connection-vault.server.ts` should not need
to change.

**What changed.** `docs/provider-auth.md` records the official-source audit and the interim
security boundary. It also records request-shape tests, mocked-network inference tests, required
environment variables, the temporary absence of Supabase/Convex, and the limits of live testing.

**Still open.** ABSH-37/ABSH-43/ABSH-9 and the host/identity decision are required before this
boundary can be called multi-tenant production complete; GitHub Copilot needs an owner-registered
OAuth App; no live provider keys or subscription sign-ins were used in verification.

## 2026-11-14: Claude connects with a key, and keys are checked before they are kept

**Decided by** the owner, who asked for Claude, OpenRouter and OpenAI to be connectable by account
**or** by API key, with the key checked and the model list shown only after it passes, free models
supported on OpenRouter, and the app aware of whether a model can see images.

**The question.** How to offer Claude when Anthropic's terms bar third-party sign-in, and what to
show about a key before it is trusted.

**The decision.** Claude connects with an API key and says why, on screen, rather than offering a
button that Anthropic would withdraw. Every key is checked against the provider before it is
stored, and a refused key is never kept. Models carry their input modalities, and a text-only model
is refused for an image prompt — both when it is chosen and when a prompt is sent.

**What changed in the repository.** `docs/plans/claude-openrouter-opencode.md` has the detail.
Nothing is committed for this note yet.

- Claude and OpenRouter join the provider list; Claude explains its missing sign-in in the pop-up.
- `checkApiKey` on the runtime interface; each provider is asked at its own endpoint.
- A rejected key, an unreachable provider and a malformed key get separate wording.
- Free models are marked, and OpenRouter's remaining daily allowance is shown after linking.
- A text-only model is refused for an image prompt, before the request.

**Still open.** OpenRouter's own PKCE sign-in (recorded under "Open decisions" in `AGENTS.md`).

## 2026-11-14: Users link their own AI account through the Pi SDK

**Decided by** the owner, who asked to connect an OpenCode account or a ChatGPT subscription
through the Pi SDK, with a pop-up when the app opens that prompts the user to link an account,
either with an API key or by connecting their own account or subscription.

**The question.** Which credential do the AI features run on? Since MOTIF left Lovable they used
one OpenAI key from the server's environment, a stand-in.

**The decision.** Each user links their own AI account in the app, with an API key or a provider
sign-in, through the Pi SDK. The Pi SDK is installed now for this, ahead of phase 3.

**What changed in the repository.** `docs/plans/pi-sdk-account-linking.md` has the detail.

- A pop-up asks for an account when the app opens. It offers OpenAI (an API key, or Sign in with
  ChatGPT, which uses a ChatGPT subscription), OpenCode Zen and OpenCode Go (API keys).
- The two AI server functions run on the linked account. `OPENAI_API_KEY` is no longer read, and
  the server has no AI credential of its own.
- Only the SDK's credential and model layer is used. The agent runtime is still phase 3.

**What follows from it.**

- The app's server must be one long-running Node.js process, version 22.19 or later: the SDK
  needs one, and the links live in the server's memory. The build therefore targets Node.js
  instead of a Cloudflare Worker. This settles half of the open decision "Where MOTIF runs"; the
  other half, which host, is still open.
- Model calls are billed to each user's own account, no longer to the owner's OpenAI key.

**Not decided here.** These were chosen during the work and are the owner's to change: a link
belongs to a browser and lasts until the server restarts, because MOTIF has no user accounts or
database yet; each provider starts on the Pi SDK's default model (`gpt-6.1-sol` for OpenAI,
where the demo used `gpt-6-astra`); and only the three providers above are offered.

## 2026-11-14: MOTIF leaves Lovable

**Decided by** the owner, with the instruction "Remove Lovable in this Project".

**The question.** The demo was generated and hosted on Lovable. Lovable's rules required model
calls to go through its AI gateway and forbade hand-written database migrations, and its builds
deployed to Cloudflare Workers. The brief (`product-brif.md`) requires migrations in the
repository, the Pi SDK with each user's own provider credentials, and a Node.js backend. No
single design could satisfy both.

**The decision.** MOTIF moves off Lovable completely. The brief is the only source of
architecture rules.

**What changed in the repository.**

- `vite.config.ts` is a plain Vite config instead of Lovable's preset. It produces the same
  production build, and additionally refuses browser imports of `*.server.*` files.
- Lovable's AI gateway SDK and its generated model types are gone. The two AI server functions
  send the same prompts to the same model (`gpt-6-astra`), straight to the OpenAI Responses API
  from `src/lib/ai.server.ts`, and need `OPENAI_API_KEY` in the server environment.
- The hook that reported errors to Lovable's editor, the `author` and `twitter:site` meta tags
  that named Lovable, the template marker `project.json` and Lovable's block of rules in
  `AGENTS.md` are removed.

**What follows from it.**

- Model calls are billed to the owner's OpenAI account.
- The web app has no host. Where it runs is now part of the open decision "Where MOTIF runs".
- Database migrations can live in the repository, as the brief requires.
- Nothing in this repository controls the Lovable project itself: its GitHub connection and its
  published demo are the owner's to change in Lovable.

**Not decided here.** Calling OpenAI directly is a stand-in chosen during the removal, because
it is the model the demo already used. It does not settle which providers MOTIF supports: the
brief's agent layer (Pi SDK, per-user credentials) replaces it in Phase 3.
