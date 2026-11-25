# Desktop agent onboarding, implementation boundary

This PR implements the user-requested desktop agent picker and local MCP config registration. It does not implement the provider/media roadmap in #111–116.

## Real behavior

- Check actual executable files on PATH for Codex/OpenCode. Check known Claude Desktop executable locations on Windows/macOS. Configuration presence alone is not reported as installed.
- Exactly one detected supported agent is preselected; multiple/none require a choice. Manual selection handles nonstandard installations.
- Add MCP opens a native confirmation, writes only the selected config entry, creates a private backup when a config exists, and reads the saved file back before reporting success. Loading state lasts for the actual operation. Successful config write does not claim successful client connection.
- Existing Codex TOML text/comments are retained by appending a unique table. Claude JSON/OpenCode JSONC edits preserve other fields and JSONC comments. Existing motif entry, malformed config, simultaneous JSON/JSONC, symlink path, oversize file, lock or discovered concurrent edit cause an error rather than overwrite.
- The local stdio connector uses the same installed Electron binary in Node mode, with one bundled script path. It contains only motif_status. No shell, file, AI or media tools are exposed. Client process ownership is the authentication boundary for stdio, distinct from the existing bearer-authenticated loopback experiment.
- Window controls call named validated IPC actions; renderer retains isolation and sandbox. Browser preview cannot detect/write local configs and says so.

## Limits and follow-up

- Windows MSIX Claude detection/config redirection has known differences. Packaged Claude evidence disables automatic writing until native validation. Unknown install variants may not be detected; user can select manually, but a correct installation/config path is not guaranteed. No Windows/macOS acceptance is claimed.
- Config writes assume app-owned/cooperative same-user config directories. The lock protects against another MOTIF writer, not a malicious process racing parent directories. Close the client before setup. A detected concurrent text change rejects. Stronger platform handle-relative atomic update/ACL validation remains work.
- The stdio launch entry uses the current absolute Electron/script locations. Moving or uninstalling MOTIF makes it stale. No automatic client restart, reinstall, overwrite or cleanup occurs. Review the client config/backup to undo.
- OpenCode current docs describe v2 mcp.servers. Older versions use another format; no silent legacy guess/migration. Version negotiation/native client verification is required before broad compatibility claims.
- App shell shows honest empty/unavailable views. No project/Brand storage, recording, model discovery, provider auth, job rendering or automation is implemented. Those issues stay open. No fake counts/progress/success.

## Verification

Strict TS main/renderer check, production build, 8 real test groups: temporary real executable discovery, actual config writes and backup readback, JSONC preservation, malformed/symlink/duplicate refusal, actual bundled stdio MCP initialize/list/call through Electron Node mode, plus prior authenticated HTTP and filesystem tests. Native Electron smoke confirms no Node renderer APIs, valid IPC and invalid operation rejection. Desktop screenshot visually inspected.

Additional real client validation: OpenCode1.19.6 in an isolated home reads the generated JSONC and reports motif connected. Codex0.172.0 mcp list/get reads the generated TOML and reports enabled stdio; this is config recognition, not a live Codex tool invocation or provider request. No auth or model invocation was attempted.

Not yet verified: official Claude connection or live Codex tool invocation, Windows/macOS installed detection/permissions, native Add MCP dialog end-to-end, updater/installer path stability. Saved configuration is not labeled connected.

## Current technical sources, inspected 2026-11-25

- https://modelcontextprotocol.io/docs/2025-11-25/develop/connect-local-servers : Claude desktop config locations, stdio config, restart requirement.
- https://learn.chatgpt.com/docs/config-file/config-reference : Codex config.toml, command/args/env MCP entries.
- https://opencode.ai/docs/mcp-servers/ : local command/environment and v2 mcp.servers.
- https://opencode.ai/docs/config/ : global config path and precedence.
- https://opencode.ai/config.json : current config schema.
- https://github.com/anthropics/claude-code/issues/69353 : reported MSIX vs old executable path discrepancy. This is issue-report evidence, not native validation.
