# Motif 0.1.0 (v2)

Revision of the first spec. Changes: the AI runs through a relay to the official command-line agents (no local MCP server), session options are locked, and the only thing the user selects is a Brand.

Vocabulary follows CONTEXT.md: **Brand**, **Style**, **Reference Video**, **Source Video**, **Edit Request**, **Result**.

## Problem Statement

Agencies and social media managers who run several client brands spend most of their editing time re-applying each client's visual identity to every video: the same colors, fonts, logo placement, caption look, and motion feel, over and over. Existing AI video tools either target one generic look, require a technical workflow (code, terminals, agent harness settings), or bill the agency again for AI usage on top of the AI subscriptions it already pays for. Arabic-speaking teams in the Gulf are additionally underserved: Arabic captions and Arabic-first workflows are weak or missing.

## Solution

Motif is a desktop app. The user keeps one **Brand** per client, uploads a **Source Video**, and types an **Edit Request** such as "add motion graphics to this video" or "cut this down and add captions". An AI agent edits the video (cuts, captions, titles, lower-thirds, transitions, motion graphics) using the chosen Brand, renders it with HyperFrames, and shows the **Result** next to a timeline. The user keeps refining by typing in a text box or by adjusting the timeline by hand. The agent respects manual changes.

Motif runs the AI through the user's own subscription as a relay: the user's message goes from the app to the Claude Code or Codex command-line agent running in the background, and the agent's reply comes back to the app. No local MCP server sits between them. Session options (model, permissions, and similar) are locked, so the only thing the user chooses is the Brand. Motif does not read, copy, or store subscription tokens.

## User Stories

### Setup and AI access

1. As a first-time user, I want a first-run screen that explains in plain words how to connect an AI account, so that I am not confused by developer terms.
2. As a user with a Claude subscription, I want Motif to detect whether the official Claude command-line tool is installed and signed in, so that I know whether I can use my subscription.
3. As a user with a Claude subscription who is not signed in, I want a button that starts the official Claude sign-in, so that I do not have to open a terminal.
4. As a user with a ChatGPT subscription, I want the same detect, sign-in, and test flow for the official Codex command-line tool, so that I can use my ChatGPT plan.
5. As a user, I want Motif to run a short test request after connection and tell me plainly whether it worked, so that I do not discover a broken setup in the middle of an edit.
6. As a user without either subscription, I want to paste a DeepSeek API key, or another provider's API key, so that I can still use Motif.
7. As a user, I want a notice that subscription access in third-party apps is still experimental and that the provider's terms may change, so that I can decide with full information.
8. As a user, I want Motif to never copy or display my subscription tokens, so that my account stays safe.
9. As a user, I want to see which AI account is currently active and switch between them, so that I can control cost and quality.
10. As a user, I want a clear message when my subscription limit is reached, with an offer to switch to another connected account, so that I am not stuck.
11. As an agency owner, I want each team member to sign in with their own account, so that no one shares a subscription.

### Brands

12. As an agency user, I want to create a Brand for each client, so that every video for that client looks consistent.
13. As a user, I want to give a Brand a name, logo, colors, fonts, motion style, and caption look, so that the agent has a complete identity to apply.
14. As a user, I want to create a Brand by pasting a client's website address, so that Motif proposes colors, fonts, and style automatically and I only correct them.
15. As a user, I want to create a Brand from a **Reference Video** I like, so that Motif extracts its typography, references, and motion feel into the Brand.
16. As a user, I want to review and edit everything Motif extracted before saving the Brand, so that mistakes do not spread to every video.
17. As a user, I want to see a live preview of how the Brand looks (title, caption, lower-third) before using it, so that I can judge it quickly.
18. As a user, I want to duplicate and rename a Brand, so that I can make a variation for the same client.
19. As a user, I want each Brand to be its own workspace with its own videos and edit history, so that one client's material never mixes with another's.
20. As an agency owner, I want to archive a Brand when a client leaves, so that the list stays clean without losing the work.
21. As a user, I want to switch Brands quickly from the sidebar, so that I can move between clients during a busy day.

### Session simplicity and relay

22. As a user, I want to choose only a Brand when I start an edit, with no other session options, so that starting is simple.
23. As a user, I want the model, permissions, and similar options fixed by Motif, so that I never configure anything technical.
24. As the product developer, I want Style to be an internal concept in 0.1.0 driven by the Brand's motion style, so that a user-selectable Style can be added later without redesign.
25. As a user, I want the AI's reply to appear in the same conversation where I sent my request, so that the exchange feels like a normal chat.
26. As a user, I want follow-up messages to keep the context of earlier ones even though each background run starts fresh, so that I never repeat myself.
27. As a user, I want a clear message when the background agent is not signed in, has reached its limit, or cannot start, with the reason and the next step, so that I am never left waiting on a silent failure.

### Editing a video

28. As a user, I want to upload a Source Video by dragging it into Motif, so that starting is effortless.
29. As a user, I want Motif to accept common video formats and warn me clearly when it cannot, so that I know what to fix.
30. As a user, I want to type an Edit Request in plain Arabic or English, so that I can describe the edit naturally.
31. As a user, I want to ask for motion graphics only (titles, lower-thirds, animated elements) over my existing video, so that I get quick polish without recutting.
32. As a user, I want to ask for a normal edit (cut silences, trim, reorder, add captions, add transitions), so that I get a finished cut.
33. As a user, I want to combine both in one Edit Request, so that I do not need two passes.
34. As a user, I want to see a plain status (started, working, finished) while the agent runs, so that I know it has not stalled, without seeing tool calls.
35. As an advanced user, I want an optional switch to show full technical details, so that I can debug when something fails.
36. As a user, I want to cancel a running edit at any time, so that I do not wait for something I no longer want.
37. As a user, I want my Source Video to never be modified, so that I can always start over.
38. As a user, I want to handle several videos in the same Brand without losing earlier ones, so that a client's whole campaign stays together.

### Arabic

39. As an Arabic-speaking user, I want captions generated from Arabic speech, so that I do not type them by hand.
40. As an Arabic-speaking user, I want captions and titles to render correctly right-to-left with proper letter joining, so that the text looks professional.
41. As an Arabic-speaking user, I want to correct caption text before the final render, so that transcription mistakes do not ship.
42. As a user mixing Arabic and English in one video, I want each caption to take the correct direction, so that mixed lines are readable.
43. As a Gulf agency, I want Arabic fonts in the Brand to be respected in every caption and title, so that the client's identity holds in Arabic.

### Result and timeline

44. As a user, I want the finished Result to open automatically beside the agent conversation, so that I can review it at once.
45. As a user, I want the HyperFrames timeline shown with the Result, so that I can see every cut, title, and animation as editable pieces.
46. As a user, I want to edit the timeline by hand (move, trim, delete, retime), so that I can fix small things without asking.
47. As a user, I want to type a follow-up in the text box ("make the title bigger", "change the transition"), so that I can refine the Result in words.
48. As a user, I want the agent to read my manual timeline changes before applying a follow-up, so that it builds on my work and never overwrites it.
49. As a user, I want every change saved as a version I can return to, so that a bad edit never costs me progress.
50. As a user, I want to compare two versions, so that I can decide which to keep.
51. As a user, I want to export the Result as a video file in common sizes (for example 9:16, 1:1, 16:9), so that I can publish to each platform.
52. As a user, I want the export to be deterministic, so that re-exporting the same version gives the same video.
53. As a user, I want the project files saved in my Brand's folder, so that I can find, back up, or share them.

### Safety and simplicity

54. As a non-technical user, I want the app to ask me no permission questions about files or commands, so that I am never interrupted by developer prompts.
55. As a user, I want the agent to only read and write inside the current Brand's folder, so that my other files are safe.
56. As a user, I want no developer features (terminal, plugin store, automation tasks, code tools) visible, so that the app feels made for editors.
57. As a user, I want clear, actionable error messages (for example "HyperFrames could not render this video, try a shorter clip"), so that I know my next step.
58. As the product developer, I want internal tools (shell, FFmpeg, HyperFrames command line) available to the agent but hidden from the interface, so that the agent can do its work without exposing complexity.

### Language and product

59. As an English-speaking user, I want the interface in English, so that I can use the product at launch.
60. As the product developer, I want Arabic interface support planned for a later release, so that the first version ships sooner.
61. As a user, I want the app named Motif with its own logo everywhere, so that it does not look like another product.

## Implementation Decisions

- **Product shape.** A desktop application, forked from the existing agent harness, reusing its session, workspace, and agent-composition machinery. Features are removed from the product by disabling their registrations first and deleting code later.
- **Workspace equals Brand.** One workspace per Brand, mapping to one folder on disk. Sessions inside it are edits for that Brand.
- **Brand model.** A Brand holds: name, logo, colors, fonts, motion style, caption look. It is created manually, by extraction from a website address, or by extraction from a Reference Video. Extraction always produces a proposal the user reviews.
- **Style (deferred).** In 0.1.0 there is one built-in editing approach, shaped by the Brand's motion style, and the user does not select a Style. The harness's agent-preset concept is kept as the future home of developer-authored, user-selectable Styles.
- **Locked session options.** Model, permission mode, and other session settings are fixed by Motif and hidden. The only user choice at session start is the Brand.
- **Editing engine.** The agent writes HyperFrames compositions (HTML, CSS, and animation) and renders them with HyperFrames. FFmpeg handles cutting and merging. All rendering is local. The HyperFrames timeline editor is opened beside the agent conversation when a Result is ready.
- **Relay to command-line agents.** Each Edit Request is sent as one self-contained task to the Claude Code or Codex agent in the background, running in the Brand's folder, and the agent's final answer returns to the app. Delegation reuses the harness's existing one-shot Claude Code and Codex subagent providers. No local MCP server is used.
- **Task content.** Because each run is a fresh session, every task carries what the agent needs: the Edit Request, the Brand, the current timeline state read from disk (including manual changes), a summary of the conversation so far, and the HyperFrames skills.
- **Progress display.** The relay returns only the final answer, so progress is coarse (started, running, finished). Fine-grained step summaries are out of scope until a streaming path exists.
- **Fallback backend.** An API-key provider (DeepSeek by default) runs inside the harness's own agent loop. It is used only when the user chooses it or when the relay cannot run, and the app always says which backend is active. It never switches silently.
- **Authentication.** The command-line agents use their own native sign-in, which stays authoritative. The providers remove credential-shaped variables from the child environment and use a platform-pinned runtime that never falls back to an installed `claude` executable. Whether that runtime shares the sign-in of the user's installed command-line tool must be verified in the first task.
- **Credentials.** Subscription sign-in is performed by the official command-line tools. Motif never reads or stores subscription tokens. An experimental token-import path and a direct in-app ChatGPT sign-in are out of scope for 0.1.0.
- **Connection flow.** Detect the agent, guide sign-in through the official tool, run a test request, and report the result. A visible notice states that provider terms for third-party use of subscriptions may change.
- **Provider policy.** Third-party use of subscriptions is unsettled for both providers. The product must not market subscription access as approved. The official OpenAI sign-in program requires an approved client and forbids charging for plan usage, so it is deferred.
- **Details switch.** Technical details of the fallback backend's tool calls are hidden by default, with an advanced setting to reveal them.
- **Permissions.** Fixed at workspace-write with no approval prompts. The agent may use the shell and FFmpeg inside the Brand's folder only.
- **Manual edits.** Before each follow-up, the agent reads the current timeline state from disk. Each change is saved as a version.
- **Arabic captions.** Included from day one: Arabic speech to text, right-to-left rendering with correct shaping in the composition, a review step before the final render, and Brand font support.
- **Interface language.** English only in 0.1.0. The Arabic interface (dictionaries across all packages and layout direction) is planned for 0.2.0.
- **Disabled or hidden for non-technical users.** The plugin manager and its sidebar entry and settings tab (its relocated settings cards must be kept reachable or intentionally dropped), the automation tasks page, the terminal, open-in-IDE, git change tracking, agent teams, planning and goals, and developer-oriented defaults. The file preview and the side browser stay.
- **Settings that must move.** The agent-loop, shell, subagent, and web-search settings currently live inside the plugin manager page. Decide per setting: relocate, hide, or drop.
- **Rebranding.** Name, window title, logo, favicon and icons, desktop packaging identity, display strings, and the agent's identity text change to Motif and to a video-editing role.
- **Seams.** Two test seams only (see Testing Decisions).

## Testing Decisions

- **A good test** checks externally visible behavior only: what the user sees and what files and renders result. It never asserts on internal calls or file layout.
- **Seam 1 (primary).** A recorded-session replay through the shipped Motif profile, using the repository's existing keyless session snapshot mechanism. Input: a Source Video, an Edit Request, and a Brand. Output: the saved timeline files, the Result, the coarse progress states, and version history. HyperFrames, FFmpeg, and the command-line agents are replaced by recordable stand-ins; the stand-in agent returns only a final answer, like the real one. Cases: motion graphics only, normal edit, combined request, follow-up after a manual timeline change (the task sent to the agent must contain the manual change), a follow-up whose context comes only from the conversation summary, Arabic caption request, cancellation, and a failed render with an actionable error.
- **Seam 2.** The authorization seam for AI access: detect, sign in, test, and failure states for Claude, Codex, and API keys. It follows the existing tests for model-provider sign-in. No test may read or write real tokens.
- **Prior art.** The repository's snapshot cases and its model-provider login tests.
- **Not covered by automated tests.** Real sign-in with each provider, Arabic transcription accuracy, and visual quality of rendered videos. These get manual checks before release.

## Out of Scope

- Arabic interface and right-to-left layout of the app itself (0.2.0).
- A user-selectable Style, and a library of Styles (after 0.1.0).
- Streaming, step-by-step progress from the command-line agents, and continuing one agent session across messages.
- A local MCP server for communication between the app and the agents.
- Smart AI cutting that picks the best moments automatically (0.2.0).
- Importing subscription tokens from files on the user's computer.
- Direct in-app ChatGPT sign-in through OpenAI's open-source sign-in flow (planned for 0.2.0 while Motif stays free; commercial eligibility is unconfirmed and must be re-checked if Motif becomes paid).
- Cloud rendering, team accounts, shared Brand libraries, and billing.
- A marketplace for Styles or plugins.
- Mobile apps.
- Deleting disabled developer packages from the codebase (a later cleanup).

## Further Notes

- Anthropic's third-party subscription terms are in flux: its documentation forbids offering claude.ai sign-in in third-party products without prior approval, while a support article describes a monthly credit for third-party apps that authenticate through the official tooling. The background command-line approach lowers risk but does not make it approved.
- Whether the repository's license and brand guidelines permit a commercial rebrand has not been checked. The owner chose not to review them.
- HyperFrames is open source (Apache 2.0). Its desktop app is free with a paid tier for hosted models, which Motif does not depend on.
- The existing one-shot providers return only a final answer and run unattended, so interactive prompts from the agent are impossible; the product must design around that.
- Motif is currently free. OpenAI's open-source sign-in flow registers the app dynamically (no secret, no partner key) and fits a local desktop app, but OpenAI's terms forbid requiring payment for plan usage.
- A prompt for an earlier approach (enabling ChatGPT OAuth inside the model adapter) was written and is superseded for 0.1.0 by the command-line approach. It can be reused later if OpenAI approves a client.
