export type Lang = "en" | "ar";

export type NavView = "today" | "brands" | "voice" | "search" | "mcp" | "releases" | "agent";

export type TodaySegment = "all" | "videos" | "footage";

export interface Brand {
  id: string;
  name: string;
  tagline: string;
  logo: string;
  colors: string[];
  audience: string;
  voice: string;
  channels: string;
  notes: string;
  createdAt?: string;
  updatedAt?: string;
}

export type ProjectStatus =
  | "preparing"
  | "editing"
  | "rendering"
  | "exported"
  | "approved"
  | "slim";

export interface Project {
  id: string;
  folder: string;
  name: string;
  brandId: string;
  status: ProjectStatus;
  progress: number;
  aspect: "9:16" | "16:9" | "1:1";
  durationSec: number;
  resolution: string;
  fps: number;
  accentFrom: string;
  accentTo: string;
  summary: string;
  notes: string;
  diskBacked?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FootageItem {
  id: string;
  name: string;
  kind: "video" | "audio" | "image";
  durationSec: number;
  resolution: string;
  fps: number;
  colorProfile: string;
  sizeMB: number;
  filePath?: string;
  brandId: string;
  projectId: string;
  tags: string[];
  createdAt: string;
}

export interface VoiceNote {
  id: string;
  title: string;
  transcript: string;
  durationSec: number;
  brandId: string;
  projectId: string;
  hasAudio: boolean;
  audioFile: string;
  mimeType: string;
  createdAt: string;
}

export interface ActivityEvent {
  id: string;
  source: "studio" | "mcp" | "user" | string;
  type: string;
  title: string;
  detail?: string;
  timestamp: string;
}

export interface WorkspacePrefs {
  projectsRoot?: string;
  lang?: Lang;
  brands: Brand[];
  [key: string]: unknown;
}

export interface WorkspaceSnapshot {
  prefs: WorkspacePrefs;
  brands: Brand[];
  projects: Project[];
  footage: FootageItem[];
  voiceNotes: VoiceNote[];
  activity: ActivityEvent[];
}

export interface AppInfo {
  app: string;
  version: string;
  runtime: "electron" | "web" | string;
  platform: string;
  arch: string;
  dataDir: string;
  prefsFile: string;
  projectsDir: string;
  mcp: {
    ready: boolean;
    serverName: string;
    version: string;
    toolCount: number;
    resourceCount: number;
    promptCount: number;
    lastEventAt: string | null;
    connectedClients: number;
  };
}

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, { type?: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
}

export interface McpResourceDef {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export interface McpPromptDef {
  name: string;
  description: string;
  arguments?: Array<{ name: string; description: string; required?: boolean }>;
}

export interface McpStatusPayload {
  server: { name: string; version: string };
  protocolVersion: string;
  transport: string;
  lastEventAt: string | null;
  connectedClients: number;
  tools: McpToolDef[];
  resources: McpResourceDef[];
  prompts: McpPromptDef[];
  configs: {
    scriptPath: string;
    command: string;
    args: string[];
    claudeDesktop: Record<string, unknown>;
    claudeCode: Record<string, unknown>;
    cursor: Record<string, unknown>;
    codexToml: string;
  };
}

export interface ReleaseArtifact {
  id: string;
  label: string;
  labelAr: string;
  fileName: string;
  arch: string;
  kind: "installer" | "portable";
  recommended: boolean;
  url: string;
  note: string;
  size?: number;
  sha256?: string;
  ready?: boolean;
  directDownload?: boolean;
}

export interface CurrentRelease {
  version: string;
  tag: string;
  name: string;
  publishedAt: string;
  channel: string;
  prerelease: boolean;
  platform: string;
  electronVersion: string;
  reactVersion: string;
  mcpProtocol: string;
  releaseUrl: string;
  checksumsUrl?: string;
  highlights: string[];
  highlightsAr: string[];
  artifacts: ReleaseArtifact[];
  requirements: {
    os: string;
    cpu: string;
    ram: string;
    disk: string;
    mcp: string;
  };
}

export interface GithubReleaseAsset {
  name: string;
  size: number;
  downloadCount?: number;
  downloadUrl: string;
}

export interface GithubReleaseItem {
  id: string;
  tag: string;
  name: string;
  publishedAt: string;
  prerelease: boolean;
  url: string;
  summary: string;
  sha256: string;
  assets: GithubReleaseAsset[];
}

export interface ReleasesPayload {
  repo: string;
  current: CurrentRelease;
  githubReleases: GithubReleaseItem[];
  syncedFromGithub: boolean;
}

/* ── Video agent: the video-edit stack is what the local agent runs on ── */

export type VideoMode = "quick" | "light" | "full";

export interface VideoStageRef {
  id: string;
  n: number;
  title: { ar: string; en: string };
  doc: string;
  note?: { ar: string; en: string };
  optional?: boolean;
}

export interface VideoEditIdentity {
  handle: string;
  bg: string;
  ink: string;
  acc: string;
  font: string;
  style: string;
  numerals: string;
}

export interface VideoClipProject {
  name: string;
  dir: string;
  mode: string;
  durationSec: number | null;
  wordCards: number;
  scenes: number;
  frame: string;
  style: string;
  files: Record<string, boolean>;
  delivered: boolean;
  updatedAt: string | null;
  srtFiles: string[];
  deliverFiles: string[];
}

export interface VideoEditStatus {
  stack: { name: string; version: string; entrypoint: string; updated: string };
  skillDir: string;
  home: string;
  homeReady: boolean;
  profileReady: boolean;
  identity: VideoEditIdentity | null;
  engine: { remotionReady: boolean; sharedDir: string };
  sounds: number;
  projects: VideoClipProject[];
  stageCount: number;
  modes: string[];
  redLines: number;
}

export interface VideoEditStack {
  stack: {
    name: string;
    version: string;
    title: { ar: string; en: string };
    summary: { ar: string; en: string };
    modes: Record<VideoMode, { ar: string; en: string; writeModeFile: boolean; stages: string[] }>;
    frames: Record<string, { size: number[]; ar: string; en: string }>;
    aspectToFrame: Record<string, string>;
    styles: Array<{ id: string; doc: string; ar: string; en: string }>;
    redLines: Array<{ ar: string; en: string }>;
    stages: VideoStageRef[];
    checks: Record<string, { ar: string; en: string; command: string }>;
  };
  skillDir: string;
  stackFile: string;
  brief: string;
}

export interface VideoPlanStep {
  id: string;
  n: number;
  title: { ar: string; en: string };
  commands: string[];
  checks: string[];
}

export interface VideoPlan {
  mode: VideoMode;
  name: string;
  frame: string;
  source: string;
  work: string;
  steps: VideoPlanStep[];
}

export interface VideoRunResult {
  ok: boolean;
  command: string;
  exitCode: number;
  gate: "ok" | "refused" | "error";
  elapsedMs: number;
  output: string;
}

export type SelectedItem =
  | { kind: "project"; id: string }
  | { kind: "brand"; id: string }
  | { kind: "footage"; id: string }
  | { kind: "voice"; id: string }
  | null;

export interface MotifDesktopBridge {
  isElectron: boolean;
  platform: string;
  minimize: () => Promise<void>;
  maximize: () => Promise<boolean>;
  isMaximized: () => Promise<boolean>;
  close: () => Promise<void>;
  onMaximizeChange: (cb: (maximized: boolean) => void) => () => void;
  openExternal: (url: string) => Promise<void>;
  getAppInfo: () => Promise<{ version: string; mcpPath: string; dataDir: string; platform: string }>;
}

declare global {
  interface Window {
    motifDesktop?: MotifDesktopBridge;
  }
}
