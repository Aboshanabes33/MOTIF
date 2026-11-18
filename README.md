# MOTIF

MOTIF is an AI creative-workflow app for video editors, motion designers and marketers. You teach
it a brand or style once, and every AI-assisted edit follows it.

It answers two problems of editing with a general AI assistant such as ChatGPT or Claude: the
assistant does not know your style, so the result looks wrong, and you have to send it the same
references every time.

This repository holds a working demo. It is being turned into the production application that
[`product-brif.md`](product-brif.md) describes, in six phases. Phase 1, the repository audit, is
not delivered yet. The later phases add a backend with login and saved data, the AI agent, and
real media processing and rendering.

## What the demo does today

- **Four screens:** a new session (`/`), the session chat (`/session/$id`), the style library
  (`/styles`) and a timeline editor (`/session/$id/edit`).
- **Styles:** the app starts with three sample styles. You pick the active one, and a side panel
  shows its colors, fonts, logo and motion rules. You can add a style from a style file (`.md` or
  `.txt`), from a website address, or by typing its colors and display font.
- **AI edit plans:** each message goes to the AI with the active style attached, so you never
  repeat your references. The AI answers with an edit plan: the style it applied, the brand
  layer, the pacing and the captions.
- **Your own AI provider:** when the app opens, it asks you to connect an AI provider, and the AI
  features run on it. See [Connect an AI provider](#connect-an-ai-provider).
- **Timeline editor:** select a clip, play, move the playhead, zoom the timeline, split a clip
  and jump to a caption.

## What is not real yet

- **No video is rendered or exported.** The result card, the preview and the timeline are drawn
  from the AI's plan, and "Download" only says that no video was rendered.
- **Footage is not uploaded.** Only the names of the files you attach reach the AI. A style added
  from a reference video is the same: only the file's name is read.
- **Nothing is saved, and there is no login.** Styles and sessions live in the page's memory and
  reset when you refresh.

## Run it

You need Node.js 22.19 or later, and npm.

```sh
git clone https://github.com/Aboshanabes33/MOTIF.git
cd MOTIF
npm ci
npm run dev        # http://localhost:8080
```

No environment variable is needed in development. To run the production build:

```sh
npm run build
node .output/server/index.mjs    # http://localhost:3000, or the port in PORT
```

The production server needs a random `MOTIF_SESSION_SECRET` (and may use `MOTIF_CREDENTIALS_KEY`
and `MOTIF_SECRETS_FILE`). `MOTIF_PUBLIC_BASE_URL` should be the absolute public origin for the
OpenRouter callback. See `.env.example` and `docs/provider-auth.md`.

`npm run preview` does not work: it answers HTTP 500 on every page.

## Connect an AI provider

The two AI features, edit plans and reading a style from a file or a website, run on a provider
connection you choose in the app, and usage is billed/contracted to that account. MOTIF has no AI
key of its own. When the app opens, a dialog asks you to connect a supported provider:

| Provider       | Supported connection          | Default model      |
| -------------- | ------------------------------ | ------------------ |
| OpenAI         | OpenAI API key                | `gpt-6.1-sol`      |
| Anthropic      | Anthropic API key             | `claude-sonnet-4-6`|
| OpenRouter     | OpenRouter key or official BYOAI PKCE | `openrouter/auto` |
| xAI Grok       | xAI API key                   | `grok-4.7`         |
| Google Gemini  | Gemini API key                | `gemini-3.8-flash` |
| OpenCode Zen   | OpenCode Zen API key          | `kimi-k2.7-code`   |
| OpenCode Go    | OpenCode Go API key           | `kimi-k3.1-pro`    |

- **Not connected** opens the dialog from the sidebar. There you can connect, validate, choose a
  model, make one connection active, or disconnect it.
- Keys are checked with the provider before they are encrypted and stored; the browser never
  receives the stored value. A rejected key is not kept.
- ChatGPT/Claude subscription sign-in is not presented as a MOTIF option. GitHub Copilot stays
  disabled until MOTIF owns a documented GitHub OAuth App and token exchange.
- Provider model availability is merged from Pi's installed catalogue and the provider's validated
  catalogue; a text-only model is refused for an image prompt.

[`docs/provider-auth.md`](docs/provider-auth.md) records the official-source audit, security
model, deployment limits and what was and was not live-tested. It is the source of truth for
this boundary.

## Check a change

```sh
npm test            # Vitest, single run
npx tsc --noEmit    # typecheck
npm run lint        # ESLint, with Prettier as a rule
npm run build
```

The tests and the production build pass, and `npx tsc --noEmit` is clean. Lint still reports
pre-existing formatting errors in untouched files; [`AGENTS.md`](AGENTS.md) lists the real
baseline under "Commands". A change should add no new failure. Do not run `npm run format` as
part of other work: it rewrites most files.

## How the code is organized

MOTIF is built with TanStack Start (React 19, Vite 8, server-side rendering), TypeScript,
Tailwind CSS v4 and shadcn/ui.

| Path                                               | What is there                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------- |
| `src/routes/`                                      | The four screens, as file routes                                    |
| `src/components/`                                  | The app shell, the composer, the result card and the connection dialog |
| `src/components/ui/`                               | shadcn/ui components                                                |
| `src/lib/store.tsx`                                | The state the page keeps in memory, with its sample data            |
| `src/lib/ai.functions.ts`, `src/lib/ai.server.ts`  | The two AI features, which run on the server                        |
| `src/lib/account-link*.ts`, `src/lib/provider-registry.ts`, `src/lib/provider-validation.server.ts`, `src/lib/connection-vault.server.ts`, `src/lib/principal.server.ts`, `src/lib/pi.server.ts` | Provider connection and inference, on the Pi SDK |
| `src/test/`                                        | The tests                                                           |

## Deploying

MOTIF has no host yet, and which one to use is not decided. It needs one long-running Node.js
process, version 22.19 or later. Serverless or edge platforms are not supported yet: the
encrypted provider vault is local and process-serialized.

## Documents

- [`product-brif.md`](product-brif.md): the brief. The target architecture, the six phases and
  the working rules.
- [`AGENTS.md`](AGENTS.md): the rules for coding agents, and the real state of the repository.
  [`CLAUDE.md`](CLAUDE.md) loads it for Claude Code.
- [`docs/decisions.md`](docs/decisions.md): what the owner has settled.
- [`docs/provider-auth.md`](docs/provider-auth.md): the provider authentication audit and
  implementation boundary.
- [`docs/plans/pi-sdk-account-linking.md`](docs/plans/pi-sdk-account-linking.md): the earlier
  Pi account-linking plan; it is superseded by `docs/provider-auth.md`.
- [`docs/licenses.md`](docs/licenses.md): the licenses of the dependencies added since
  2026-11-14.
- [`motif-ai-video-editing-app-no-login-no-saving-2026-11-14.md`](motif-ai-video-editing-app-no-login-no-saving-2026-11-14.md):
  the plan the demo was generated from. Historical.
