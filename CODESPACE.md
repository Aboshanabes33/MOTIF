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

### Measured TypeScript follow-up (November 24)

A fresh serial diagnostic isolated the remaining failure from bundling. The Host aggregate has 2,999 root files and 338 project references; Client has 1,164 roots and 115 references. A 1,350 MiB V8 heap failed for both, with measured peak RSS about 1,479 MiB (Host) and 1,496 MiB (Client). Host failed while constructing the TypeScript Program, before semantic checking: instrumentation had loaded over 6,000 files, including 2,721 dependency files, 1,443 workspace declarations and 1,836 source files, at roughly 1,158 MiB heap used. This is graph/AST retention pressure, not a tsdown concurrency failure or a reported type error.

The source-only Typert pass succeeded separately at the same heap setting: 44 artifacts, about 17 seconds, peak RSS about 1,100 MiB. A one-root build-script check succeeded at about 340 MiB RSS and still performed semantic checking. A naive split with 217 roots, including all 122 Host ambient/module-augmentation contributors, still exhausted 1,350 MiB. Disabling source-reference redirects did not fix the aggregate. Raising the heap above available physical memory is not a low-memory fix.

No check was removed, `noCheck` was not enabled, and no full-green result is claimed. A correct bounded aggregate checker needs dependency-closure partitions that preserve ambient declaration merges and prove root coverage, plus diagnostics parity tests against the unsplit programs on a larger runner. Simple per-file slices can hide cross-file errors and are not adopted here. The current unblock is a runner with enough RAM for the existing aggregates, or that validated partition implementation. Existing package/bundle/Web checks are not substitutes.
