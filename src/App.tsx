import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Search } from "lucide-react";
import type {
  ActivityEvent,
  AppInfo,
  Brand,
  FootageItem,
  Lang,
  McpStatusPayload,
  NavView,
  Project,
  ReleasesPayload,
  SelectedItem,
  TodaySegment,
  VoiceNote,
} from "./types";
import { api } from "./api/client";
import { translate, type MessageKey } from "./i18n";
import { MountainBackdrop } from "./components/MountainBackdrop";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { Inspector } from "./components/Inspector";
import { StatusBar } from "./components/StatusBar";
import { BrandDialog } from "./components/BrandDialog";
import { NewDialog } from "./components/NewDialog";
import { TodayView } from "./views/TodayView";
import { BrandsView } from "./views/BrandsView";
import { VoiceNoteView } from "./views/VoiceNoteView";
import { SearchView } from "./views/SearchView";
import { McpView } from "./views/McpView";
import { VideoAgentView } from "./views/VideoAgentView";
import { ReleaseView } from "./views/ReleaseView";

function isStandaloneReleaseLocation(): boolean {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname.replace(/\/+$/, "");
  const params = new URLSearchParams(window.location.search);
  return (
    path === "/releases" ||
    params.get("page") === "releases" ||
    window.location.hash === "#/releases"
  );
}

function getInitialLang(): Lang {
  try {
    const saved = localStorage.getItem("motif.lang");
    if (saved === "ar" || saved === "en") return saved;
  } catch {
    // ignore
  }
  return "en";
}

export function App() {
  const [standaloneRelease, setStandaloneRelease] = useState<boolean>(isStandaloneReleaseLocation);
  const [lang, setLang] = useState<Lang>(getInitialLang);
  const [view, setView] = useState<NavView>("today");
  const [segment, setSegment] = useState<TodaySegment>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<SelectedItem>(null);
  const [connected, setConnected] = useState(true);

  const [info, setInfo] = useState<AppInfo | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [footage, setFootage] = useState<FootageItem[]>([]);
  const [voiceNotes, setVoiceNotes] = useState<VoiceNote[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [mcpStatus, setMcpStatus] = useState<McpStatusPayload | null>(null);
  const [releases, setReleases] = useState<ReleasesPayload | null>(null);

  const [showNewDialog, setShowNewDialog] = useState(false);
  const [brandDialogTarget, setBrandDialogTarget] = useState<{ open: boolean; brand: Brand | null }>({
    open: false,
    brand: null,
  });
  const [mcpFocusBrandId, setMcpFocusBrandId] = useState<string | null>(null);
  const [toast, setToast] = useState<string>("");

  const searchInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<number | null>(null);

  const pushToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2600);
  }, []);

  // Sync HTML lang & RTL direction
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    try {
      localStorage.setItem("motif.lang", lang);
    } catch {
      // ignore
    }
  }, [lang]);

  const refreshWorkspace = useCallback(async () => {
    try {
      const [ws, mcp] = await Promise.all([api.getWorkspace(), api.getMcpStatus()]);
      setBrands(ws.brands || []);
      setProjects(ws.projects || []);
      setFootage(ws.footage || []);
      setVoiceNotes(ws.voiceNotes || []);
      setActivity(ws.activity || []);
      setMcpStatus(mcp);
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    api.getInfo().then(setInfo).catch(() => {});
    api.getReleases().then(setReleases).catch(() => {});
    refreshWorkspace();
  }, [refreshWorkspace]);

  // Browser popstate sync for /releases <-> /
  useEffect(() => {
    const onPop = () => setStandaloneRelease(isStandaloneReleaseLocation());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Live SSE updates (including real-time updates from external MCP AI agents!)
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/events");
      es.onopen = () => setConnected(true);
      es.onerror = () => setConnected(false);
      es.addEventListener("prefs", () => refreshWorkspace());
      es.addEventListener("projects", () => refreshWorkspace());
      es.addEventListener("workspace", () => refreshWorkspace());
      es.addEventListener("mcp", () => refreshWorkspace());
    } catch {
      // SSE unavailable
    }
    return () => {
      es?.close();
    };
  }, [refreshWorkspace]);

  // Keyboard shortcuts per DESIGN.md (1–6, /, Escape)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (e.key === "Escape") {
        if (brandDialogTarget.open) {
          setBrandDialogTarget({ open: false, brand: null });
          return;
        }
        if (showNewDialog) {
          setShowNewDialog(false);
          return;
        }
        if (searchQuery) {
          setSearchQuery("");
          return;
        }
        if (selected) {
          setSelected(null);
        }
        return;
      }

      if (isEditable || e.metaKey || e.ctrlKey || e.altKey || standaloneRelease) return;

      if (e.key === "/") {
        e.preventDefault();
        setView("search");
        requestAnimationFrame(() => searchInputRef.current?.focus());
        return;
      }

      const keyMap: Record<string, NavView> = {
        "1": "today",
        "2": "brands",
        "3": "voice",
        "4": "search",
        "5": "agent",
        "6": "mcp",
        "7": "releases",
      };
      if (keyMap[e.key]) {
        e.preventDefault();
        setView(keyMap[e.key]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [brandDialogTarget.open, showNewDialog, searchQuery, selected, standaloneRelease]);

  const toggleLang = () => {
    const next: Lang = lang === "en" ? "ar" : "en";
    setLang(next);
    api.putPrefs({ lang: next }).catch(() => {});
  };

  const handleSaveBrand = async (payload: Partial<Brand>, editId: string | null) => {
    if (editId) {
      const res = await api.updateBrand(editId, payload);
      setBrands(res.brands);
      setSelected({ kind: "brand", id: res.brand.id });
      pushToast(`Saved “${res.brand.name}”`);
    } else {
      const res = await api.createBrand(payload);
      setBrands(res.brands);
      setSelected({ kind: "brand", id: res.brand.id });
      pushToast(`Created “${res.brand.name}”`);
    }
    refreshWorkspace();
  };

  const handleDeleteBrand = async (brand: Brand) => {
    const ok = window.confirm(translate(lang, "brands.deleteConfirm", { name: brand.name }));
    if (!ok) return;
    const res = await api.deleteBrand(brand.id);
    setBrands(res.brands);
    if (selected?.kind === "brand" && selected.id === brand.id) setSelected(null);
    pushToast(`Deleted “${brand.name}”`);
    refreshWorkspace();
  };

  const handleCreateProject = async (payload: Partial<Project>) => {
    const res = await api.createProject(payload);
    setSelected({ kind: "project", id: res.project.id });
    setView("today");
    pushToast(`Created “${res.project.name}”`);
    refreshWorkspace();
  };

  const handleUpdateProject = async (id: string, patch: Partial<Project>) => {
    await api.updateProject(id, patch);
    refreshWorkspace();
  };

  const handleDeleteProject = async (id: string) => {
    await api.deleteProject(id);
    if (selected?.kind === "project" && selected.id === id) setSelected(null);
    pushToast("Project removed");
    refreshWorkspace();
  };

  const handleAddFootage = async (payload: Partial<FootageItem>) => {
    const res = await api.addFootage(payload);
    setSelected({ kind: "footage", id: res.footage.id });
    pushToast(`Added “${res.footage.name}”`);
    refreshWorkspace();
  };

  const handleDeleteFootage = async (id: string) => {
    await api.deleteFootage(id);
    if (selected?.kind === "footage" && selected.id === id) setSelected(null);
    refreshWorkspace();
  };

  const handleSaveVoiceNote = async (payload: {
    title?: string;
    transcript?: string;
    durationSec?: number;
    brandId?: string;
    projectId?: string;
    audioBase64?: string;
  }) => {
    const res = await api.createVoiceNote(payload);
    setSelected({ kind: "voice", id: res.voiceNote.id });
    pushToast(`Saved “${res.voiceNote.title}”`);
    refreshWorkspace();
  };

  const handleDeleteVoiceNote = async (id: string) => {
    await api.deleteVoiceNote(id);
    if (selected?.kind === "voice" && selected.id === id) setSelected(null);
    refreshWorkspace();
  };

  const enterStandaloneReleases = () => {
    setStandaloneRelease(true);
    try {
      window.history.pushState({}, "", "/releases");
    } catch {
      // file:// in Electron -> hash fallback
      window.location.hash = "#/releases";
    }
  };

  const exitStandaloneReleases = () => {
    setStandaloneRelease(false);
    setView("today");
    try {
      window.history.pushState({}, "", "/");
    } catch {
      window.location.hash = "";
    }
  };

  const viewTitleKey: Record<NavView, MessageKey> = {
    today: "today.title",
    brands: "brands.title",
    voice: "voice.title",
    search: "search.title",
    agent: "agent.title",
    mcp: "mcp.title",
    releases: "releases.title",
  };

  const viewSubKey: Record<NavView, MessageKey> = {
    today: "today.subtitle",
    brands: "brands.subtitle",
    voice: "voice.subtitle",
    search: "search.subtitle",
    agent: "agent.subtitle",
    mcp: "mcp.subtitle",
    releases: "releases.subtitle",
  };

  return (
    <div className="motif-shell">
      <MountainBackdrop />

      <TitleBar
        lang={lang}
        onToggleLang={toggleLang}
        mcpToolCount={mcpStatus?.tools.length ?? 22}
        connected={connected}
        standaloneRelease={standaloneRelease}
        onClickWordmark={() => {
          if (standaloneRelease) exitStandaloneReleases();
          else setView("today");
        }}
        onClickMcp={() => {
          if (standaloneRelease) exitStandaloneReleases();
          setView("mcp");
        }}
      />

      {standaloneRelease ? (
        <main className="standalone-release-wrap">
          <div className="standalone-release-inner">
            <ReleaseView
              lang={lang}
              releases={releases}
              mcpStatus={mcpStatus}
              standalone
              onBackToStudio={exitStandaloneReleases}
              onToast={pushToast}
            />
          </div>
        </main>
      ) : (
        <div className="workspace-body">
          <Sidebar
            activeView={view}
            onSelectView={setView}
            lang={lang}
            connected={connected}
            brandsCount={brands.length}
            projectsCount={projects.length}
            version={info?.version || "2.0.0"}
          />

          <main className="main-col">
            <header className="view-header">
              <div className="view-heading">
                <h1 className="view-title">{translate(lang, viewTitleKey[view])}</h1>
                <p className="view-subtitle">{translate(lang, viewSubKey[view])}</p>
              </div>

              <div className="header-controls">
                {/* Liquid Glass Search Pill (260px, always accessible per DESIGN.md) */}
                <label className="search-pill glass">
                  <Search size={15} />
                  <input
                    ref={searchInputRef}
                    type="search"
                    value={searchQuery}
                    placeholder={translate(lang, "header.searchPlaceholder")}
                    onFocus={() => {
                      if (view !== "search") setView("search");
                    }}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      if (view !== "search") setView("search");
                    }}
                  />
                  <span className="search-slash">/</span>
                </label>

                {/* Liquid Glass + New Button */}
                <button
                  type="button"
                  className="glass glass-btn"
                  onClick={() => setShowNewDialog(true)}
                >
                  <Plus size={16} strokeWidth={2.2} />
                  <span>{translate(lang, "header.new")}</span>
                </button>
              </div>
            </header>

            <div className="view-scroll">
              {view === "today" && (
                <TodayView
                  lang={lang}
                  segment={segment}
                  onSegmentChange={setSegment}
                  projects={projects}
                  footage={footage}
                  brands={brands}
                  selected={selected}
                  onSelect={setSelected}
                  onOpenNew={() => setShowNewDialog(true)}
                />
              )}

              {view === "brands" && (
                <BrandsView
                  lang={lang}
                  brands={brands}
                  projects={projects}
                  selected={selected}
                  onSelect={setSelected}
                  onAddBrand={() => setBrandDialogTarget({ open: true, brand: null })}
                  onEditBrand={(brand) => setBrandDialogTarget({ open: true, brand })}
                  onDeleteBrand={handleDeleteBrand}
                />
              )}

              {view === "voice" && (
                <VoiceNoteView
                  lang={lang}
                  brands={brands}
                  projects={projects}
                  voiceNotes={voiceNotes}
                  selected={selected}
                  onSelect={setSelected}
                  onSaveVoiceNote={handleSaveVoiceNote}
                  onDeleteVoiceNote={handleDeleteVoiceNote}
                />
              )}

              {view === "search" && (
                <SearchView
                  lang={lang}
                  query={searchQuery}
                  brands={brands}
                  projects={projects}
                  footage={footage}
                  voiceNotes={voiceNotes}
                  onSelect={setSelected}
                />
              )}

              {view === "agent" && <VideoAgentView lang={lang} onToast={pushToast} />}

              {view === "mcp" && (
                <McpView
                  lang={lang}
                  mcpStatus={mcpStatus}
                  focusBrandId={mcpFocusBrandId}
                  onAfterInvoke={refreshWorkspace}
                  onToast={pushToast}
                />
              )}

              {view === "releases" && (
                <ReleaseView
                  lang={lang}
                  releases={releases}
                  mcpStatus={mcpStatus}
                  onOpenStandalone={enterStandaloneReleases}
                  onToast={pushToast}
                />
              )}
            </div>
          </main>

          <Inspector
            lang={lang}
            selected={selected}
            brands={brands}
            projects={projects}
            footage={footage}
            voiceNotes={voiceNotes}
            activity={activity}
            onClearSelection={() => setSelected(null)}
            onReplyVoice={() => setView("voice")}
            onEditBrand={(brand) => setBrandDialogTarget({ open: true, brand })}
            onDeleteBrand={handleDeleteBrand}
            onUpdateProject={handleUpdateProject}
            onDeleteProject={handleDeleteProject}
            onDeleteFootage={handleDeleteFootage}
            onDeleteVoiceNote={handleDeleteVoiceNote}
            onOpenMcpWithBrand={(brandId) => {
              setMcpFocusBrandId(brandId);
              setView("mcp");
            }}
            onToast={pushToast}
          />
        </div>
      )}

      <StatusBar
        lang={lang}
        connected={connected}
        runtime={info?.runtime || "web"}
        version={info?.version || "2.0.0"}
      />

      {showNewDialog && (
        <NewDialog
          lang={lang}
          brands={brands}
          onClose={() => setShowNewDialog(false)}
          onCreateProject={handleCreateProject}
          onAddFootage={handleAddFootage}
          onOpenBrandDialog={() => setBrandDialogTarget({ open: true, brand: null })}
        />
      )}

      {brandDialogTarget.open && (
        <BrandDialog
          lang={lang}
          initialBrand={brandDialogTarget.brand}
          onClose={() => setBrandDialogTarget({ open: false, brand: null })}
          onSave={handleSaveBrand}
        />
      )}

      {toast && (
        <div className="toast-banner glass" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  );
}
export default App;
