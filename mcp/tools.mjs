/**
 * MOTIF MCP Tool, Resource, and Prompt Registry.
 * Shared between stdio MCP server (mcp/motif-mcp.mjs) and HTTP inspector (/api/mcp/*).
 */

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
            text: `You are working inside MOTIF Studio. Use the following official Brand identity from MOTIF to craft an on-brand video concept, visual palette plan, hook, and caption style:${topicLine}\n\n${guide.summary}\n\nRecent Projects:\n${JSON.stringify(guide.recentProjects, null, 2)}\n\nRecent Voice Notes:\n${JSON.stringify(guide.recentVoiceNotes, null, 2)}`,
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

    default:
      throw Object.assign(new Error(`Unknown MCP tool: ${name}`), { code: -32601 });
  }
}
