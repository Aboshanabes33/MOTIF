# Agent Note: Boat as a failover leg for CI pools

Status: implemented

English | [中文](2026-11-21-boat-ci-failover-leg.zh.md)

## Problem

The [failover runbook](2026-07-26-ci-failover-runbook.md) keeps every required Linux check mergeable through two targets: the in-house `vm-backup` pool and, with the [Blacksmith leg](2026-09-09-blacksmith-failover-leg.md), Blacksmith's hosted runners. The in-house pool is a bounded standby and Blacksmith is a second commercial pool; neither gives a per-job Linux machine that is destroyed at the end of the job, so a long or memory-hungry lane keeps paying for idle capacity and shares a host with its siblings.

Boat (boat.dev) runs each GitHub Actions job on its own Linux x86_64 virtual machine through the installed `boat` CI GitHub App: 2-16 vCPU sizes, `/dev/kvm`, Docker, `services:`, `container:`, `actions/cache`, `actions/upload-artifact`, and GitHub Actions secrets. The sandbox is billed by the second and deleted when the job ends, and it carries none of the Boat account's own environment. Its migration advice is to replace the repository's `runs-on` labels wholesale, which would put benchmark measurements, workflow-contract specs, credential-holding jobs, and every default run on third-party infrastructure without a decision record.

## Decision

`DSH_CI_FAILOVER_LINUX` additionally accepts the value `boat`. When a repository writer sets it, the participating Linux jobs retarget onto Boat CI sandboxes at a fixed size per workload; any other value, including unset, keeps today's hosted or pool routing. Like `selfhosted` and `blacksmith` this is writer-manageable repository state — no merge, no PR edit, re-run the affected jobs — and it costs money only while set, so it is an explicit outage or experiment choice rather than the default. `DSH_CI_FAILOVER_WINDOWS` gains no `boat` value: Boat sandboxes are Linux x86_64 only.

Participating jobs and sizes in [ci.yml](../../../../.github/workflows/ci.yml): `publisher-isolated` (linux matrix leg) on `boat`; `node 24 / static`, `node 24 / lint`, and `node 24 / benchmarks` on `boat-large`; `node 24 / coverage` and `node 24 / snapshots and artifacts` on `boat-xlarge`; the `node-compat` matrix on `boat`; and the `all checks passed` verdict on `boat`. The `python checks passed` verdict in [ci-python.yml](../../../../.github/workflows/ci-python.yml) and the `windows checks passed` verdict in [ci-windows.yml](../../../../.github/workflows/ci-windows.yml) follow the same switch onto `boat`, because they are bookkeeping jobs that must not stay queued on an unavailable hosted pool. Sizes mirror the Blacksmith tiers already declared for the same jobs (8 and 16 vCPU) so a trial of either leg compares like with like; the two verdicts and the compatibility matrix take the 4 vCPU default, and `publisher-isolated` keeps the smallest sandbox its npm-only install needs.

The boat branch carries no Dependabot exclusion and no fork predicate, for the same reason the Blacksmith branch carries none: a boat sandbox belongs to one job and is destroyed afterwards, so the persistent-VM rationale that keeps Dependabot on the hosted pool does not apply. The concurrency and thread caps the `selfhosted` branch sets stay unset under `boat` because the sandbox exposes its own dedicated CPUs rather than a slice of a shared host. The benchmark lane moves onto Boat — unlike the shared `vm-backup` pool — because a per-job sandbox is an idle machine, so wall-clock budgets stay comparable; the lane keeps its own two-file parallelism and its twenty-minute bound.

Every other job keeps its current routing under every value: the `python-runtime` builder and the credential-holding real-API e2e and publication lanes stay hosted or on their own pools, the native Windows jobs stay behind `DSH_CI_FAILOVER_WINDOWS`, the e2e, sandbox, expected-filenames, release, and master benchmark workflows keep their existing `blacksmith`-only failover branches, and the release-shaped chains stay entirely hosted because their artifacts feed published registry output.

## Alternatives considered

A standalone `boat-ci.yml` that hardcodes the participating jobs. Rejected because it duplicates whole job bodies, drifts from the required checks that branch protection actually reads, and would report green on jobs that are not the required ones. The switch-and-selector form keeps one copy of every job and makes the change a variable, not a merge.

Adopting Boat as the default runner. Rejected for cost and trust reasons: the default must stay the repository's own hosted enterprise pool, and the explicit opt-in keeps third-party execution a decision rather than a side effect of landing this note.

Extending `DSH_CI_FAILOVER_WINDOWS` with a Boat value. Rejected because Boat offers no Windows image; native Windows lanes keep their own switch and pool.

## Consequences

The boat leg is dormant until `DSH_CI_FAILOVER_LINUX=boat` is set, so it is exercised only during a failover or an explicit experiment. Turning it on requires the Boat CI GitHub App installed on the repository and listed by `boat ci repos`; unrelated runs of the participating jobs then bill the connecting Boat account by the second. Account start limits apply per minute, hour, and day; a throttled start waits and retries rather than failing the check, and the dashboard and `boat ci job <id>` show the wait, cost, and refusal reasons. A `workflow_dispatch`-triggered Boat run executes that ref's own code on the sandbox, so the switch is writer-only repository state, exactly like the other values.

The leg has not yet been exercised on this repository: no trial run of the participating jobs exists at the time of writing, and the size mapping is inferred from the Blacksmith tiers rather than measured. The first use should therefore be treated as a trial — compare wall time and memory against the hosted lanes, watch for Boat's out-of-memory warning (which names the sandbox size to raise), and record the outcome here. Workflow specs pin the branches: [ci-workflow.spec.ts](../../../../scripts/ci-workflow.spec.ts) asserts the `boat` label on every participating job and the unchanged hosted fallbacks, and [ci-compatible-selfhosted.spec.ts](../../../../scripts/ci-compatible-selfhosted.spec.ts) evaluates the `boat` routing mode, so a rewrite of the selectors fails the unit gates. Default cost posture is unchanged: nothing runs on Boat unless the variable says so.
