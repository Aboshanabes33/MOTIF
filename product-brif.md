# MOTIF 0.1.0 — Engineering Implementation Brief

You are the Lead Software Architect and Senior Full-Stack Engineer responsible for transforming the existing MOTIF web demo into a production-ready application.

Your task is to evolve the existing project, preserve its current UI and design direction, and implement the technical architecture defined below.

This is an engineering task, not a redesign task.

## 1. Critical Instructions

Before writing or modifying code:

1. Inspect the entire existing repository.
2. Understand the current application structure, framework, dependencies, routes, components, and existing integrations.
3. Inspect `package.json`, environment configuration, and existing Supabase setup.
4. Identify reusable components and existing functionality.
5. Create an implementation plan based on the actual codebase.
6. Identify architectural problems and technical risks.

Do not replace working code without a clear technical reason.

Do not redesign the existing interface.

Do not invent additional product features.

Do not install unnecessary dependencies.

Do not expose API keys, OAuth tokens, service-role credentials, or other secrets in frontend code.

Preserve the existing visual design and user experience as the source of truth.

## 2. Product Context

MOTIF is an AI-powered creative workflow application designed for professional video editors, motion designers, marketers, and creative teams.

Its core value is simplifying complex AI-powered creative workflows.

Users should not need to manually manage complicated prompts, AI skills, model configurations, and separate tools.

MOTIF provides a unified environment for:

- Brand intelligence.
- Creative reference analysis.
- Video workflows.
- AI-assisted creative production.
- Project context management.
- AI agent interaction inside the editor.

The product should prioritize usability, simplicity, and professional workflows.

## 3. Architecture Decisions

### Frontend

- React
- Vite
- TypeScript
- Tailwind CSS
- Zustand for client-side state management.
- TanStack Query for server state.
- Zod for validation.

Preserve the existing frontend if it already uses a compatible stack.

### Backend

- Node.js
- Hono
- @hono/node-server

The backend will handle:

- Authentication verification.
- Authorization.
- Agent sessions.
- AI provider integrations.
- Streaming responses.
- Project operations.
- Secure API endpoints.

Keep backend logic separate from React components.

### Authentication and Database

Authentication and membership:
- Whop.

Database:
- Supabase PostgreSQL.

Whop is responsible for user identity and membership.

Supabase stores:
- User profiles.
- Onboarding information.
- User preferences.
- Brand profiles.
- Project metadata.
- Application settings.

Use a stable Whop user identifier as the external identity reference.

Do not assume Whop tokens are automatically compatible with Supabase Auth or Supabase RLS.

Verify Whop authentication server-side.

Design a secure session strategy between the application backend and Supabase.

Never expose the Supabase service-role key in frontend code.

Implement appropriate database policies and ownership checks.

### Database Structure

Start with a clean, scalable schema for:

- profiles
- brands
- projects
- user_preferences
- onboarding_progress

Use migrations rather than manually changing production database schemas.

Add indexes and foreign keys where appropriate.

Use JSONB only for genuinely flexible structured data, not as a replacement for relational modeling.

## 4. AI Agent Architecture

Primary agent runtime:

Pi SDK.

Package:
@earendil-works/pi-coding-agent

Documentation:
https://docs.pi.dev/latest/sdk

Pi must run in a compatible server-side Node.js runtime, not directly inside the browser.

Create an independent MOTIF Agent abstraction layer.

Responsibilities:

- Session management.
- Conversation history.
- Streaming events.
- Tool execution.
- Model selection.
- Provider selection.
- Project context.
- Skill loading.
- Error handling.

The MOTIF application must not become tightly coupled to Pi's internal implementation.

Use adapters and interfaces so the underlying agent runtime can evolve later.

### Hybrid Runtime Strategy

Web:
- Run the agent through the backend runtime.
- Keep provider credentials isolated per user.
- Support server-side agent sessions.

Future Electron:
- Support local agent execution.
- Enable access to local files.
- Enable local media processing.
- Reuse the same MOTIF Core and agent interfaces.

Do not implement Electron prematurely.

Prepare architecture boundaries that make future integration straightforward.

## 5. AI Provider Authentication

Support both authentication approaches where officially supported:

1. OAuth/account-based authentication.
2. API-key authentication.

Potential providers:

- OpenAI / Codex.
- Anthropic / Claude.
- OpenCode-supported providers.
- OpenRouter.
- Additional providers supported by Pi.

Create a provider abstraction layer.

Each provider must declare its supported authentication methods and available models.

Do not assume that a consumer subscription automatically grants API access.

Respect official provider authentication mechanisms, usage restrictions, and billing rules.

Security requirements:

- Encrypt server-side credentials at rest.
- Isolate credentials between users.
- Never expose secrets to the frontend.
- For future Electron support, use the operating system's secure credential storage.
- Implement token revocation and disconnect flows.
- Never use shared provider credential files between users.

## 6. Media Processing Architecture

Use the following technologies:

### FFmpeg

https://ffmpeg.org

Responsibilities:
- Video transcoding.
- Audio extraction.
- Trimming.
- Media conversion.
- Rendering support.
- FFprobe metadata inspection.

Keep media processing behind a dedicated service interface.

### Mediabunny

https://mediabunny.dev

Use for browser-compatible media operations where appropriate.

Responsibilities:
- Media metadata inspection.
- Browser-based media handling.
- Frame extraction.
- WebCodecs integration where supported.

Do not force all processing into the browser.

### Whisper.cpp

https://github.com/ggml-org/whisper.cpp

Use for speech-to-text transcription.

Responsibilities:
- Audio transcription.
- Subtitle generation.
- Transcript extraction.
- Timestamped segments.

Evaluate model size and memory requirements before selecting a default configuration.

### HyperFrames

https://github.com/heygen-com/hyperframes

Use as the rendering foundation for HTML/CSS-based motion graphics and video compositions.

Do not build an entire rendering engine from scratch.

Verify compatibility, API stability, licensing, and integration requirements before committing to implementation.

## 7. MOTIF Core

This is the most important proprietary application layer.

Create clear modules for:

### Brand Intelligence
- Brand profiles.
- Brand guidelines.
- Colors.
- Typography.
- Visual identity.
- Brand-specific creative context.

### Reference Analysis
- Reference video ingestion.
- Frame extraction.
- Visual analysis.
- Transcription where relevant.
- Structured reference information.

### Project Management
- Project metadata.
- Project-specific context.
- Assets and references.
- Project state.

### Creative Agent Tools

Prepare structured tools such as:

- analyze_reference
- extract_brand_identity
- transcribe_video
- inspect_project
- create_edit_plan
- generate_composition
- render_preview
- export_video

These tools must have validated inputs and outputs.

The agent should produce structured execution plans rather than directly manipulating arbitrary files.

All file operations must be restricted to authorized project directories.

Require user confirmation before destructive operations or final exports that overwrite existing files.

## 8. Project Structure

Use a modular architecture.

A suggested structure:

motif/
├── apps/
│   ├── web/
│   └── api/
│
├── packages/
│   ├── ui/
│   ├── shared/
│   ├── core/
│   ├── agent-core/
│   ├── agent-pi/
│   ├── providers/
│   ├── brand-intelligence/
│   ├── reference-analysis/
│   ├── media-engine/
│   ├── project-manager/
│   └── rendering/
│
├── supabase/
│   └── migrations/
│
├── skills/
│   ├── brand-analysis/
│   ├── reference-analysis/
│   └── video-editing/
│
├── package.json
└── pnpm-workspace.yaml

This is a proposed structure, not a requirement to restructure the entire repository immediately.

Adapt it to the existing project and migrate incrementally.

Use pnpm workspaces if a monorepo is justified by the current repository structure.

## 9. Security and Reliability

Implement:

- Authentication middleware.
- User ownership verification.
- Input validation.
- Secure file handling.
- File size restrictions.
- Safe subprocess execution.
- Rate limiting for expensive operations.
- Error boundaries.
- Structured logging.
- Streaming cancellation.
- Agent execution timeouts.
- Isolated user sessions.

Do not trust user-provided file paths.

Do not allow arbitrary shell commands from agent tools.

Never send private brand documents or media to external AI providers without the user's informed consent and the appropriate provider configuration.

## 10. Development Strategy

Work incrementally.

### Phase 1 — Repository Audit
- Inspect the existing project.
- Identify current architecture.
- Identify missing dependencies.
- Document technical debt.
- Produce an implementation plan.

### Phase 2 — Backend Foundation
- Set up Hono.
- Establish API conventions.
- Configure secure environment variables.
- Integrate Whop verification.
- Connect Supabase.
- Implement user data ownership.

### Phase 3 — Agent Foundation
- Integrate Pi SDK.
- Create MOTIF Agent abstraction.
- Implement sessions.
- Implement streaming.
- Add provider adapters.
- Test one provider end-to-end.

### Phase 4 — Creative Intelligence
- Implement brand context.
- Implement project context.
- Implement reference analysis interfaces.
- Create validated agent tools.

### Phase 5 — Media Pipeline
- Integrate FFmpeg.
- Integrate Whisper.cpp.
- Integrate Mediabunny where needed.
- Integrate HyperFrames.
- Test actual media workflows.

### Phase 6 — Production Readiness
- Test authentication.
- Test authorization.
- Test provider isolation.
- Test streaming.
- Test media processing.
- Test error handling.
- Review performance and security.

## 11. Testing Requirements

Do not consider a feature complete merely because the UI renders.

Implement meaningful tests for:

- Authentication and session verification.
- Database ownership and RLS.
- Provider authentication.
- Agent session isolation.
- Tool input validation.
- Media processing.
- Transcription.
- Rendering.
- API error handling.

Use realistic test fixtures and small sample media files.

## 12. Licensing Requirements

Before adopting any dependency:

- Verify its current license.
- Verify commercial-use permissions.
- Review transitive dependencies when relevant.
- Document licenses.
- Check FFmpeg build configuration and codec licensing implications.

Do not assume that every open-source project permits unrestricted commercial redistribution.

## 13. Working Rules

You must follow these rules throughout implementation:

1. Inspect before modifying.
2. Preserve the existing design.
3. Avoid unnecessary rewrites.
4. Keep modules independent.
5. Prefer stable, maintained open-source libraries.
6. Avoid unnecessary infrastructure costs.
7. Do not introduce VPS or cloud media-processing costs without explicit justification.
8. Keep the application Web-first.
9. Prepare for Electron without implementing it prematurely.
10. Document important architectural decisions.

Do not implement everything in one massive operation.

After each phase:
- Run the relevant tests.
- Check TypeScript errors.
- Check build output.
- Report completed work.
- Report remaining blockers.

## 14. First Deliverable

Your first task is NOT to start coding.

Produce:

1. Repository audit.
2. Current architecture map.
3. Dependency inventory.
4. Recommended project structure based on the actual codebase.
5. Security risk assessment.
6. Implementation roadmap.
7. Exact list of packages to install, with reasons.
8. Identification of anything that should NOT be installed yet.

Wait for approval before performing large architectural changes.

The goal is to turn the existing MOTIF demo into a maintainable, secure, production-ready creative application without sacrificing the current design or introducing unnecessary complexity.
