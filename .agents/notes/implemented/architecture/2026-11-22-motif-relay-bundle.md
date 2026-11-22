# Agent Note: The Motif relay ships as an installable Profile Bundle

Status: implemented

English | [中文](2026-11-22-motif-relay-bundle.zh.md)

## Problem

The [relay package](../../../../packages/llm/llm-motif-relay/README.md) implemented the delegation the [Motif brief](../../../../Motif-implementer-brief.md) asks for: one Edit Request becomes one fresh Claude Code or Codex run in the Brand folder, and only its final answer returns as the assistant reply. As delivered it was a package and nothing more. No profile mounted it, the plugin manager never offered it, the offline Official catalog had no entry, and the two backends it delegates to (`dsh-subagent-claude-code`, `dsh-subagent-codex`) stay switched off until someone enables them. A person running the app therefore saw no new route, no new plugin, and no behavior change at all — the engine existed and no car had it installed.

The repository's own admission rule for product surface is the Profile Bundle: a public package declaring `dsh.bundle.patch`, an icon, and `./locale/*.json` display metadata, listed in the installation's on-demand bundles so the Plugins page can install it, select its layer, and switch it off again. The relay satisfied none of those clauses.

## Decision

The relay is now a Profile Bundle. `packages/llm/llm-motif-relay/cordis.patch.yml` inserts two Host rows: the one-shot Claude Code provider, and the relay route over it with `backend: claude-code`. Enabling the bundle in the Plugins page is what puts `Claude Code (relay)` in the model selector; switching it off deselects the layer and returns the selector to its previous routes. The package gains `dsh.bundle.patch`, an `icon`, eight `locale/<language>.json` dictionaries, the patch and locale files in `files`/`exports`, and a dependency on `@deepseek-ai/dsh-subagent-claude-code` so the provider its layer mounts is installed with it.

It stays in `ON_DEMAND_BUNDLES` rather than any shipped template. `packages/util/official-bundles/src/bundles.ts` therefore keeps the relay out of every profile until a person asks for it, and the catalog generator still enforces that an on-demand provider is never installed by the distribution itself. The plugin manager lists it in `MORE_BUNDLES` beside the two subagent providers it composes.

The layer mounts the provider itself instead of telling the user to enable two bundles. One switch that produces a working route is the smallest honest product surface; the relay's own failure classification still reports a missing native sign-in or an unavailable runtime, so a half-configured machine fails with an actionable message rather than a silent no-op. A deployment that relays to Codex replaces the two rows, as the package README documents; no automatic backend switch exists in either direction.

## Alternatives considered

Mounting the relay in the shipped `web-app` or `base` patch so it is on with no click. Rejected because it would put a third-party runtime in the default request path of every installation and would make the Claude Code provider a required dependency of the product, against the repository rule that optional providers install on demand.

Shipping two bundles, one per backend. Rejected as premature: the Codex route is a row swap on the same package, and duplicating the bundle would double the catalog, locale, and policy surface for a configuration change.

Leaving the package unmounted and documenting a hand-written `cordis.patch.yml` insert. Rejected because it is exactly the state that produced this note: correct code, no reachable product surface, and no way for a non-technical user to discover it.

## Consequences

The relay is discoverable and reversible through the Plugins page instead of through a hand-edited profile. Installing it pulls the Claude Code provider and its Agent SDK, so the install is no longer dependency-free — that is the cost of a layer that actually routes. Nothing starts until a Session sends a message, so the idle cost stays zero.

`packages/llm/llm-motif-relay/tests/bundle-layer.spec.ts` pins the wiring: the manifest declares the layer, icon, and locale files; composing the shipped patch yields both rows with `backend: claude-code`; every row the layer mounts is a declared dependency; every shipped locale carries a title and description; and the bundle appears in the on-demand list, the plugin manager, and the generated offline catalog. The generated catalog is regenerated rather than hand-edited, so the entry cannot drift from the package's own metadata.

The relay still has no recorded-session replay case in `snapshots/`, so the shipped profile's end-to-end behavior is proven by the package's Loader composition test with a stand-in backend rather than by a snapshot. Adding that case remains the open half of the brief's first seam.
