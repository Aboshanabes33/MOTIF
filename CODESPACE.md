```sh
git stash push -u -m "before-motif-update"
git switch main
git pull --ff-only
nvm install 24
nvm use 24
corepack enable
pnpm install --frozen-lockfile
pnpm run build --serial &&
pnpm dsh web --no-open --trusted-host "${CODESPACE_NAME}-3080.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
```

Ports -> 3080 -> Private -> Open in Browser. Run the server only after the build succeeds.

## Low-memory build diagnostics

`pnpm run build --serial` now bounds the inner Host/Client workspace bundles too: one short-lived tsdown child per member, with its ordinary root and package config. It does not skip compilers, native output, Desktop, Web or aggregate checks. The ordinary parallel path is unchanged. Intentional empty face configs are logged as such; a real member failure stops immediately with its path.

The previous Host bundle was killed by SIGKILL while the root tsdown process launched workspace members concurrently. Bounded Host and Client bundles, Desktop bundle and Web Vite 6 build have now passed individually. This is NOT a complete green build: the Host and Client aggregate TypeScript programs still exceed this approximately 2 GiB environment (default heap OOM, and SIGKILL with a larger heap). Their checks remain required, not suppressed. Supported Electron launch/screenshots are also outstanding. Use a runner with enough memory for those programs, or further split the aggregate checks without reducing coverage before calling #94 finished. No deployment or public port is required.
