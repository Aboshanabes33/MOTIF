# MOTIF desktop foundation, work in progress

The current PR adds the desktop design shell and real agent MCP registration. Read [onboarding implementation and limits](docs/onboarding.md) first. Projects, Brands, recording, media and AI workflows are not implemented; empty states are deliberate. Run `npm ci`, `npm run check`, `npm run build`, `npm test`, `npm start`. Desktop only for detection/config writes; browser preview disables those actions.

The Phase0 notes below describe the earlier spike and are retained as historical evidence, not a statement that the expanded onboarding is verified on Windows.

# MOTIF Phase 0

Architecture spike for #116. Not the MOTIF product. No Harness runtime, UI, Cordis, provider, shell, media processing, deployment, or CI integration.

## Run

Node >=22.12, npm, and a desktop environment with Electron system dependencies:

```sh
npm ci
npm run check
npm test
node scripts/dependency-audit.mjs
npm run probe
npm run build
npm start
```

`probe` starts a real ephemeral loopback service, explicitly approves a local SDK client, invokes `motif_status`, revokes access, verifies denial, and closes the service. It never prints credentials.

The desktop offers service status and a native-confirmation pairing flow. Pairing saves a **private credential file** to a user-chosen new path, valid for 15 minutes or until app exit. Never commit/share this file. No client is configured automatically. Only a custom client accepting URL + Bearer header has been exercised. Do not advertise compatibility with Claude, Codex, or any other client yet.

For Linux desktop smoke testing: `MOTIF_SMOKE=1 xvfb-run -a npm start`. This exercises actual Electron isolation/IPC, clicks status, captures `/tmp/motif-phase0.png`, then exits. Normal start does not evaluate injected scripts or take screenshots.

## Review

- [Architecture, inventory and proposed ADR](docs/phase0.md)
- [Threat model](docs/threat-model.md)
- [Verification and remaining gates](docs/evidence.md)
- [Sequenced implementation issue drafts](docs/implementation-issues.md)

The repo was empty at base `a597c8cc`. Historical inventory refers to the deleted tree at `0f9b5edc`; none of it was restored or copied. This PR does not close #116. Owner review of the ADR and missing evidence is required before Phase 1.
