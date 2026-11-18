# Licences

The licence of every dependency added since 2026-11-14, as brief §12 requires: verified, checked
for commercial use, and with its transitive dependencies reviewed. The dependencies the demo
already had are not listed yet; that inventory is part of the phase 1 audit.

## `@earendil-works/pi-coding-agent` 1.5.2 and `@earendil-works/pi-ai` 1.5.2

Added on 2026-11-14 for account linking (`docs/plans/pi-sdk-account-linking.md`). Both are the Pi
SDK, from <https://github.com/earendil-works/pi>, and both are under the **MIT** licence, which
permits commercial use. `pi-ai` is a dependency of `pi-coding-agent`; it is listed in
`package.json` as well because `src/lib/pi.server.ts` imports it directly. Both are pinned to one
exact version so that the two cannot drift apart.

Installing them adds 106 packages. Their licences, as declared in `package-lock.json` on
2026-11-14:

| Licence       | Packages | Commercial use                                                      |
| ------------- | -------- | ------------------------------------------------------------------- |
| MIT           | 48       | Permitted                                                           |
| Apache-2.0    | 38       | Permitted. Keep the licence and any NOTICE file when redistributing |
| BSD-3-Clause  | 12       | Permitted                                                           |
| ISC           | 4        | Permitted                                                           |
| BlueOak-1.0.0 | 3        | Permitted                                                           |
| Unlicense     | 1        | Permitted (public-domain dedication)                                |

None is under a copyleft licence, and none lacks a declared licence. The Apache-2.0 group is
mostly the AWS SDK (`@aws-sdk/*`, `@smithy/*`), which the Pi SDK depends on for Amazon Bedrock, a
provider Motif does not offer.

To repeat the review after an upgrade, compare the `license` fields of the entries that
`package-lock.json` gained.

`playwright-core` 1.65.1 (Apache-2.0) is a development-only browser driver for the provider-auth E2E test. No browser binary is redistributed with MOTIF. Preserve its LICENSE and NOTICE if redistributing the driver.
