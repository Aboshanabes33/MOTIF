# Account runtime staging (#79)

This is an internal, unregistered control-plane scaffold, NOT a deployed multi-user system. No network endpoint, container, process, account login, spending or deployment is created. Shared Host access is not made safe by importing it.

`AccountRuntimes` requires a trusted verifier on every acquire. Namespaces hash issuer plus subject, never a caller's chosen account ID. Access fails closed when an account has no runtime. Attached runtimes must attest separate OS user/container/VM, private home, credentials and processes. These flags are a trusted provisioner contract, not proof of OS isolation. Runtime replacement requires completed revocation; failed stop quarantines the account. Revocation fences active leases before teardown. Operation adapters must check the lease and honor its AbortSignal throughout execution.

Before production:
- Implement and audit signature/issuer/audience/expiry verification with Convex Auth's actual deployed token contracts. Never accept decoded JWT claims alone.
- Implement a trusted runtime provisioner. Verify filesystem, credential store, IPC/socket, network and process isolation independently. Do not share the current owner principal across tenants.
- Route authenticated Host Remote requests to only that account's runtime, including reconnect, cancellation, streams and all source/output operations. No user-facing attach/revoke method.
- Wire verified login/sign-out, revocation and runtime teardown. A lease timeout is not immediate upstream token revocation.
- Add real two-account end-to-end adversarial tests across Brand data, key material, native execution, media output and RPC ownership. Local tests cover routing/lifecycle invariants only.

Focused check: `npx vitest run packages/motif/motif-core/tests/account-runtime.spec.ts`.
Affected compile: `npx tsc -b packages/motif/motif-core`.

Keep #79 open. Do not advertise multi-user isolation or expose the shared runtime until the production conditions above are verified.
