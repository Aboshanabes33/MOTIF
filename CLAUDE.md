@AGENTS.md

<!--
For maintainers. Claude Code strips this comment before loading the file, so it costs no context.

Claude Code loads this file at the start of every session. The first line imports AGENTS.md,
which holds the rules shared by every coding agent, so the two files cannot drift apart. Put
shared rules in AGENTS.md and keep only Claude Code specifics below.

Do not remove the import line: by default, when a repository has both files, Claude Code reads
CLAUDE.md and skips AGENTS.md. To confirm both loaded, run /context all in a session and look
under "Memory files".

product-brif.md is deliberately not imported. At about 500 lines it would crowd every session,
and AGENTS.md already tells agents when to read it.
-->

## Claude Code

- Use plan mode for anything architectural: a new app or package, the backend, auth, the
  database, the agent runtime, the media pipeline, or a new dependency. Present the plan and
  wait for the owner's approval before you edit files.
- Other agents work on this repository too, and they cannot see your auto memory. When the owner
  makes a decision or corrects a rule, write it into `AGENTS.md` or `docs/` as well.
