# Decisions

Questions the owner has settled, newest first. The ones still open are listed in `AGENTS.md`
under "Open decisions". When one is settled, move it here.

## 2026-11-14: MOTIF leaves Lovable

**Decided by** the owner, with the instruction "Remove Lovable in this Project".

**The question.** The demo was generated and hosted on Lovable. Lovable's rules required model
calls to go through its AI gateway and forbade hand-written database migrations, and its builds
deployed to Cloudflare Workers. The brief (`product-brif.md`) requires migrations in the
repository, the Pi SDK with each user's own provider credentials, and a Node.js backend. No
single design could satisfy both.

**The decision.** MOTIF moves off Lovable completely. The brief is the only source of
architecture rules.

**What changed in the repository.**

- `vite.config.ts` is a plain Vite config instead of Lovable's preset. It produces the same
  production build, and additionally refuses browser imports of `*.server.*` files.
- Lovable's AI gateway SDK and its generated model types are gone. The two AI server functions
  send the same prompts to the same model (`gpt-6-astra`), straight to the OpenAI Responses API
  from `src/lib/ai.server.ts`, and need `OPENAI_API_KEY` in the server environment.
- The hook that reported errors to Lovable's editor, the `author` and `twitter:site` meta tags
  that named Lovable, the template marker `project.json` and Lovable's block of rules in
  `AGENTS.md` are removed.

**What follows from it.**

- Model calls are billed to the owner's OpenAI account.
- The web app has no host. Where it runs is now part of the open decision "Where MOTIF runs".
- Database migrations can live in the repository, as the brief requires.
- Nothing in this repository controls the Lovable project itself: its GitHub connection and its
  published demo are the owner's to change in Lovable.

**Not decided here.** Calling OpenAI directly is a stand-in chosen during the removal, because
it is the model the demo already used. It does not settle which providers MOTIF supports: the
brief's agent layer (Pi SDK, per-user credentials) replaces it in Phase 3.
