# Phase 0 architecture investigation

2026-11-25. Status: proposed ADR, not approved for Phase 1.

## Recommendation

GO for continued standalone investigation in this repository. NO-GO for product implementation/release until owner decisions and the gaps in evidence.md are resolved. The architectural seam works with a real sandboxed Electron renderer and authenticated MCP client. Filesystem race resistance, native client pairing UX, cross-platform packaging and durable state are not proven.

## Repository reality and dependency graph

Current base `a597c8cc` deleted all tracked Harness files. There is no current monorepo to integrate with. A root private npm package is the smallest honest boundary now; a new repository adds no technical isolation benefit. If the product grows, split `apps/desktop`, `packages/contracts`, `packages/service`, `packages/mcp` without workspace references to the historical fork. Do not restore the former root configuration.

Historical graph at `0f9b5edc`:

```text
apps/desktop main
  -> project-manager -> dsh-app-boot + dsh-official-bundles
  -> host-process -> account + plugin diagnostic types + runtime processes
  -> paths -> dsh-home-paths
  -> ipc -> settings/browser/shortcuts/file-actions client types
  -> manifest -> dsh-api-gateway + dsh-error + Cordis
```

Current executable spike:

```text
React renderer -> named contextBridge method -> runtime Zod schemas
              -> Electron sender/frame guard -> MOTIF service module
local SDK client -> loopback HTTP -> Host/Origin/Bearer checks -> MCP adapter
                                                           -> status capability
root reader -> Node fs (test-only; no public IPC/MCP route)
```

`package-lock.json` is the resolved graph. `node scripts/dependency-audit.mjs` scans every lock entry and source file for Harness/Cordis/workspace references. Successful build starts from the empty tree without any historical package. The renderer imports the contract as a type only; no service code enters its bundle.

## Historical reuse inventory

All paths below are historical, not files in the new app. Inspect via `git show 0f9b5edc:<path>`.

| Candidate | Evidence | Disposition |
| --- | --- | --- |
| `apps/desktop/package.json` | Direct dsh-api-gateway, dsh-error, Cordis; workspace dev/runtime tree dependencies | Do not reuse shell/package manifest |
| `apps/desktop/src/main.ts` | Imports project manager, Host process, settings UI types, runtime tree, account/browser machinery | Do not reuse entry point |
| `project-manager.ts` | dsh-app-boot, official bundles, dsh-desktop-runtime, subprocess-local | Do not reuse |
| `host-process.ts` | Account session and plugin-manager diagnostics, spawn runtime | Do not reuse |
| `paths.ts` | resolveDshHome | Do not reuse; preserve old data untouched |
| `ipc.ts` and preload family | Client file actions, shortcuts, browser and settings types; broad historic channels | Do not reuse; narrow new schemas instead |
| `runtime-tree.ts` | core-package-set + release descriptor, bundled Host packaging | Do not reuse as MOTIF packaging |
| `settings-file.ts` | Generic atomic-write concept, but dsh-atomic-write dependency and update schema | Reimplement only after persistence decision |
| `single-instance.ts` | Interface and function, no imports | Generic candidate concept; no code copied, needs new MOTIF identity tests |
| Native dialogs/window lifecycle | Electron APIs are generic; old main mixes them with runtime | Reimplement minimal generic pattern, as spike does |
| Installer/updater scripts | Former manifest packages bundled dsh artifacts | Reconsider fresh tooling after OS decision; no old upload/update endpoints |

The historical root LICENSE is MIT, copyright DeepSeek 2026. No historical source is copied here. If any later reuse is approved, retain notices and review each file and bundled third-party license, not just the root license. This spike makes no decision to relicense the repository. Dependency license/notice aggregation is a release gate.

## ADR-0001, proposed boundaries

### Processes

Renderer: Vite/React/TypeScript, local built assets only, no Node, isolated context and Chromium sandbox. Preload exposes one typed method accepting two exact variants, not raw ipcRenderer. Main validates the sender webContents, top frame, exact document URL and request again. Response schemas are validated before crossing back.

Spike service is an independently testable module **in main**, not a separate OS process. This avoids claiming process isolation that does not exist. Proposed foundation: move application state and MCP into an Electron utility process with private parent MessagePort, bounded messages and explicit shutdown. A utility process still has Node privileges, not an OS security sandbox. Media workers need a further restricted execution design and are excluded here. No renderer-controlled process names or commands.

### MCP transport and pairing

Pinned `@modelcontextprotocol/sdk` 1.32.2 uses Streamable HTTP, stateless, JSON responses. Loopback `127.0.0.1`, random OS port, exact Host, reject every browser Origin, 8 KiB JSON limit, 5-second request/header timeouts. No CORS. No HTTP pairing endpoint. Only `motif_status` is registered. Credentials are independent 256-bit random capabilities stored hashed in memory, max 16 entries, 15-minute expiry, all invalidated at shutdown/revoke. Pairing requires a native main-process approval and exclusive-create save dialog, not a renderer-provided token/name/path. Renderer receives only saved/cancelled status. Probe uses the same owner-only approval API directly.

This is **a private local bearer scheme, not an OAuth authorization server**. It is not a claim of full MCP HTTP authorization-spec conformance or arbitrary client interoperability. No automatic client installation or modification of external client settings. Owner must choose the first supported clients and decide whether OAuth support or a stdio bridge is needed. Stdio is simpler for client-launched process ownership but does not validate the requested loopback boundary; HTTP was selected only for the spike. Do not make long-lived production auth from this experiment unchanged.

### Persistence and storage

Spike: no project database, no migration, no media reads/writes. Electron may maintain its normal profile/cache. Pair credential file is the sole explicit app write and contains a secret; user-selected new file, Unix mode 0600, never overwritten. On Windows mode bits do not establish a restrictive ACL. Windows credential storage remains unverified; do not ship this export flow there without ACL/keychain review.

Recommendation to review: local SQLite for structured project/Brand/job metadata, one service writer, versioned migrations and transaction boundaries. Alternative JSON is easy to inspect but unsafe for multiple related job updates without a journal/locking protocol. Remote DB would add account/network obligations with no Phase0 need. No DB is implemented or irreversibly selected.

Proposed source model: default to copying approved source files into app-managed project storage only after user confirmation of space/copy semantics; linked originals are an explicit alternative with missing/moved-file detection. Store outputs in separate job-ID directories, atomic finalize, no overwrite, manifest ties each output to source/Brand/job. Cache/temp files have quotas and crash-safe cleanup restricted to app-owned job directories. Never clean an arbitrary selected root.

Backup: a consistent SQLite backup plus versioned asset manifest/checksums and included files, not a raw live database copy or database-only backup. Test restore into a fresh separate directory and refusal on version mismatch before migration. No scan, import, move, or delete of existing Harness data. Any legacy importer needs separate opt-in and dry-run backup plan.

### Approved roots

No public file operation exists in the spike. `readApprovedFile` proves static lexical/canonical checks, symlink refusal and small-file reading against a supplied trusted root. It is deliberately not exported to clients. Concurrent ancestor replacement, hard links, mount points, Windows junctions/reparse points and access-control differences remain unsolved. This is insufficient for production hostile writable roots. Prefer importing from a trusted opened file handle into an app-owned directory, and evaluate platform handle-relative/no-follow primitives before exposing file capabilities.

### OS and packaging

Only Linux x64 development execution is evidenced, not supported distribution. Ask owner for target OS/architecture priority. Windows x64 is a candidate from prior work, not a selected target here. macOS arm64/x64 requires native tests and signed/notarized packaging decisions. Linux needs distro/library, sandbox and installer testing. Fresh Electron Forge vs electron-builder evaluation should compare asar/preload location, native SQLite ABI, secure fuse settings, code-signing keys, updater authentication, upgrades/uninstall and reproducibility. No installer, signing, updater, certificate purchase or release publication occurs in Phase0.

## Owner decisions before Phase 1

1. Review go/no-go and whether to fund further architecture validation before product code.
2. Select first OS/architecture and local MCP client(s). Confirm manual pair/config versus an explicitly authorized installation flow.
3. Confirm service utility-process proposal and SQLite exploration, not a completed DB selection.
4. Decide source-copy versus linked-file default, output/backup destination rules and storage limits.
5. Confirm full workspace product scope separately. Issue bodies label it owner-approved, but this spike only relies on the actual request to investigate #116, not those labels as blanket authority.

## Technical sources

Official technical documentation, inspected 2026-11-25. Version-pinned SDK declarations/source in node_modules govern the actual 1.x API; the newer SDK web guide is architectural background, not a claim that this uses v2.

- https://www.electronjs.org/docs/latest/tutorial/security : sandbox, context isolation, sender validation.
- https://www.electronjs.org/docs/latest/tutorial/context-isolation : narrow contextBridge design.
- https://www.electronjs.org/docs/latest/tutorial/process-model : main/renderer and utility-process roles.
- https://ts.sdk.modelcontextprotocol.io/v2/serving/http.html : loopback Host/Origin checks and explicit auth layer.
- https://nodejs.org/api/fs.html : filesystem access/open race warning and realpath semantics.
- https://sqlite.org/whentouse.html : local desktop storage fit.
- https://sqlite.org/backup.html : consistent backup API and backup caveats.

Repository issue text is planning data, not an independent authority source. Current source/lockfile, historical files and commands in evidence.md are primary implementation evidence. No independent benchmark or community claim drives these decisions.
