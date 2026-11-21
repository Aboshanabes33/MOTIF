# Brief for the implementing agent: Motif command-line agent relay

You are implementing ONE task in the Motif repository. Do exactly this task and nothing else. Follow the steps in order. Do not skip a step. When a step says STOP, stop and write the report.

## 0. Read first (no code yet)

Read these, in this order:

1. `CLAUDE.md` (it points to `AGENTS.md`) and `packages/CLAUDE.md`.
2. `CONTEXT.md`. Use its words exactly: Brand, Style, Reference Video, Source Video, Edit Request, Result. Do not use the words listed under "Avoid".
3. `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, `docs/agents/domain.md`.
4. The spec file `motif-0.1.0-spec-v2.md` (find it in the repo with a file search; if it is not there, use the GitHub issue titled "Motif 0.1.0"). Read the sections "Solution", "Implementation Decisions", "Testing Decisions", "Out of Scope".
5. `packages/subagent/subagent-claude-code/README.md` and `packages/subagent/subagent-codex/README.md`.
6. `packages/subagent/tool-subagent/README.md` and `packages/subagent/subagent/README.md`.

## 1. The task, in plain words

A user types a message in the Motif app. The message goes to the Claude Code or Codex command-line agent, which runs in the background inside the current Brand's folder. The agent's final answer comes back and is shown as the reply in the same conversation. There is no local MCP server. The user cannot change session options; the only choice is the Brand (workspace).

Facts you must respect (from the package READMEs):

- The existing Claude Code and Codex providers are one-shot and unattended. One self-contained text task goes in. A final answer or a safe failure message comes out. Reasoning, tool traffic, errors, and usage are not returned. There is no continuation, so every run starts fresh.
- Claude Code runs with a platform-pinned runtime and never falls back to an installed `claude` program. Codex uses a fresh isolated thread per delegation.
- Both use their own native sign-in. You must not read, copy, or store tokens.

## 2. Gate: check sign-in sharing (do this before building)

Question: does the Claude Code pinned runtime use the same sign-in as a normal `claude login`, or does it need its own? Same question for Codex.

- Answer it by reading the provider code. Do not guess.
- Write the answer, with the file and line you based it on, in your final report.
- If the answer is "separate sign-in is needed": do not build any sign-in feature. Continue with the relay, make "not signed in" a clear failure message, and list the options in your report.

## 3. Work method (this is the `implement` workflow)

Work test-first at exactly two seams. Do not invent more seams.

- **Seam 1 (main):** a recorded-session replay through the shipped profile, using the repository's keyless session snapshot mechanism (`pnpm run test:snapshot`; read `docs/testing.md` and `snapshots/AGENTS.md` first). Replace the real command-line agent with a stand-in that returns only a final answer, like the real one.
- **Seam 2:** the authorization flow for connecting an AI account. Follow the existing tests of the model-provider sign-in in `packages/llm/llm-pi-ai/tests/`. Never touch real tokens.

For every piece of behavior below: write one failing test first, make it pass with the smallest change, then go to the next. Test external behavior only (what the user sees and what files result), never internal calls.

Behaviors to build, in this order:

1. A message in a session is delegated to the chosen provider and the final answer appears as the assistant reply.
2. The task text is built from: the user's Edit Request, the Brand definition, the current timeline files read from disk (so manual edits are included), and a short summary of the earlier conversation. Build this as a pure function with its own tests. Include a test where the follow-up depends only on the conversation summary, and a test where a manual timeline change must appear in the task.
3. Coarse status only: started, working, finished, failed. No step-by-step progress.
4. Failures: not signed in, limit reached, runtime unavailable, timeout, cancel. Each shows an actionable message. Never switch to another backend silently.
5. Session options locked: model and permission mode are fixed by configuration and are not shown in the UI.

## 4. Rules from the repository (do not break these)

- Prefer composing the existing providers and delegation tool over new machinery. New behavior goes in plugins, not in the agent loop.
- Product-visible plugins need a real-composition test that boots a test-only `cordis.yml` through the Loader (see `packages/CLAUDE.md`). A hand-built `ctx.plugin(...)` suite is not enough.
- Errors: use `HarnessError` and localized, actionable messages. An empty `catch` must name the error and say why.
- UI text goes through the locale dictionaries; do not hardcode copy.
- Update the README and JSDoc of every package you change, in the same change.
- No `as unknown` casts.

## 5. Checks (run these, and only these)

- After each behavior: typecheck the touched packages, and run the single test file you changed.
- Once at the end: the relevant tests for the touched packages, `pnpm run typecheck`, `pnpm run lint`, and `pnpm run doc-sync` if you changed docs. Run `pnpm install` first (it is not installed). Follow `.agents/skills/dsh-pre-push-checks/SKILL.md` to choose the smallest set.
- Do not run the full test suite unless a check fails and you need it to diagnose.
- List the exact commands you ran and their results in the report.

## 6. Review and commit

- When the work is done, review it with the `code-review` skill, fix what it finds, then commit.
- Commit to the current branch. Do not push. Do not open a pull request. Do not change any other branch.
- End the commit message with the attribution lines your environment gives you.

## 7. Out of scope (do not touch)

Branding or renaming, disabling plugins or automation, Arabic interface, HyperFrames integration, token import, OpenAI sign-in, streaming progress, user-selectable Styles, deleting any package.

## 8. Stop conditions

STOP and write the report (do not push through) if:

- a repository rule above conflicts with the task and you cannot satisfy both;
- the provider code cannot run unattended in a Brand's folder;
- a check fails twice for the same reason after you fixed it.

## 9. Final report (required)

1. The sign-in finding from step 2, with file and line.
2. Changed files, grouped by purpose.
3. The tests you added, one line each.
4. The commands you ran and their results.
5. Anything you could not verify. A real sign-in and a real run need a person with a Claude or ChatGPT subscription on a real machine.
6. Anything you did not do because it was out of scope or you stopped.
