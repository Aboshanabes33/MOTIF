# Proposed sequenced issue drafts

These are drafts for owner review, not newly created GitHub issues and not permission to implement. No Phase 1 starts from this PR alone.

## P0-A: Close architecture evidence gaps

Depends on owner selecting OS and first MCP client. Acceptance: real native pair approve/cancel/save/error/revoke/expiry tests; actual chosen client invokes only status; foreign frame/origin tests; OS permissions check; root TOCTOU/reparse-point design reviewed; decision recorded in ADR. No media capabilities.

## P1-A: Separate service lifecycle and contracts

After owner go-ahead. Acceptance: utility-process transport has versioned runtime schemas and parent identity, renderer cannot reach MCP credentials; crash/restart and shutdown clear capabilities and sockets; bounded messages, cancellation and ownership tests. No arbitrary process launch.

## P1-B: Durable project storage and backup

Depends on approved persistence/storage policy. Acceptance: versioned SQLite trial or chosen equivalent; transaction and interrupted-write tests; migrations are explicit with backup/rollback; fresh-directory restore verifies metadata and assets; no Harness data access or silent movement; one service writer.

## P2: Project/Brand/source workspace

Depends on separately confirmed full-workspace scope. Acceptance: real local CRUD and source import under approved roots, malicious path/junction/hardlink/race cases blocked, moved/duplicate/oversized input handled, source-copy or link behavior visible, no fake availability labels.

## P3: Scoped MCP and real media job

Depends on file security and job ownership. Acceptance: supported client pairs explicitly; revoke/expiry tested; fixed capability allowlist, job state persisted, FFmpeg/tool availability measured, one real source-to-output workflow, cancel/crash cleanup, no shell/arbitrary filesystem. No API/provider capability claimed from a static list.

## P4: Provider adapters/history

Depends on provider/account permissions. Acceptance: real authenticated discovery/invocation and cancellation; credentials excluded from renderer/logs, durable output provenance, safe retry semantics. Test fixture results never labeled live provider proof.

## P5: Release/installer readiness

Depends on owner OS choice and explicit release/signing authority. Acceptance: native clean-machine install/uninstall/upgrade/restore, sandbox and fuse checks, license notices, signing/notarization and updater verification, no data loss. Any certificate spend/deploy remains separately approved.
