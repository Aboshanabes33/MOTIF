import type {
  AppInfo,
  Brand,
  FootageItem,
  McpInstallResult,
  McpStatusPayload,
  Project,
  ReleasesPayload,
  VoiceNote,
  VideoEditStack,
  VideoEditStatus,
  VideoMode,
  VideoPlan,
  VideoRunResult,
  WorkspacePrefs,
  WorkspaceSnapshot,
} from "../types";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof body?.error === "string" ? body.error : `HTTP ${res.status}`);
  }
  return body as T;
}

export const api = {
  getInfo: () => requestJson<AppInfo>("/api/info"),
  getWorkspace: () => requestJson<WorkspaceSnapshot>("/api/workspace"),
  getPrefs: () => requestJson<WorkspacePrefs>("/api/prefs"),
  putPrefs: (prefs: Partial<WorkspacePrefs>) =>
    requestJson<WorkspacePrefs>("/api/prefs", {
      method: "PUT",
      body: JSON.stringify(prefs),
    }),

  createExampleBrand: () =>
    requestJson<{ ok: boolean; alreadyExisted: boolean; brand: Brand; brands: Brand[] }>(
      "/api/brands/example",
      { method: "POST" },
    ),
  createBrand: (brand: Partial<Brand>) =>
    requestJson<{ brand: Brand; brands: Brand[] }>("/api/brands", {
      method: "POST",
      body: JSON.stringify(brand),
    }),
  updateBrand: (id: string, patch: Partial<Brand>) =>
    requestJson<{ brand: Brand; brands: Brand[] }>(`/api/brands/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    }),
  deleteBrand: (id: string) =>
    requestJson<{ ok: boolean; brands: Brand[] }>(`/api/brands/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  createProject: (payload: Partial<Project>) =>
    requestJson<{ project: Project }>("/api/projects", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateProject: (id: string, patch: Partial<Project>) =>
    requestJson<{ project: Project }>(`/api/projects/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteProject: (id: string) =>
    requestJson<{ ok: boolean }>(`/api/projects/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  addFootage: (payload: Partial<FootageItem>) =>
    requestJson<{ footage: FootageItem }>("/api/footage", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteFootage: (id: string) =>
    requestJson<{ ok: boolean }>(`/api/footage/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  createVoiceNote: (payload: {
    title?: string;
    transcript?: string;
    durationSec?: number;
    brandId?: string;
    projectId?: string;
    audioBase64?: string;
  }) =>
    requestJson<{ voiceNote: VoiceNote }>("/api/voice-notes", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteVoiceNote: (id: string) =>
    requestJson<{ ok: boolean }>(`/api/voice-notes/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  getMcpStatus: () => requestJson<McpStatusPayload>("/api/mcp/status"),
  invokeMcpTool: (tool: string, args: Record<string, unknown> = {}) =>
    requestJson<{ ok: boolean; tool: string; elapsedMs: number; result: unknown }>("/api/mcp/invoke", {
      method: "POST",
      body: JSON.stringify({ tool, arguments: args }),
    }),
  installMcpClient: (client: string) =>
    requestJson<McpInstallResult>("/api/mcp/install", {
      method: "POST",
      body: JSON.stringify({ client }),
    }),
  removeMcpClient: (client: string) =>
    requestJson<McpInstallResult>("/api/mcp/uninstall", {
      method: "POST",
      body: JSON.stringify({ client }),
    }),
  getMcpPrompt: (name: string, args: Record<string, unknown> = {}) =>
    requestJson<{
      description?: string;
      messages: Array<{ role: string; content: { type: string; text: string } }>;
    }>("/api/mcp/prompt", {
      method: "POST",
      body: JSON.stringify({ name, arguments: args }),
    }),
  readMcpResource: (uri: string) =>
    requestJson<{ ok: boolean; content: { uri: string; mimeType: string; text: string } }>(
      `/api/mcp/resource?uri=${encodeURIComponent(uri)}`,
    ),

  getReleases: () => requestJson<ReleasesPayload>("/api/releases"),

  /* Video agent — the video-edit stack */
  getVideoStatus: () => requestJson<VideoEditStatus>("/api/video/edit/status"),
  getVideoStack: () => requestJson<VideoEditStack>("/api/video/edit/stack"),
  getVideoPlan: (payload: { name: string; mode?: VideoMode; frame?: string; source?: string }) =>
    requestJson<VideoPlan & { ok: boolean }>("/api/video/edit/plan", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  setVideoMode: (payload: { work: string; mode: VideoMode }) =>
    requestJson<{ ok: boolean; work: string; mode: VideoMode }>("/api/video/edit/mode", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getVideoStage: (payload: { stage: string; work: string; name?: string; mode?: VideoMode }) =>
    requestJson<{ ok: boolean; commands: string[]; checks: string[] }>("/api/video/edit/stage", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  runVideoStage: (payload: { stage: string; work: string; name?: string; mode?: VideoMode }) =>
    requestJson<VideoRunResult>("/api/video/edit/run", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
