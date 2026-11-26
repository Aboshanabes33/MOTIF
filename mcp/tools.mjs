/**
 * MOTIF MCP Tool, Resource, and Prompt Registry.
 * Shared between stdio MCP server (mcp/motif-mcp.mjs) and HTTP inspector (/api/mcp/*).
 */

import {
  editingStatus,
  clipPlan,
  stagePlan,
  runStage,
  agentBrief,
  readStack,
  readSkill,
  readStackDoc,
  stackDocs,
  stackBundle,
} from "../server/video-agent.mjs";

export const MCP_SERVER_INFO = {
  name: "motif",
  version: "2.0.0",
};

export const MCP_TOOLS = [
  {
    name: "motif_status",
    description:
      "Return the current MOTIF desktop workspace status, data paths, and counts of brands, projects, footage clips, and voice notes.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "list_brands",
    description:
      "List all saved Brands in MOTIF (from prefs.json). Returns each brand's id, name, tagline, hex color palette, target audience, voice/tone, channels, notes, and whether a logo is uploaded.",
    inputSchema: {
      type: "object",
      properties: {
        includeLogo: {
          type: "boolean",
          description: "If true, include base64 logo data URLs (omitted by default to keep responses compact).",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_brand",
    description:
      "Get complete details of a single Brand in MOTIF by its id or name (supports Arabic and English partial matching).",
    inputSchema: {
      type: "object",
      properties: {
        brand: {
          type: "string",
          description: "Brand id (e.g. b_qafila01) or brand name.",
        },
        includeLogo: {
          type: "boolean",
          description: "Include base64 logo data URL if present.",
        },
      },
      required: ["brand"],
      additionalProperties: false,
    },
  },
  {
    name: "get_brand_guidelines",
    description:
      "Compile a ready-to-use creative brief and brand guidelines package for a Brand (voice, palette, audience, channels, notes, recent projects, and recent voice notes).",
    inputSchema: {
      type: "object",
      properties: {
        brand: {
          type: "string",
          description: "Brand id or brand name.",
        },
      },
      required: ["brand"],
      additionalProperties: false,
    },
  },
  {
    name: "create_brand",
    description:
      "Create a new Brand in MOTIF and persist it to prefs.json. The desktop UI refreshes automatically.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Brand display name (required)." },
        tagline: { type: "string", description: "Short brand tagline or positioning line." },
        colors: {
          type: "array",
          items: { type: "string" },
          maxItems: 4,
          description: "Up to 4 hex colors (e.g. ['#2f7268', '#9fd8cd']).",
        },
        audience: { type: "string", description: "Target audience description." },
        voice: { type: "string", description: "Brand voice and tone guidelines." },
        channels: { type: "string", description: "Primary publishing channels (e.g. YouTube, Instagram Reels)." },
        notes: { type: "string", description: "Creative notes, typography rules, pacing, do/don't guidance." },
        logo: { type: "string", description: "Optional base64 image data URL (<= 2 MB)." },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "update_brand",
    description: "Update fields on an existing MOTIF Brand by id.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Brand id to update." },
        name: { type: "string" },
        tagline: { type: "string" },
        colors: { type: "array", items: { type: "string" }, maxItems: 4 },
        audience: { type: "string" },
        voice: { type: "string" },
        channels: { type: "string" },
        notes: { type: "string" },
        logo: { type: "string" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_brand",
    description: "Delete a Brand from MOTIF prefs.json by id.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Brand id to remove." },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_projects",
    description:
      "List video projects in MOTIF, optionally filtered by brandId, status (preparing/editing/rendering/exported/approved), or search query.",
    inputSchema: {
      type: "object",
      properties: {
        brandId: { type: "string", description: "Filter by linked brand id." },
        status: {
          type: "string",
          enum: ["preparing", "editing", "rendering", "exported", "approved", "slim"],
        },
        query: { type: "string", description: "Optional substring search." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_project",
    description: "Get full metadata for a specific project by id, folder slug, or name, along with its linked brand and voice notes.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project id, folder name, or title." },
      },
      required: ["project"],
      additionalProperties: false,
    },
  },
  {
    name: "create_project",
    description: "Create a new video project in MOTIF and optionally link it to a Brand.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project title (required)." },
        brandId: { type: "string", description: "Optional brand id or name to attach." },
        aspect: { type: "string", enum: ["9:16", "16:9", "1:1"], description: "Video aspect ratio." },
        status: {
          type: "string",
          enum: ["preparing", "editing", "rendering", "exported", "approved"],
        },
        summary: { type: "string", description: "Brief description of the video." },
        notes: { type: "string", description: "Production notes or edit brief." },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "update_project",
    description: "Update a project's status, progress, brand link, summary, or notes.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Project id or folder slug." },
        name: { type: "string" },
        brandId: { type: "string" },
        status: { type: "string", enum: ["preparing", "editing", "rendering", "exported", "approved", "slim"] },
        progress: { type: "number", minimum: 0, maximum: 100 },
        summary: { type: "string" },
        notes: { type: "string" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_footage",
    description: "List raw footage and audio clips registered in the MOTIF workspace.",
    inputSchema: {
      type: "object",
      properties: {
        brandId: { type: "string" },
        projectId: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "add_footage",
    description: "Register a local video, audio, or image footage asset in the MOTIF workspace.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Clip filename or title." },
        kind: { type: "string", enum: ["video", "audio", "image"] },
        filePath: { type: "string", description: "Optional local file path." },
        resolution: { type: "string", description: "e.g. 3840x2160 or 1080x1920." },
        durationSec: { type: "number" },
        fps: { type: "number" },
        colorProfile: { type: "string", description: "e.g. D-Log M, Rec.709, sRGB." },
        brandId: { type: "string" },
        projectId: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "list_voice_notes",
    description: "List saved voice notes and their transcripts so the agent can act on spoken creative direction.",
    inputSchema: {
      type: "object",
      properties: {
        brandId: { type: "string" },
        projectId: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "create_voice_note",
    description: "Save a brief or transcribed voice note linked to a brand or project.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        transcript: { type: "string", description: "Text content or transcript of the note." },
        brandId: { type: "string" },
        projectId: { type: "string" },
        durationSec: { type: "number" },
      },
      required: ["transcript"],
      additionalProperties: false,
    },
  },
  {
    name: "search_workspace",
    description: "Search across all MOTIF brands, video projects, footage assets, and voice notes.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term in English or Arabic." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "video_edit_status",
    description:
      "The MOTIF video agent stack (video-edit skill): readiness of the editing home, saved identity (colors/font/style), motion engine, and every clip folder with what each one already has (source, cut, caps, scenes, render, srt). Call this first for any video-editing request.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "video_edit_plan",
    description:
      "Ordered pipeline for one clip from the video-edit stack: stages, the exact commands to run (with the real work folder), the validators, and the doc to read per stage. Modes: quick (cut+captions), light (+zoom+sfx), full (+scenes).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Clip name — becomes ~/Documents/video-edit/projects/<name>." },
        mode: { type: "string", enum: ["quick", "light", "full"], description: "Editing depth. Default full." },
        frame: { type: "string", enum: ["tall", "wide", "square"], description: "Output frame. Default tall (9:16)." },
        source: { type: "string", description: "Optional source video path to copy into the work folder." },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "video_edit_stage",
    description:
      "Commands and validators for one pipeline stage (setup, start, source, cut, transcribe, captions, script_review, cutzoom, scenes, sfx, render, master, srt, verify, deliver, ledger_board, studio), filled with the clip's real work folder.",
    inputSchema: {
      type: "object",
      properties: {
        stage: {
          type: "string",
          description: "Stage id, e.g. cut, transcribe, captions, scenes, sfx, render, verify.",
        },
        work: { type: "string", description: "Absolute work folder (…/projects/<name>)." },
        name: { type: "string", description: "Optional clip name for delivery/ledger commands." },
        mode: { type: "string", enum: ["quick", "light", "full"] },
      },
      required: ["stage", "work"],
      additionalProperties: false,
    },
  },
  {
    name: "video_stack",
    description:
      "The whole video-edit stack the local agent runs on, served from inside MOTIF: the manifest (modes, 17 stages with commands/validators, frames, styles, red lines), SKILL.md, and every reference/style doc. Call this with includeDocs=false first, then video_stack_doc for the doc a stage needs.",
    inputSchema: {
      type: "object",
      properties: {
        includeDocs: {
          type: "boolean",
          description: "Include the full text of every reference/style doc (larger payload). Default false = manifest + SKILL.md + the doc index.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "video_stack_doc",
    description:
      "Read one doc from the stack: SKILL.md, or a reference/style id from the manifest (onboarding, rules, scenes, sfx, generated-images, light-engine, ideas, simple, collage).",
    inputSchema: {
      type: "object",
      properties: {
        doc: { type: "string", description: "Doc id or relative path, e.g. rules, scenes, simple, styles/collage/STYLE.md." },
      },
      required: ["doc"],
      additionalProperties: false,
    },
  },
  {
    name: "video_edit_run",
    description:
      "Run one gated editing step in the clip's work folder and return its full output and exit status (setup/cut/transcribe/captions/cut-zoom/sfx/audit/preflight). Exit 3 from an auditor means the pipeline is refused — fix before rendering.",
    inputSchema: {
      type: "object",
      properties: {
        stage: { type: "string", enum: ["setup", "cut", "transcribe", "captions", "cutzoom", "sfx", "render"] },
        work: { type: "string", description: "Absolute work folder (…/projects/<name>)." },
        name: { type: "string" },
        mode: { type: "string", enum: ["quick", "light", "full"] },
      },
      required: ["stage", "work"],
      additionalProperties: false,
    },
  },
];

export const MCP_PROMPTS = [
  {
    name: "brand_brief",
    description: "Build a tailored creative brief and video script outline using a saved MOTIF Brand.",
    arguments: [
      {
        name: "brand",
        description: "Brand id or name from MOTIF",
        required: true,
      },
      {
        name: "topic",
        description: "Optional topic or campaign angle",
        required: false,
      },
    ],
  },
  {
    name: "workspace_review",
    description: "Review all active MOTIF projects, brands, and recent voice notes and propose next edits.",
    arguments: [],
  },
  {
    name: "video_stack_brief",
    description:
      "Give any agent the stack itself: the manifest summary, the stage order per mode, the command list, the validators, the red lines and where each doc lives — then the agent calls video_stack_doc for details.",
    arguments: [{ name: "mode", description: "quick | light | full (default full)", required: false }],
  },
  {
    name: "video_agent",
    description:
      "Hand the agent the video-edit stack brief: the pipeline, the clip's current state, the active brand, and the red lines. Run before editing any clip.",
    arguments: [
      { name: "project", description: "Clip folder name from video_edit_status", required: false },
      { name: "brand", description: "Brand id or name for the identity", required: false },
    ],
  },
];

function stripBrandLogo(brand, includeLogo = false) {
  if (!brand) return null;
  const { logo, ...rest } = brand;
  return includeLogo
    ? { ...rest, hasLogo: Boolean(logo), logo }
    : { ...rest, hasLogo: Boolean(logo) };
}

export function listResources(store) {
  const brands = store.listBrands();
  const base = [
    {
      uri: "motif://workspace/summary",
      name: "MOTIF Workspace Summary",
      description: "Live overview of brands, projects, footage, and voice notes.",
      mimeType: "application/json",
    },
    {
      uri: "motif://brands",
      name: "All MOTIF Brands",
      description: "Complete list of saved brand identities in prefs.json.",
      mimeType: "application/json",
    },
    {
      uri: "motif://projects",
      name: "All MOTIF Projects",
      description: "List of video projects and render statuses.",
      mimeType: "application/json",
    },
    {
      uri: "motif://footage",
      name: "All MOTIF Footage",
      description: "Registered raw video/audio footage clips.",
      mimeType: "application/json",
    },
    {
      uri: "motif://voice-notes",
      name: "All MOTIF Voice Notes",
      description: "Recorded creative memos and transcripts.",
      mimeType: "application/json",
    },
    {
      uri: "motif://video/stack",
      name: "Video Agent Stack (video-edit)",
      description:
        "The stack the local MOTIF agent runs on: modes, stages, commands, validators, red lines and where identity/projects/engine live.",
      mimeType: "application/json",
    },
    {
      uri: "motif://video/projects",
      name: "Video Editing Clips",
      description: "Every clip folder in the editing home with its real on-disk artifacts.",
      mimeType: "application/json",
    },
    {
      uri: "motif://video/skill",
      name: "Video Stack — SKILL.md",
      description:
        "The full instruction set the local agent executes, exactly as shipped in video-edit/SKILL.md.",
      mimeType: "text/markdown",
    },
    {
      uri: "motif://video/bundle",
      name: "Video Stack — full bundle",
      description:
        "Everything at once: manifest + SKILL.md + every reference/style doc, so an agent can carry the whole stack in one read.",
      mimeType: "application/json",
    },
    ...stackDocs().map((doc) => ({
      uri: `motif://video/docs/${doc.id}`,
      name: `Video Stack — ${doc.id}`,
      description:
        doc.kind === "style"
          ? `Style doc listed by the stack manifest: ${doc.path}`
          : `Reference the stack manifest points at: ${doc.path}`,
      mimeType: "text/markdown",
    })),
  ];
  for (const b of brands) {
    base.push({
      uri: `motif://brands/${b.id}`,
      name: `Brand: ${b.name}`,
      description: b.tagline || `Brand identity guidelines for ${b.name}`,
      mimeType: "application/json",
    });
  }
  return base;
}

export function readResource(store, uri) {
  if (uri === "motif://workspace/summary") {
    const brands = store.listBrands().map((b) => stripBrandLogo(b, false));
    const projects = store.listProjects();
    const footage = store.listFootage();
    const voiceNotes = store.listVoiceNotes();
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(
        {
          server: MCP_SERVER_INFO,
          counts: {
            brands: brands.length,
            projects: projects.length,
            footage: footage.length,
            voiceNotes: voiceNotes.length,
          },
          brands,
          projects,
          footage,
          voiceNotes,
        },
        null,
        2,
      ),
    };
  }
  if (uri === "motif://brands") {
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(store.listBrands().map((b) => stripBrandLogo(b, false)), null, 2),
    };
  }
  if (uri.startsWith("motif://brands/")) {
    const id = uri.slice("motif://brands/".length);
    const guide = store.buildBrandGuidelines(id);
    if (!guide) {
      throw Object.assign(new Error(`Brand resource not found: ${uri}`), { code: -32002 });
    }
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(guide, null, 2),
    };
  }
  if (uri === "motif://projects") {
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(store.listProjects(), null, 2),
    };
  }
  if (uri === "motif://footage") {
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(store.listFootage(), null, 2),
    };
  }
  if (uri === "motif://voice-notes") {
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(store.listVoiceNotes(), null, 2),
    };
  }
  if (uri === "motif://video/stack") {
    const stack = readStack();
    const status = editingStatus();
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify({ stack, home: status.home, engine: status.engine, identityReady: status.profileReady }, null, 2),
    };
  }
  if (uri === "motif://video/projects") {
    const status = editingStatus();
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify({ home: status.home, projects: status.projects }, null, 2),
    };
  }
  if (uri === "motif://video/skill") {
    return { uri, mimeType: "text/markdown", text: readSkill() };
  }
  if (uri === "motif://video/bundle") {
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(stackBundle({ includeDocs: true }), null, 2),
    };
  }
  if (uri.startsWith("motif://video/docs/")) {
    const doc = readStackDoc(uri.slice("motif://video/docs/".length));
    return { uri, mimeType: "text/markdown", text: doc.text };
  }
  throw Object.assign(new Error(`Unknown resource URI: ${uri}`), { code: -32002 });
}

export function getPrompt(store, name, args = {}) {
  if (name === "brand_brief") {
    const guide = store.buildBrandGuidelines(args.brand);
    if (!guide) {
      throw Object.assign(new Error(`Brand not found: ${args.brand || "(empty)"}`), { code: -32602 });
    }
    const topicLine = args.topic ? `\nCampaign / Video Topic: ${args.topic}` : "";
    return {
      description: `Creative brief for ${guide.brand.name}`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are working inside MOTIF. Use the following official Brand identity from MOTIF to craft an on-brand video concept, visual palette plan, hook, and caption style:${topicLine}\n\n${guide.summary}\n\nRecent Projects:\n${JSON.stringify(guide.recentProjects, null, 2)}\n\nRecent Voice Notes:\n${JSON.stringify(guide.recentVoiceNotes, null, 2)}`,
          },
        },
      ],
    };
  }

  if (name === "workspace_review") {
    const brands = store.listBrands().map((b) => ({ id: b.id, name: b.name, tagline: b.tagline, colors: b.colors }));
    const projects = store.listProjects();
    const voiceNotes = store.listVoiceNotes();
    return {
      description: "MOTIF Workspace Review",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Review the current MOTIF workspace and suggest prioritized next actions.\n\nBrands (${brands.length}):\n${JSON.stringify(brands, null, 2)}\n\nProjects (${projects.length}):\n${JSON.stringify(projects, null, 2)}\n\nVoice Notes (${voiceNotes.length}):\n${JSON.stringify(voiceNotes, null, 2)}`,
          },
        },
      ],
    };
  }

  if (name === "video_stack_brief") {
    const stack = readStack();
    const mode = stack.modes[args.mode] ? args.mode : "full";
    const stageLines = stack.stages
      .map((st) => {
        const on = stack.modes[mode].stages.includes(st.id) ? "✓" : " ";
        return `${on} ${String(st.n).padStart(2, "0")} ${st.id} — ${st.title.en} — doc: ${st.doc}`;
      })
      .join("\n");
    const docIndex = stackDocs()
      .map((d) => `- ${d.id} (${d.kind}) → ${d.path}`)
      .join("\n");
    return {
      description: `video-edit stack brief (${mode})`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `MOTIF ships its video agent stack over MCP. Stack "${stack.name}" v${stack.version}; entrypoint ${stack.entrypoint} (read it with video_stack_doc({doc:"SKILL.md"}) or resource motif://video/skill).`,
              `Mode: ${mode} — ${stack.modes[mode].stages.length} stages.`,
              "",
              "Stages (✓ = in this mode):",
              stageLines,
              "",
              "Docs (read the one your stage names, before running it):",
              docIndex,
              "",
              "Red lines:",
              ...stack.redLines.map((r) => `- ${r.en}`),
              "",
              "Tools: video_edit_status → video_edit_plan → video_edit_stage → video_edit_run (gated, exit 3 = refused). The skill folder is read-only; user data lives in the editing home.",
            ].join("\n"),
          },
        },
      ],
    };
  }

  if (name === "video_agent") {
    const status = editingStatus();
    const project = args.project
      ? status.projects.find((p) => p.name === args.project || p.dir === args.project) || null
      : status.projects[0] || null;
    const brand = args.brand ? store.getBrand(args.brand) : null;
    return {
      description: `Video agent brief${project ? ` — ${project.name}` : ""}`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: agentBrief({ project, brand }),
          },
        },
      ],
    };
  }

  throw Object.assign(new Error(`Unknown prompt: ${name}`), { code: -32602 });
}

export function executeTool(store, name, args = {}, { source = "mcp" } = {}) {
  const safeArgs = args && typeof args === "object" ? args : {};

  switch (name) {
    case "motif_status": {
      const brands = store.listBrands();
      const projects = store.listProjects();
      const footage = store.listFootage();
      const voiceNotes = store.listVoiceNotes();
      return {
        app: "MOTIF",
        version: MCP_SERVER_INFO.version,
        paths: {
          dataDir: store.paths.dataDir,
          prefsFile: store.paths.prefsFile,
          projectsDir: store.paths.projectsDir,
        },
        counts: {
          brands: brands.length,
          projects: projects.length,
          footage: footage.length,
          voiceNotes: voiceNotes.length,
        },
        brandsPreview: brands.map((b) => ({ id: b.id, name: b.name, colors: b.colors })),
      };
    }

    case "list_brands": {
      const includeLogo = Boolean(safeArgs.includeLogo);
      const brands = store.listBrands().map((b) => stripBrandLogo(b, includeLogo));
      return { count: brands.length, brands };
    }

    case "get_brand": {
      const brand = store.getBrand(safeArgs.brand);
      if (!brand) {
        return { found: false, error: `No brand matched "${safeArgs.brand || ""}"` };
      }
      return {
        found: true,
        brand: stripBrandLogo(brand, Boolean(safeArgs.includeLogo)),
        projects: store.listProjects({ brandId: brand.id }),
        voiceNotes: store.listVoiceNotes({ brandId: brand.id }),
      };
    }

    case "get_brand_guidelines": {
      const guide = store.buildBrandGuidelines(safeArgs.brand);
      if (!guide) {
        return { found: false, error: `No brand matched "${safeArgs.brand || ""}"` };
      }
      return { found: true, ...guide };
    }

    case "create_brand": {
      const created = store.createBrand(safeArgs, { source });
      return { ok: true, brand: stripBrandLogo(created, false) };
    }

    case "update_brand": {
      const { id, ...patch } = safeArgs;
      const updated = store.updateBrand(id, patch, { source });
      return { ok: true, brand: stripBrandLogo(updated, false) };
    }

    case "delete_brand": {
      return store.deleteBrand(safeArgs.id, { source });
    }

    case "list_projects": {
      const projects = store.listProjects({
        brandId: safeArgs.brandId,
        status: safeArgs.status,
        query: safeArgs.query,
      });
      const brandMap = new Map(store.listBrands().map((b) => [b.id, b.name]));
      return {
        count: projects.length,
        projects: projects.map((p) => ({
          ...p,
          brandName: p.brandId ? brandMap.get(p.brandId) || "" : "",
        })),
      };
    }

    case "get_project": {
      const project = store.getProject(safeArgs.project);
      if (!project) {
        return { found: false, error: `No project matched "${safeArgs.project || ""}"` };
      }
      const brand = project.brandId ? stripBrandLogo(store.getBrand(project.brandId), false) : null;
      const footage = store.listFootage({ projectId: project.id });
      const voiceNotes = store.listVoiceNotes({ projectId: project.id });
      return { found: true, project, brand, footage, voiceNotes };
    }

    case "create_project": {
      const created = store.createProject(safeArgs, { source });
      return { ok: true, project: created };
    }

    case "update_project": {
      const { id, ...patch } = safeArgs;
      const updated = store.updateProject(id, patch, { source });
      return { ok: true, project: updated };
    }

    case "list_footage": {
      const footage = store.listFootage({
        brandId: safeArgs.brandId,
        projectId: safeArgs.projectId,
      });
      return { count: footage.length, footage };
    }

    case "add_footage": {
      const item = store.addFootage(safeArgs, { source });
      return { ok: true, footage: item };
    }

    case "list_voice_notes": {
      const voiceNotes = store.listVoiceNotes({
        brandId: safeArgs.brandId,
        projectId: safeArgs.projectId,
      });
      return { count: voiceNotes.length, voiceNotes };
    }

    case "create_voice_note": {
      const note = store.createVoiceNote(safeArgs, { source });
      return { ok: true, voiceNote: note };
    }

    case "search_workspace": {
      const res = store.searchWorkspace(safeArgs.query);
      return {
        ...res,
        brands: res.brands.map((b) => stripBrandLogo(b, false)),
      };
    }

    case "video_stack": {
      const includeDocs = Boolean(safeArgs.includeDocs);
      const bundle = stackBundle({ includeDocs });
      return {
        ok: true,
        stack: bundle.stack,
        skillDir: bundle.skillDir,
        entrypoint: bundle.entrypoint,
        docs: bundle.docs.map((d) => ({
          id: d.id,
          kind: d.kind,
          path: d.path,
          title: d.title,
          chars: d.chars,
          text: d.text,
        })),
        use: "video_stack_doc({ doc }) for one doc, video_edit_status for readiness, video_edit_plan for the ordered stages of a clip.",
      };
    }

    case "video_stack_doc": {
      const doc = readStackDoc(safeArgs.doc);
      return { ok: true, doc: { id: doc.id, kind: doc.kind, path: doc.path, title: doc.title }, text: doc.text };
    }

    case "video_edit_status": {
      return editingStatus();
    }

    case "video_edit_plan": {
      const plan = clipPlan({
        name: String(safeArgs.name || "").trim(),
        mode: safeArgs.mode || "full",
        frame: safeArgs.frame || "tall",
        source: safeArgs.source || undefined,
      });
      return { ok: true, ...plan, brief: agentBrief({}) };
    }

    case "video_edit_stage": {
      return { ok: true, ...stagePlan({ stageId: safeArgs.stage, mode: safeArgs.mode || "full", work: safeArgs.work, name: safeArgs.name }) };
    }

    case "video_edit_run": {
      return runStage({
        stageId: safeArgs.stage,
        work: safeArgs.work,
        name: safeArgs.name,
        mode: safeArgs.mode || "full",
      });
    }

    default:
      throw Object.assign(new Error(`Unknown MCP tool: ${name}`), { code: -32601 });
  }
}
