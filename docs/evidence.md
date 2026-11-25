# Verified and not verified

2026-11-25. Base: `a597c8cc`, empty tracked tree. Environment: Linux x64, Node 22.23.5, Electron 45.5.0 under Xvfb. Source and lockfile are committed; build outputs are ignored.

## Verified

- `npm run check`: strict main/preload/contracts and renderer TypeScript checks passed.
- `npm run build`: TypeScript, Vite production renderer and bundled sandbox-compatible preload completed without any historical repository code.
- `npm test`: 4 test groups passed, using real loopback HTTP, real MCP SDK client, and temporary real filesystem files/symlinks. No network/service mocks.
- `npm run probe`: unpaired 401; SDK initialize/list/call succeeded, only `motif_status` with result `MOTIF Phase 0`; revoked token 401. No token is printed.
- Origin including literal null and malicious Host return 403; invalid token 401; 9 KiB payload 413; no HTTP pairing route; unsupported GET 405.
- Static traversal/absolute/backslash/ADS/control-character/symlink escape tests reject, ordinary approved file reads correctly. Reader is not publicly reachable.
- `node scripts/dependency-audit.mjs`: source and every resolved lockfile entry free of Harness/Cordis/workspace references.
- `npm audit`: zero reported vulnerabilities after replacing the initially selected vulnerable Zod 3.x with 4.6.7. Audit describes known advisories only.
- `MOTIF_SMOKE=1 xvfb-run -a npm start`: real Electron, sandbox enabled, no no-sandbox flag. Renderer require/process absent; status IPC returns validated MOTIF response; invalid operation rejected. Actual status button clicked; screenshot captured and visually inspected for readable layout and correct result. App exits and closes listener. Linux emits DBus warnings in this environment.

## Not verified / acceptance gaps

- Native approval/save/cancel/error flow has not been driven end-to-end, nor have token expiry wall-clock behavior and external client configuration been exercised. SDK probe supplies explicit local owner-side approval, not fake MCP responses.
- No third-party MCP client interoperability or complete OAuth HTTP authorization compliance claim.
- No Windows/macOS execution, installer, signing, updater, native keychain, ACL, SQLite persistence, migration, restore or media/provider test.
- No separately isolated service process yet; module lives in trusted Electron main. Crash supervision, concurrent job ownership and cancellation need foundation work.
- Root checks demonstrate static cases only. Race-safe hostile roots and Windows junction/hardlink handling are not complete. Consequently no file MCP/IPC operation is exposed.
- No full production workspace, Brand CRUD, video import or workflow feature. This UI is an architecture instrument, not a placeholder product.
- Full issue #116 acceptance is not met. Keep it open for owner review and evidence-gap decision. Phase 1 is not authorized by this PR.
