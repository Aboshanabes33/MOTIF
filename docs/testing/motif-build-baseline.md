# MOTIF build baseline, issue #86

Checked main revision `6aed1cbf12b16db067ebb4823e002f9f1d9e85e9` on 2026-11-23, after PR #83 merged. Environment: Linux, Node v22.23.5, pnpm 11.28.5, about 2 GiB RAM with no swap. Node is below the repository's required >=24.9.0, so this is not a supported release-build certification.

## Reproduced source failures and fixes

Initial `npx tsc -b packages/motif/motif-core packages/api/session-controller packages/client/ui-motif` failed. `connection.ts` contained duplicate incompatible `platform` declarations, explicitly undefined optional resolver options, and an indexed probe promise whose inferred value included undefined. Keep one NodeJS.Platform declaration, omit absent resolver options and assert the fixed backend-index correspondence. The source errors were still present after #83, not merely stale findings from #85.

The documented `pnpm run typecheck` generates Typert before compiling client packages. Once that generation ran, it exposed another confirmed error: the new `session/selectDefaultModel` endpoint lacked a liveshare endpoint classification. It is now explicitly owner-only, with a regression test. Generating Remote declarations is required; missing generated declarations from a direct cold client compile are not independent source regressions.

After fixes, the affected-package command above exits 0. The documented `pnpm run typecheck` completes Host Typert, host compiler and client compiler successfully, then fails both aggregate checks with signal SIGKILL, not a TypeScript diagnostic. Exact aggregate commands are `tsc -b tsconfig.host.json` and `tsc -b tsconfig.client.json`. The environment's low memory is a possible cause, not a confirmed kernel diagnosis.

`pnpm run build` was attempted under a 55-second limit. Native addon, Host Typert and host compiler passed. The Host bundle child reported SIGKILL while running `tsdown --config-loader native --env.DSH_BUILD_FACE host`; the overall command was then stopped by the time limit (exit 124). This is not a passing build and does not establish that later build stages are clean.

## Tests and remaining verification

21 focused tests pass: connection/cache, Windows command resolution and liveshare endpoint classification. A broader 40-test connection run has four existing failing expectations in connection-platform/signin tests: an old fake child lacks the launch-event contract, two error-copy expectations differ from current messages, and a Windows metacharacter test expects an unsuffixed executable. These were observed after the type-only fixes and are not silently reported as passing.

Before calling the repository baseline green, rerun `pnpm run typecheck` and `pnpm run build` under supported Node >=24.9.0 with enough memory for the aggregate programs and bundlers, and resolve or document the four sign-in test mismatches. No CI configuration changed. This report does not certify desktop runtime behavior, which remains issue #87.
