# MOTIF Windows test, merged November 24

PRs #104, #101, #103 and #102 are merged. This is a source checkout, not a tested Windows installer. No Windows/Electron run has been performed for these changes. Partial acceptance gaps remain in the linked testing notes.

## Fresh native Windows checkout

Use Windows x64, native PowerShell and a fresh local folder. Do not copy Linux/Codespace node_modules, caches, credentials or old user data. Install Git, Node.js 24.9 or newer and Corepack-enabled pnpm (package.json pins 11.28.5). Native dependencies can require Windows build tools; follow the install diagnostic rather than disabling their build steps. See docs/development.md for the repository prerequisites.

```powershell
git clone https://github.com/Aboshanabes33/MOTIF.git
cd MOTIF
git switch main
git pull --ff-only
node --version
corepack enable
pnpm --version
pnpm install --frozen-lockfile
pnpm run build --serial
```

Stop on an install/build error and save the first error, command, Node/pnpm versions and available RAM. Do not continue with stale artifacts or add noCheck. The aggregate TypeScript build still exceeds the approximately 2 GiB environment used for the Linux tests. Windows memory requirements are not measured.

After a successful build, run the ordinary Desktop launcher (it may prepare/download required local runtime components):

```powershell
pnpm run dev:desktop
```

For subsequent launches of unchanged built artifacts, `pnpm run start:desktop` skips the rebuild. The development launcher uses an isolated development home and prints its home/userData paths. Do not point it at old data. Neither launcher publishes or uploads a release.

## Build an unsigned Windows installer

After `pnpm run build --serial` succeeds, run this from the repository root in native Windows PowerShell:

```powershell
pnpm run package:desktop:win:x64:unsigned
```

This packaging script requires a Windows x64 build host with x64 Node. Linux/Codespaces and ARM64 Node hosts are rejected. The build command alone does not create an installer. Packaging is separate from the development launcher above.

The configured output directory is `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/`. After packaging succeeds, find the installer from the repository root:

```powershell
Get-ChildItem .\apps\desktop\.desktop-build\targets\win-x64\unsigned-artifacts\*-unsigned.exe
```

The configured filename starts with `deepseek-harness-` and ends with `-unsigned.exe`. This is an unsigned installer, so Windows may show a publisher/security warning. These commands and paths were checked against the repository scripts, not by building or running on Windows. A successful package step does not prove clean-machine installation, Electron behavior or optional media tools work. No installer is uploaded or published by these instructions. Stop on a packaging error and save the first error rather than trying an old installer.

## Acceptance checklist

1. Open a fresh Brand. Enable Developer Mode. Check real Plugins, Models, presets, trajectory, document preview, automation and advanced settings. Return to normal mode and check developer registrations disappear.
2. Open two Sessions, put distinct unsent text in each, switch modes repeatedly and switch Sessions. Check no lost text, swapped session identity or duplicate navigation. A real model run requires separately configured fresh credentials and is not part of a keyless smoke.
3. Quit the application fully, not just the window (Windows close can hide to tray). Relaunch. Check accepted Developer Mode preference, Brand and Session state. Also test reconnect and record what survives.
4. Inspect local media UI with a disposable clip. Production rendering and Session proposals remain gated; an unavailable message is expected, not a failed promised feature. A private test carrier was verified on Linux with real speech, captions and audio; that does not verify native Windows tools or unlock production rendering.
5. The standalone account page is not wired to a shared Host. Without a fresh authorized HTTPS Convex deployment it must show unavailable, not collect credentials. Live email, two-user isolation and isolated execution gateway are unfinished. Do not reuse deleted keys or services.

Capture the app version/commit, screenshot, exact action, expected result and actual result for failures. Redact personal data and do not send passwords, tokens or whole credential files. No remote access is needed to try these steps. If direct testing help is wanted, first agree on a supported Windows session and its scope.

## Still unfinished

- #94: full one-command checked build on sufficient memory or a proven equivalent bounded checker.
- #93/#87: supported Electron mode, live Session, reconnect and restart acceptance.
- #78: editable caption/Brand styling, transcript-based clip selection UI, music/mixing, user retention controls, Windows tool packaging and full-shell acceptance. Plan-only provider enforcement needs a separate technical decision; proposals stay off.
- #79: authorized live auth/email test and genuinely isolated per-account runtime/gateway. Signing in alone does not provide isolation.

Details: docs/testing/motif-developer-mode.md, docs/testing/motif-media-workbench.md, docs/testing/motif-account-runtime.md and convex/AUTH.md. Merging does not mark these Issues complete.
