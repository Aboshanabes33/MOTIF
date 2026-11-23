# Windows launch validation

The initial change incorrectly assumed appending .cmd made execFile support a Windows batch file. The patch now resolves recognized npm shims to their JavaScript entry and invokes Node with an argument array. It also checks for native .exe tools. It never executes arbitrary shim text, invokes cmd.exe or interpolates user arguments into a command string. Unrecognized batch launchers return setup guidance.

Mocked resolver and invocation tests pass locally. No actual Windows execution was available, so the required platform smoke is still unverified. Run on a supported Node/Windows runner with real npm, Codex and Claude launchers before treating #34 as complete.
