# MOTIF API-key execution

## Authentication precedence

The MOTIF web bundle and installable relay bundle explicitly wire `motif/anthropic`
and `motif/openai` Host records into their matching providers. Other subagent
instances are unchanged unless configured with `credentialRecord`.

Each provider reads its record at every start. A valid saved key wins over explicit
provider environment settings and native subscription/OAuth login. A malformed
record or a storage error stops the request. An absent record preserves the
existing native login route. Deleting a key therefore restores native login for
future sends; it does not cancel an in-flight request. A rejected saved key never
causes a retry with OAuth or another backend.

Claude receives the key through a private stdin prefix consumed by a memory-only
bootstrap before it starts the official CLI. The key becomes the CLI environment
variable ANTHROPIC_API_KEY. It is not part of the subprocess spawn spec, argv or
Linux containment launch file. Explicit OAuth token environment variables are
cleared. The bootstrap and CLI remain in the same managed process range.

Codex 0.153.4 app-server disables CODEX_API_KEY environment discovery. The Host
therefore sends account/login/start over its private stdin after initialize and
before thread/start. The app-server starts with
`cli_auth_credentials_store="ephemeral"`, so API login does not overwrite the
user's saved ChatGPT login or write an auth.json key. The key is never in argv or
the subprocess environment. Both providers suppress raw stderr in key mode,
redact the key from returned results, and return fixed startup errors without raw
causes. The renderer only sees status and masked key metadata.

## Automated verification

Run the Codex and Claude provider specs plus relay adapter/config specs. Tests use
synthetic credentials and mocked protocol/SDK boundaries. They check Host record
resolution, rotation, rejection without fallback, stdin login ordering, ephemeral
Codex storage, absence from spawn specs, raw-stderr suppression and output
redaction. A real local Node child verifies the Claude bootstrap does not consume
SDK protocol bytes after its key prefix.

## Real-provider smoke test (not run by this PR)

Use disposable test keys and an approved small API spending cap. Do not paste keys
in a terminal command, issue, screenshot or log. Enter each through Settings > AI.

1. Start with a disposable Brand and a native CLI subscription login. Record a
   hash of native auth files, without displaying their contents.
2. Save the Anthropic test key. Choose Claude Sonnet and send a minimal Edit
   Request through a normal Session. Confirm the answer and the corresponding
   API usage in the Anthropic account, not just the key-verification request.
3. Save the OpenAI test key. Choose Codex and repeat. Confirm OpenAI API usage
   and unchanged native auth-file hashes. Check no auth.json key was created.
4. Revoke each test key and send again. Confirm a key-related error and no
   successful subscription retry or backend switch. Test a malformed record and
   denied storage read with a development fixture. Delete the record and verify
   native login works again when present; without native login, expect sign-in
   guidance. Restore native settings after the test.
5. Use a local leak scanner that reports only pass/fail to inspect renderer state,
   logs, telemetry captures, persisted application files and subprocess launch
   files for the exact key. Do not display matching lines. Check OS process
   arguments contain no key. The target CLI necessarily has its own key in
   process memory/environment; protect local process inspection access.

A successful models-list verification is not evidence of a successful generation.
This PR does not claim real-provider generation was verified. Native CLI behavior
and installed enterprise policies still need the real smoke test above.

Source for the pinned Codex behavior:
- https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/app-server/src/lib.rs
- https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/app-server/src/request_processors/account_processor.rs
- https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/login/src/auth/storage.rs
