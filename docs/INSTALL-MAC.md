# Installing MOTIF on macOS (unsigned build)

The macOS build is not signed or notarized (no Apple Developer account), so macOS will block it the first time.

1. Download `MOTIF-<version>-mac-arm64.zip` (Apple Silicon: M1/M2/M3/M4) or `MOTIF-<version>-mac-x64.zip` (Intel).
2. Unzip it and drag `MOTIF.app` into Applications.
3. Open it once. macOS says it cannot verify the app. Click Done.
4. Open System Settings > Privacy & Security, scroll down to the message about MOTIF and click Open Anyway. Enter your password. Open MOTIF again and click Open.
5. If macOS says the app is damaged, run this in Terminal, then open it again:
   `xattr -cr /Applications/MOTIF.app`

Sign-in uses port 8795 on your own machine, so keep it free.
This build was cross-built on Linux and has not been tested on a Mac yet.
