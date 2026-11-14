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
- **Your own AI account:** when the app opens, it asks you to link an AI account, and the AI
  features run on it. See [Link your AI account](#link-your-ai-account).
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

No environment variable is needed.

To run the production build:

```sh
npm run build
node .output/server/index.mjs    # http://localhost:3000, or the port in PORT
```

`npm run preview` does not work: it answers HTTP 500 on every page.

## Link your AI account

The two AI features, edit plans and reading a style from a file or a website, run on your own AI
account, and their use counts against that account. The app's server has no AI key of its own.
When the app opens, a pop-up asks you to link an account:

| Provider     | How you link it                                                           | Model it starts on |
| ------------ | ------------------------------------------------------------------------- | ------------------ |
| OpenAI       | Sign in with ChatGPT, which uses your ChatGPT subscription, or an API key | `gpt-6.1-sol`      |
| OpenCode Zen | An OpenCode API key                                                       | `kimi-k2.7-code`   |
| OpenCode Go  | An OpenCode API key                                                       | `kimi-k3.1-pro`    |

- **Not now** closes the pop-up, and the app still runs. **AI account** in the sidebar opens it
  again. There you can also pick another model, or unlink.
- A key is not tested when you link it. A wrong key shows on your first AI edit.
- The server keeps your key or sign-in in its memory and never sends it to the browser.
  Restarting the server forgets every link, and a link unused for 24 hours is dropped. You then
  link again.
- Sign in with ChatGPT finishes by itself when your browser and the server are on the same
  computer. When they are not, the last page of the sign-in fails to load: copy its address from
  the address bar and paste it into the pop-up.

Linking has been tested against simulated OpenAI and OpenCode services, not yet with a real
ChatGPT subscription or a real OpenCode key. Whether OpenAI's terms allow using a ChatGPT
subscription from an app like this has not been checked either.

Linking is built on the [Pi SDK](https://github.com/earendil-works/pi).
[`docs/plans/pi-sdk-account-linking.md`](docs/plans/pi-sdk-account-linking.md) explains how it
works, what was checked and what is left.

## Check a change

```sh
npm test            # Vitest, single run
npx tsc --noEmit    # typecheck
npm run lint        # ESLint, with Prettier as a rule
npm run build
```

The tests and the build pass. The typecheck reports one known error, and lint reports known
formatting errors; [`AGENTS.md`](AGENTS.md) lists both under "Commands". A change should add no
new failure. Do not run `npm run format` as part of other work: it rewrites most files.

## How the code is organized

MOTIF is built with TanStack Start (React 19, Vite 8, server-side rendering), TypeScript,
Tailwind CSS v4 and shadcn/ui.

| Path                                               | What is there                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------- |
| `src/routes/`                                      | The four screens, as file routes                                    |
| `src/components/`                                  | The app shell, the composer, the result card and the account pop-up |
| `src/components/ui/`                               | shadcn/ui components                                                |
| `src/lib/store.tsx`                                | The state the page keeps in memory, with its sample data            |
| `src/lib/ai.functions.ts`, `src/lib/ai.server.ts`  | The two AI features, which run on the server                        |
| `src/lib/account-link*.ts`, `src/lib/pi.server.ts` | Account linking, on the Pi SDK                                      |
| `src/test/`                                        | The tests                                                           |

## Deploying

MOTIF has no host yet, and which one to use is not decided. It needs one long-running Node.js
process, version 22.19 or later. A serverless or edge platform will not work: the account links
live in the server's memory, and Sign in with ChatGPT listens on a port of the server.

## Documents

- [`product-brif.md`](product-brif.md): the brief. The target architecture, the six phases and
  the working rules.
- [`AGENTS.md`](AGENTS.md): the rules for coding agents, and the real state of the repository.
  [`CLAUDE.md`](CLAUDE.md) loads it for Claude Code.
- [`docs/decisions.md`](docs/decisions.md): what the owner has settled.
- [`docs/plans/pi-sdk-account-linking.md`](docs/plans/pi-sdk-account-linking.md): the plan for
  account linking.
- [`docs/licenses.md`](docs/licenses.md): the licenses of the dependencies added since
  2026-11-14.
- [`motif-ai-video-editing-app-no-login-no-saving-2026-11-14.md`](motif-ai-video-editing-app-no-login-no-saving-2026-11-14.md):
  the plan the demo was generated from. Historical.
