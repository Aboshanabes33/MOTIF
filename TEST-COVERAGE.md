# Motif test scope

These are component and composition tests, not browser end-to-end tests. They exercise onboarding, connection actions, Brand form/list states, the real apply() binding against a recording context, and bundle provider references. A new workflow runs them in the repository's normal Vitest configuration.

The targeted isolated run passed 24 tests. It is not a full monorepo build or CI run. No existing browser E2E failure was reproduced or root-caused here. Therefore the issue's browser E2E/root-cause acceptance item remains unverified. Do not call this patch complete browser E2E coverage.

Before closing #41, boot the built app and run onboarding, both AI connections, Brand creation and editor actions through the existing browser E2E harness, including narrow viewport and real Remote-failure checks. Capture the actual failing suite if there is a pre-existing E2E failure, fix it or document its concrete root cause. A missing local environment alone is not its root cause.
