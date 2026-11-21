---
description: "The Motif relay model route for users and maintainers sending an Edit Request from a Motif Session to a Claude Code or Codex command-line agent running in the Brand folder."
kind: "package-reference"
---

# @deepseek-ai/dsh-llm-motif-relay

English | [中文](README.zh.md)

## Summary

Mount this model route when a Motif Session should run a command-line agent: the Edit Request becomes one fresh Claude Code or Codex run in the Brand folder, and only that run's final answer returns as the assistant reply. It composes the existing `dsh-subagent-claude-code` and `dsh-subagent-codex` providers, so native settings, authentication, permission mode, and model stay as the provider instance configures them. Each send is fresh and unattended: the route streams no progress, shows four coarse states, never retries on another backend, and keeps Session model options fixed by configuration.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Enable the route in a profile when a Brand folder should be edited by a native command-line agent. The route adds no tool, requires no local MCP server, and starts no process until a Session sends a message. The user's only choice is the Brand: the Session's working directory is the Brand folder, and every other option comes from this configuration and the selected subagent provider instance.

### Configuration

Mount the route and the backend provider it selects. The backend name must match the provider instance that the installed bundle registers (`claude-code` or `codex`).

```yaml
- name: '@deepseek-ai/dsh-subagent-claude-code'
- name: '@deepseek-ai/dsh-llm-motif-relay'
  config:
    backend: claude-code
```

| Field | Default | Meaning |
|---|---|---|
| `providerName` | `motif-relay` | Model-route name on `ctx.llm`; the Session selects this provider |
| `backend` | `claude-code` | Registered subagent backend that runs each send (`codex` is the sibling) |
| `model` | the backend name | Model id this route advertises; the Session selects it once by configuration |
| `displayName` | the backend name | Selector label for the route |
| `brandFile` | `brand.md` | Brand definition file relative to the Brand folder |
| `timelineDir` | `timeline` | Timeline directory relative to the Brand folder |
| `timelineExtensions` | `['.md', '.json']` | Timeline file extensions carried into the task |
| `maxTimelineFiles` | `20` | Timeline files carried by one task, in filename order |
| `maxTimelineBytes` | `64000` | Timeline text bytes carried by one task |
| `conversationMessages` | `6` | Earlier messages carried into the task |
| `conversationChars` | `4000` | Earlier-conversation characters carried into the task |
| `timeoutMs` | `900000` | Deadline for one send, after which the child is disposed |
| `signInCheck` | `auto` | `auto` probes the native credential file; `skip` assumes a sign-in the Host cannot see |

Locking model and permission mode is deliberate: `model`, `permissionMode`, and `env` belong to the subagent provider row, and this package never overrides them per call. A profile that mounts two relay routes with different backends gives the user a visible choice of backends; nothing switches automatically.

### Authentication

The pinned runtimes use the same native sign-in as the installed command-line tools, and the relay adds no account of its own:

- **Claude Code** runs the Bundle's pinned CLI with the Host's `HOME` and `CLAUDE_CONFIG_DIR`, so a `claude login` performed by the same operating-system user is reused. Credential-shaped environment variables are scrubbed from the child, so an `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` sign-in is *not* inherited; supply it through the provider row's `env` when a deployment uses key authentication.
- **Codex** runs the Bundle's `codex app-server` with the Host's `HOME` and `CODEX_HOME`, so the `~/.codex/auth.json` written by `codex login` is reused. `OPENAI_API_KEY` is scrubbed and must likewise come from the provider row's `env`.
- A different OS user, container, or home directory has a different sign-in: authenticate that identity once with `claude login` or `codex login`. Neither provider can authenticate a machine on the user's behalf.

Before starting a run the route checks the native credential file on platforms where it is observable. A deployment that supplies credentials through the provider row's `env` sets `signInCheck: skip`, because that sign-in is not visible to the Host's own environment. When the file is absent it fails with the sign-in instruction instead of spawning a process that would fail. The macOS keychain hides the Claude Code sign-in, so the check reports unknown there and the failure surfaces as a runtime start failure.

### What you get

A user message produces one child run and one assistant message. The child receives the Edit Request, the Brand definition, the timeline read from disk at send time, and a digest of the earlier conversation. The Edit Request is the user's own text: runtime reminders that the loop injects beside it (working directory, sandbox policy, and similar) are not relayed. Reasoning, tool traffic, stderr, usage, and workspace diffs stay out of the Session. The Session log records the request, the answer, and the ordinary turn events, so the reply survives reloads.

Auxiliary model calls — Session titles, compaction summaries, and other declared purposes — are refused with `INVALID_REQUEST` instead of starting a command-line run, so only a conversation message reaches the backend.

### Status and failures

Progress is coarse because no progress is streamed. Host surfaces can listen to `motif-relay/status` for `started`, `working`, `finished`, and `failed`. A cancelled send stops after `working`; the turn itself reports the cancellation. The event is host-local and carries the Session, the backend, and the state; rendering it in a browser surface is left to that surface, which is why this package adds no client component.

| Failure | Reported action |
|---|---|
| Not signed in | Run `claude login` / `codex login` as the same user, then resend |
| Limit reached | Wait for the limit to reset, then resend |
| Runtime unavailable | Check that the backend bundle is installed and signed in, then retry |
| Timeout | Check the Brand folder for partial changes, then send a smaller request |
| Cancel | No backend switch; the turn reports the cancellation |

Failures carry provider-neutral LLM codes (`AUTH`, `QUOTA`, `HTTP_503`, `HTTP_504`, `ABORTED`, `EMPTY_RESPONSE`) so surfaces route on the code rather than on prose. A conversation may of course select a DeepSeek API-key route configured beside this one; that is a visible user choice, never an automatic fallback.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The route is an ordinary `LlmAdapter`: the agent loop still owns the turn, the request log, cancellation, and the assistant message, so no Session event, projection, or loop change is involved.

### Design concept

- **Fresh run per send.** Every request starts one caller-delivered activation of the configured backend; there is no continuation, resume, or pooling.
- **Disk is the source of truth.** Brand definition and timeline files are read per send, so a manual edit inside the Brand folder is part of the next task text.
- **One text task.** The child receives the composed task and nothing else; no tools, attachments, or Session history cross the boundary.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: config schema, host wiring, status event |
| [`src/adapter.ts`](src/adapter.ts) | Model route: task composition, activation lifecycle, answer chunks |
| [`src/task.ts`](src/task.ts) | Pure task-text builder |
| [`src/conversation.ts`](src/conversation.ts) | Edit Request selection and earlier-conversation digest |
| [`src/brand.ts`](src/brand.ts) | Brand definition and timeline reads |
| [`src/failure.ts`](src/failure.ts) | Sign-in probe and failure classification |
| [`src/status.ts`](src/status.ts) | Coarse states and the status event payload |

### Run flow

The adapter resolves the live Agent from the request's `sessionId`, selects the last user text as the Edit Request, digests the earlier messages, reads the Brand folder, and builds one task. It publishes `started`, starts a caller-delivered activation with the request's cancellation, publishes `working`, and races the activation result against cancellation and the deadline. A completed, non-blank answer publishes `finished` and streams as one text block; every other outcome publishes `failed` except cancellation and throws a classified `LlmError`, which the LLM runtime turns into a terminal error finish.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Claude Code provider](../../subagent/subagent-claude-code/README.md) — pinned runtime, native settings, and the safe failure facts this route classifies.
- [Codex provider](../../subagent/subagent-codex/README.md) — the sibling backend over the app-server protocol.
- [Subagent service](../../subagent/subagent/README.md) — the activation, cancellation, and result contract.
- [LLM service](../llm/README.md) — the adapter contract and failure codes.

-----

<a id="model-experience"></a>
## Model Experience

### Parent request

#### What the model sees

The parent model is not called: this route replaces the model call, so it produces the assistant text itself. The composed task is model-facing text only and names the Brand, timeline files, earlier conversation, and Edit Request.

#### Token effect

The parent pays for the composed task as child input. The task is bounded by `maxTimelineBytes` and `conversationChars`; child output returns as the answer text.

#### KV Cache effect

No parent cache exists for this route. Child reuse depends only on the command-line agent's own model, instructions, and fresh run.

### Child request, indirectly

#### What the model sees

The child sees one consolidated task text and works in the Brand folder. It never sees Session events, tool schemas, or the Host's model selection.

#### Token effect

The child pays for its own context. Usage is not reported to the parent Session.

#### KV Cache effect

Independent of the parent.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No continuation** — every send is a fresh run; continuity comes only from the composed conversation digest.
- **No progress stream** — reasoning and tool activity are unavailable, so surfaces show four coarse states.
- **Fixed Session options** — the route advertises one model, and model, permission mode, and environment come from configuration rather than the UI.
- **No side-effect rollback** — a timeout or cancel leaves files the child already changed.
- **No local MCP server** — the child uses only its own native tools and configuration.
- **Timeline budget is silent** — files beyond the byte or file-count budget are omitted from the task; the README states the budgets rather than reporting omissions per send.
- **No browser status component** — the package publishes `motif-relay/status` but ships no client rendering; a surface that shows relay progress must subscribe to that event.
- **No auxiliary calls** — titles and summaries are refused rather than delegated, so a relay Session keeps a neutral title until another provider generates one.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

- The composition test boots the shipped headless profile with a stand-in backend and a real Session, so the route's end-to-end behavior is proven without a key or a native process.
- A real run requires a human with a Claude or ChatGPT subscription on a real machine; unit and composition coverage cannot prove native sign-in or native tool behavior.

</details>
