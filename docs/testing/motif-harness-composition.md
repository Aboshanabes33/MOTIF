# MOTIF Harness composition

Developer Mode mounts the existing Harness plugins after the Host accepts the saved developer-tools preference. Returning to MOTIF removes their registrations and returns to the existing conversation without recreating the Session service. Pending teardown finishes before remount. Before Host settings arrive, developer-only surfaces stay absent.

Included real surfaces: trajectory, Agent preset selection, plugin management, document preview, entry customization, Models, advanced shell/Agent/subagent/web settings, and automation task management. The Host schedule service stays available so saved tasks are not destroyed by a view change. Switching display mode does not cancel existing work or revoke execution permission.

MOTIF Brands and AI settings remain available in either mode. Web does not expose the desktop-only Browser tab. DeepSeek account/credits onboarding and connector accounts remain absent: MOTIF uses its Claude/Codex routes and has no configured DeepSeek account owner. Models configuration is available without automatic DeepSeek onboarding.

Actual Web verification on Node 24.22.3 used a private clean test home: switching enabled Plugins, Agent presets and advanced settings; returning removed their entries and restored Brands. Default workspace initialization succeeded. Focused tests cover delayed accepted state, failed persistence, ordered teardown/remount and active conversation component preservation.

Still required before closing #93/#87: supported Electron screenshots, a live reconnect/restart round trip, complete capability parity review and real active-session interaction across every restored surface. No provider credentials were entered and no generation or plugin installation is part of this verification.
