# Developer Mode verification (#87)

Partial regression verification, not supported desktop runtime sign-off.

Focused checks cover both toggle directions, accepted Host state, failed writes, initial unavailable/loading state, conversation instance preservation, renderer remount using accepted state, missing Host owner, and serialized pending writes. Existing settings tests exercise Remote describe/mutate publication and revision recovery.

Run: `npx vitest run packages/client/ui-motif/tests/developer-mode.client.spec.tsx packages/client/ui-settings/tests/developer-tools.client.spec.ts`.

Actual desktop launch attempted November 23, 2026 with `pnpm start:desktop`. It failed before a window opened: ERR_MODULE_NOT_FOUND for apps/desktop/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js. Built main/Host entry artifacts are also absent. This is an artifact/baseline blocker, not evidence that Developer Mode itself fails. Environment Node 22.23.5 is below repository requirement >=24.9. Full build SIGKILL is documented under #86. No real desktop screenshot or restart/reconnect result exists.

Required supported-machine follow-up:
1. Build the desktop/Host artifacts on Node >=24.9 with enough memory; launch the real packaged/unpackaged desktop.
2. Enable Developer Mode, confirm full Harness controls, keep an active conversation and verify its state survives both directions.
3. Restart renderer, reconnect Host and restart desktop. Verify accepted persisted state and unrelated settings unchanged.
4. Switch to normal mode and verify developer-only controls are hidden. Simulate a refused write/disconnect; inspect safe error and recovery.
5. Repeat web composition with desktop-only capabilities absent. Capture actual screenshots and record version/platform.

These tests do not prove disk persistence across real process restart, Host scoping in a packaged build or Electron UI layout. Account scoping remains #79. Keep #87 open.
