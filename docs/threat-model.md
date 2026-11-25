# Threat model, Phase 0

Assets: application identity, local files, future credentials and job ownership. Attackers: malicious renderer content, web pages targeting localhost, unpaired local clients, malicious paths, crashed service, and untrusted same-user local processes. An attacker already controlling the user account can read user-owned secrets and is not defeated by bearer tokens or Electron isolation alone.

| Threat | Implemented mitigation | Evidence / residual risk |
| --- | --- | --- |
| Renderer Node escape | Node disabled, contextIsolation, sandbox, local files/CSP; deny popups/navigation, remote requests, permission grants | Real Electron smoke sees no require/process. Does not prove absence of Electron/Chromium vulnerabilities |
| IPC confused deputy | Fixed channel; strict discriminated schema, sender identity + top frame + exact URL; validate replies | Invalid request rejected. Forged subframe/navigation end-to-end cases still need native tests |
| Renderer silently pairs attacker | Native approval and save dialog; no token/path/name from renderer; pair lock, default Cancel | Manual UI flow not end-to-end tested; compromised renderer can repeatedly request dialogs after cancellation. Add gesture/rate controls before product |
| MCP spoofing / DNS rebinding | Exact runtime Host; browser Origin forbidden; unguessable per-client expiring Bearer credential | Real HTTP 401/403 tests, no pairing endpoint. Token theft permits sole harmless tool until expiry/revocation |
| Resource exhaustion | 8 KiB body, request/header timeouts, max pairing entries, no expensive tool | Oversized request test. Connection/rate limits and concurrent authenticated clients remain work |
| Secret disclosure | Hashed tokens in memory; no tokens in IPC replies/logs/MCP response; private exclusive file export | Linux file mode requested. Windows ACL, crash dump exclusion and production OS keychain not verified |
| Traversal / symlink | No file API exposed; test-only root reader rejects absolute, parent segments, backslashes, controls, ADS colons and symlink components | Static traversal/symlink tests pass. TOCTOU ancestors, hard links, mount aliases, case/Unicode, junctions remain blockers before exposing file tools |
| Command execution | No shell/spawn or arbitrary tool selector API; sole tool constant response | Source inspection. Future media tools need fixed executable IDs, argument arrays, sandbox/limits and explicit permissions |
| Job ownership / lifecycle | No jobs accepted; random-port listener app-owned; quit removes handler, closes sockets, revokes credentials | Probe cleanup and actual smoke exit pass. Service crash/restart protocol and worker cancellation remain unimplemented |
| Data loss / migration | No existing app data discovered, migrated or deleted; credential file uses exclusive create | Root reader only reads test files. Future DB migration/backup restore is a prerequisite, not assumed |
| Dependency compromise | Exact direct versions and lockfile; zero npm audit findings at check time | Audit is not proof of safety. Supply-chain provenance, notices, signed binaries, secure updates/fuses are release work |

No production file capability should be enabled until hostile-root race tests and platform-native validation pass. A read-only status response cannot establish media/job/provider readiness. This threat model is a review input, not a security certification.
