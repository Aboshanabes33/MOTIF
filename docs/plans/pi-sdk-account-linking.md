# Plan: link an AI account through the Pi SDK

On 2026-11-14 the owner asked to connect an OpenCode account or a ChatGPT subscription to the
app: when the app opens, a pop-up prompts the user to link an account, either with an API key or
by connecting their own account or subscription, and the linking goes through the Pi SDK. The
owner asked for this plan and for the work to start in the same request.

## Where the plan stands

| #   | Step                                                                         | State                                                                         |
| --- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | Research the Pi SDK: what it is, how its sign-ins work, what it needs        | Done                                                                          |
| 2   | Add the SDK and record its licences                                          | Done                                                                          |
| 3   | Server: a Motif-owned interface over the SDK, with one link per browser      | Done                                                                          |
| 4   | Run the two AI features on the linked account                                | Done                                                                          |
| 5   | Pop-up when the app opens, and an entry in the sidebar to reopen it          | Done                                                                          |
| 6   | Build the server for Node.js                                                 | Done                                                                          |
| 7   | Tests, and a run in a real browser against stand-ins for the providers       | Done                                                                          |
| 8   | Try it with a real ChatGPT subscription and a real OpenCode key              | Owner. The sandbox has neither account nor a route to the providers           |
| 9   | Replace the browser token with real identity, and keep credentials encrypted | Later, with Whop and Supabase (brief phases 2 and 3)                          |
| 10  | Rate limits on linking and on AI requests                                    | Later (brief phase 2)                                                         |
| 11  | Cancel a sign-in at the provider when the user unlinks                       | Later. The SDK has no call for it                                             |
| 12  | More providers: Anthropic, OpenRouter and others the SDK supports            | Later. One line each in `LINK_PROVIDERS`, after reading each provider's terms |
| 13  | The agent itself (sessions, tools, streaming) on the same runtime            | Later (brief phase 3)                                                         |

## What the Pi SDK is

`@earendil-works/pi-coding-agent` (version 1.5.2, MIT) is the library behind the `pi` coding-agent
program. Its lower layer is `@earendil-works/pi-ai`. It runs as a long-running process in Node.js
22.19 or later, or in Bun. A browser cannot run it. Neither can a Cloudflare Worker for what Motif
needs from it: memory that lasts between requests, and a listening port.

It has two parts. Motif uses the second one only.

- **The agent** (`createAgentSession`): conversations, and tools that read files and run commands.
- **`ModelRuntime`**: AI providers, their credentials, their model lists, and text completion.

What the research found:

- The SDK knows 43 providers. Each declares how it can be linked: an API key, a sign-in, or both.
  - OpenAI takes an API key or "Sign in with ChatGPT", which uses a ChatGPT subscription.
  - OpenCode Zen and OpenCode Go take an API key only. The SDK has no OpenCode account sign-in,
    so an OpenCode account is linked with a key.
  - **Both statements were revisited on 2026-11-14** (`docs/plans/oauth-account-connection.md`).
    The SDK has a second OpenAI provider, `openai-codex`, whose sign-in has a device-code branch that
    needs no localhost port and no pasted URL; and OpenCode's account connection is a device flow the
    SDK lacks but that a MOTIF-owned adapter can implement. This document's limits above still hold
    for the flow the app ships today.
- A sign-in is a conversation between the SDK and the app. The SDK reports events (the address of
  the provider's page, progress) and asks questions (paste a code, choose an option). Motif
  passes these between the server and the pop-up.
- Sign in with ChatGPT listens on port 1455 of the machine the server runs on, and OpenAI sends
  the browser back to `http://127.0.0.1:1455/auth/callback`.
  - Browser and server on one machine: the sign-in finishes by itself.
  - Browser and server on different machines: the browser cannot load that address. The user
    copies it from the address bar and pastes it into the pop-up, which finishes the sign-in.
  - The port is fixed, so a server can run one sign-in at a time.
- **A hazard.** The SDK's default credential store is a file, `auth.json`, and it expands the keys
  it reads: a key that starts with `!` is run as a shell command, and `$NAME` is replaced by the
  server's environment variable of that name. Tried in the sandbox: a key `!touch <file>` stored
  through the SDK's own login created the file. A key typed into a web page must never reach that
  store. Motif uses the SDK's in-memory store, which keeps a key as typed, and refuses text that
  is not shaped like a key.
- The SDK sends nothing by itself. Creating a runtime and storing a key make no network request,
  and a completion makes one request, to the provider. Its model-list download from pi.dev is off.
- Weight: 106 more packages to install, all under permissive licences (`docs/licenses.md`). Two
  of them run a script when installed: `protobufjs` checks a version prefix and `@google/genai`
  prints a line. The SDK loads on the first link: about 0.8 seconds and 75 MB of server
  memory, once. Each linked browser then costs about 0.15 MB.

## What the user sees

1. The app opens and asks the server what this browser has linked. If nothing, the pop-up "Link
   your AI account" appears, on whichever page the app opened.
2. The pop-up offers two ways: **Sign in with ChatGPT**, or a provider and an **API key**.
3. A sign-in shows a button that opens OpenAI's page in a new tab, and a field for the pasted
   address. Once OpenAI has approved, the pop-up moves on by itself, or after the paste.
4. When linked, the pop-up shows the provider, a model to choose, and **Unlink**.
5. **Not now** closes the pop-up. The sidebar entry "AI account" reopens it. An AI edit without a
   linked account says so and reopens it too.

## How it is built

| File                                                          | What it does                                                                                                                  |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/account-link.ts`                                     | Shared by browser and server: the providers offered and the shapes sent between them                                          |
| `src/lib/account-link.server.ts`                              | `AccountLinks`: one link per browser, in memory. Defines `ProviderRuntime`, the interface Motif needs from a provider library |
| `src/lib/pi.server.ts`                                        | Implements `ProviderRuntime` with the Pi SDK. The only file that imports the SDK                                              |
| `src/lib/account-link.functions.ts`                           | Seven server functions for the pop-up, each validated with Zod                                                                |
| `src/lib/ai.server.ts`                                        | `ask(linkToken, prompt)`: runs a prompt on the caller's linked account                                                        |
| `src/lib/link-token.ts`                                       | Keeps the link's token in the browser                                                                                         |
| `src/components/AccountLink.tsx`, `src/lib/useAccountLink.ts` | The pop-up, the sidebar entry, and the hook that opens the pop-up                                                             |

A **link** is the credential one browser gave Motif plus the model it chose. The browser holds a
random **token** that names its link. A request travels: browser (token) → server function →
`AccountLinks` (finds the link) → `ProviderRuntime` (Pi SDK) → provider.

The interface follows brief §4 and §5: the rest of Motif does not know that Pi is behind
`ProviderRuntime`, and the modules do not depend on TanStack Start, so they move unchanged when
the backend becomes Hono.

## Decisions taken in this change

The owner can reverse any of these. Numbers 3 and 4 change earlier behaviour.

1. **One link per browser, kept in the server's memory.** Brief §5 requires credentials isolated
   between users, never in a shared file, and never sent to the frontend. Motif has no user
   accounts yet, so "a user" is a browser. Nothing is stored on disk, so nothing needs encrypting.
   The price: a server restart forgets every link, and the app must run as one process.
2. **The browser keeps a token, in local storage, not a cookie.** A cookie is not sent when the
   app is shown inside another site's page, such as a preview, and linking would silently fail
   there. A token that the app sends with each call works everywhere, and another site cannot
   make the browser send it.
   The price: a script running on the page could read the token. The token is not a credential;
   it lets its holder use the link through Motif until the link is unlinked or expires.
3. **The server build targets Node.js, not a Cloudflare Worker.** The SDK, the in-memory links
   and the sign-in's listener need a long-running Node.js process. This narrows the open decision
   "Where MOTIF runs" to "which Node.js host", which stays with the owner.
4. **`OPENAI_API_KEY` is no longer read.** The server has no AI credential of its own. A request
   without a link is refused, even when the server's environment holds provider keys. This closes
   the gap where anyone who could reach a deployment spent the owner's key.
5. **Providers offered:** OpenAI (key, or Sign in with ChatGPT), OpenCode Zen (key) and OpenCode
   Go (key). These are the ones the owner named.
6. **Models:** each provider starts on the model the Pi SDK itself defaults to: `gpt-6.1-sol`,
   `kimi-k2.7-code` and `kimi-k3.1-pro`. The pop-up lists the others. This replaces
   `gpt-6-astra`, which stays available in the list.
7. **One sign-in at a time per server.** A second visitor is asked to wait. A sign-in whose
   browser has been silent for 90 seconds gives way, and one still running after 10 minutes is
   cancelled.

## Security

- A key is checked before any library sees it: letters, digits and the punctuation real keys use.
  Text starting with `!` or containing `$` or a space is refused.
- Credentials live only in the server's memory, one runtime per browser. A link unused for 24
  hours is dropped, and at most 500 links are kept.
- The provider's reply to a failed request never reaches the browser or the log: it can repeat
  part of the key. Motif keeps the HTTP status only.
- Links shown in the pop-up must be `https:` addresses.
- The server functions keep the cross-site protection already in `src/start.ts`.
- Known limits: no rate limit, so a visitor can make the server create links until the oldest are
  dropped; the token is readable by scripts on the page; unlinking does not cancel a sign-in at
  the provider, which brief §5 asks for.
- A key is not tried when it is linked: linking sends nothing to the provider, so a wrong key
  shows on the first AI edit, as "Your linked AI account turned the request down."
- When a sign-in's renewal fails because OpenAI answers with a server error, Motif still reports
  the account as turned down and asks to link again. The SDK gives no status for a renewal, only
  text. A renewal that gets no answer at all is reported as a plain failure and keeps the link.

## How it was checked

- 73 unit tests. The linking logic runs against a stand-in provider library. The Pi adapter runs
  against the real SDK with the network replaced, including a full Sign in with ChatGPT, a token
  renewal, a revoked sign-in and a provider that cannot be reached. Each protection was removed
  in turn to confirm that a test fails without it.
- A real browser (headless Chromium) drove the app, both `npm run dev` and the production build,
  against stand-ins for OpenAI and OpenCode: the pop-up on open, linking with a key, both sign-in
  routes, cancel, failure, two visitors at once, both AI features, reload, and a server restart.
- The production build also ran in the sandbox with no stand-ins. The sandbox cannot reach OpenAI
  or OpenCode, so this showed only the failure side: a key links (linking sends nothing), an AI
  edit answers "The AI couldn't finish this edit. Try again.", and a sign-in stops with "Motif's
  server could not reach the provider."
- Not checked: a real ChatGPT subscription, a real OpenCode key, and any real provider reply.

## What the owner needs to do

1. Try both ways with real accounts (step 8) and report what fails.
2. Check that using a ChatGPT subscription from your own app is within OpenAI's terms. The SDK
   introduces the app to OpenAI as "Motif". The terms could not be read from the sandbox.
3. Choose where the Node.js server will run when it is time to deploy.
