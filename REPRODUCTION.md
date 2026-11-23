# Codex runtime send failure: reproduction gap

The report only contains the generic Relay message. That message maps several distinct failures, so it does not identify the cause. The configured Codex relay points at motif-codex-provider, which uses the real subagent-codex app-server provider. Its package pins @openai/codex 0.153.4.

A scratch install of that exact version was smoke-tested on Linux without credentials. The package-local wrapper accepts `app-server --stdio`, initialize/initialized succeeds, and thread/start creates an ephemeral thread. No model turn was sent and no real user's credentials were used. This establishes only the startup protocol, not account readiness or a successful edit request.

To reproduce the reported send failure, obtain the fixed/sanitized Product subagent failure diagnostic: lifecycle stage, category, HTTP status and process exit code/signal, plus app version and OS. Do not collect prompts, raw stderr, access tokens, auth.json or media. Verify that the native Codex sign-in belongs to the same OS user/environment as the Host. Then reproduce one send under the Codex route and add a regression test at the failing boundary. Do not hide the error or silently switch to Claude.

No speculative fix is included. Issue remains blocked on reproduction evidence from the failing runtime.
