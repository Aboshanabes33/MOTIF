# Local project/media workflow, partial implementation

Stacked on the real Brands PR, open only. User decisions applied: copy imports into MOTIF-managed project storage; AI stays in selected local agent via MCP, not direct provider auth/model inside MOTIF.

## Real path

Choose project folder through native picker. MOTIF creates .motif with sources/outputs and a versioned workspace.json. Import copies a regular supported source under2GiB to a generated ID; original is not moved/deleted. Source/job IDs, not arbitrary paths/commands, cross validated IPC/MCP. Workspace lock prevents two cooperating app writers. Reopening restores history and marks interrupted jobs failed. No automatic scan/migration of other files.

A fixed FFmpeg job makes at most60seconds of 720p H264/AAC derivative with two threads, no network input protocols and a120-second timeout. Output is a unique job directory. A Whisper job uses a locally cached base model, CPU-only, thread-capped and timeout-bounded; missing model fails before execution, no automatic download. Results enter real persisted job history. Cancel sends process termination; timeout escalates kill. No invented percentage is displayed.

MCP: app-owned authenticated loopback endpoint has workspace/read, render, transcribe and cancel plus status. Client registration includes a private per-session descriptor; the bundled stdio adapter connects to it with bearer auth and forwards only the fixed allowlist. Every media run in the actual app asks native confirmation. Folder selection/import require the app's native dialogs and cannot be supplied by the agent. A paired agent can read only the selected workspace state, request a job on imported IDs and request cancellation. Session token expires after15minutes; restart/new session requires refresh registration and client restart. The product still needs a better credential renewal/revocation UI. No direct AI inference or automatic chat submission into agent apps.

## Evidence

15 passing real test groups, strict TypeScript/build, regression tests from prior PRs. SDK authenticated MCP call runs real FFmpeg on an actual generated test video, verifies nonempty output and restored job history. Another real stdio-to-HTTP adapter test reads workspace and rejects arbitrary shell tool. Actual cached Whisper base run on a short silent test clip completes and writes JSON in about60seconds on this environment. This proves an inference invocation/output path, not speech transcription accuracy. No paid provider/model or new model download.

Actual Electron smoke imports/renders a real test clip in an isolated temporary project and shows succeeded history; screenshot visually inspected. No sample media/Brand/test state is seeded for normal users. Tool health checks alone are not counted as render evidence.

## Not complete / release blockers

- HyperFrames remains actual health check only, not render integration. No full creative/editing pipeline or Brand-conditioned final video is claimed.
- No native Windows/macOS acceptance, no supported packaging, media licensing/provisioning/model install design, hardware compatibility or client dialog end-to-end verification.
- Config/session renewal is short-lived and absolute paths can stale after moving app. Existing old MOTIF entry currently requires review/removal before registration. Do not call third-party agent integration complete.
- Source extension check is not content validation; full media probing/duration/pixel/decompression/resource limits and stronger sandboxing are needed. The FFmpeg/Whisper subprocess still has same-user OS privileges. Malformed media should not be treated as safely sandboxed.
- Static link checks/UUID-managed filenames do not prevent malicious same-user ancestor replacement, hardlinks/mount attacks, or Windows reparse races. Use cooperative user-owned folders only. No hostile filesystem security claim.
- Crash can leave workspace.lock; no automatic stale-lock deletion. Disk quotas/free-space/retention/backup/restore UX and fsync durability remain work. Outputs aren't automatically exported/deleted.
- Native-confirmation, cancellation escalation and crash recovery need broader end-to-end stress tests. Import copy is not cancellable. One active job, no parallel scheduler.
- No natural-language chat send API into Claude Desktop/Codex/OpenCode. MCP provides tools to an agent that the user talks to in its own client. A generic send button must not claim otherwise.

#111/#112 should be re-scoped for agent-based orchestration after owner review, not marked direct-provider integration completed. #113/#114/#115/#116 and Windows readiness remain open. No CI, release, deployment, spending or merge.
