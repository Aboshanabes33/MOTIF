import {
  Mic,
  X,
  Pencil,
  Trash2,
  Cpu,
  CheckCircle2,
  Sparkles,
  Copy,
} from "lucide-react";
import type {
  ActivityEvent,
  Brand,
  FootageItem,
  Lang,
  Project,
  ProjectStatus,
  SelectedItem,
  VoiceNote,
} from "../types";
import { translate } from "../i18n";

interface InspectorProps {
  lang: Lang;
  selected: SelectedItem;
  brands: Brand[];
  projects: Project[];
  footage: FootageItem[];
  voiceNotes: VoiceNote[];
  activity: ActivityEvent[];
  onClearSelection: () => void;
  onReplyVoice: () => void;
  onEditBrand: (brand: Brand) => void;
  onDeleteBrand: (brand: Brand) => void;
  onUpdateProject: (id: string, patch: Partial<Project>) => void;
  onDeleteProject: (id: string) => void;
  onDeleteFootage: (id: string) => void;
  onDeleteVoiceNote: (id: string) => void;
  onOpenMcpWithBrand: (brandId: string) => void;
  onToast: (msg: string) => void;
}

function relativeTime(iso: string): string {
  const diff = Math.max(0, Date.now() - Date.parse(iso));
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export function Inspector({
  lang,
  selected,
  brands,
  projects,
  footage,
  voiceNotes,
  activity,
  onClearSelection,
  onReplyVoice,
  onEditBrand,
  onDeleteBrand,
  onUpdateProject,
  onDeleteProject,
  onDeleteFootage,
  onDeleteVoiceNote,
  onOpenMcpWithBrand,
  onToast,
}: InspectorProps) {
  const brandById = new Map(brands.map((b) => [b.id, b]));

  const selectedProject =
    selected?.kind === "project" ? projects.find((p) => p.id === selected.id) || null : null;
  const selectedBrand =
    selected?.kind === "brand" ? brands.find((b) => b.id === selected.id) || null : null;
  const selectedFootage =
    selected?.kind === "footage" ? footage.find((f) => f.id === selected.id) || null : null;
  const selectedVoice =
    selected?.kind === "voice" ? voiceNotes.find((v) => v.id === selected.id) || null : null;

  const activeRender = projects.find((p) => p.status === "rendering" || p.status === "preparing");

  return (
    <aside className="inspector" aria-label="Inspector">
      {selectedBrand ? (
        <>
          <div className="inspector-head">
            <div>
              <div className="inspector-kicker">{translate(lang, "inspector.selectedBrand")}</div>
              <h2 className="inspector-title">{selectedBrand.name}</h2>
            </div>
            <button
              type="button"
              className="btn btn--ghost icon-btn"
              onClick={onClearSelection}
              aria-label={translate(lang, "inspector.close")}
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              className="brand-tile"
              style={{
                width: 54,
                height: 54,
                background: selectedBrand.logo
                  ? "#0c2729"
                  : `linear-gradient(135deg, ${selectedBrand.colors[0] || "#2f7268"}, ${selectedBrand.colors[1] || "#0c2729"})`,
              }}
            >
              {selectedBrand.logo ? (
                <img src={selectedBrand.logo} alt={selectedBrand.name} />
              ) : (
                selectedBrand.name.slice(0, 1).toUpperCase()
              )}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <span className="pill-badge pill-badge--accent">
                <Cpu size={11} />
                {translate(lang, "brands.mcpVisible")}
              </span>
              {selectedBrand.tagline && (
                <p className="inspector-body" style={{ marginTop: 6 }}>
                  {selectedBrand.tagline}
                </p>
              )}
            </div>
          </div>

          <div className="inspector-section">
            <span className="kv-key">{translate(lang, "brands.colors")}</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {selectedBrand.colors.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  className="btn"
                  style={{ height: 30, padding: "0 10px", fontFamily: "var(--font-mono)", fontSize: 11.5 }}
                  onClick={() => {
                    navigator.clipboard?.writeText(hex).catch(() => {});
                    onToast(`Copied ${hex}`);
                  }}
                >
                  <span className="swatch-chip" style={{ background: hex, width: 12, height: 12 }} />
                  {hex}
                  <Copy size={11} style={{ opacity: 0.6 }} />
                </button>
              ))}
            </div>
          </div>

          <div className="inspector-section kv-list">
            {selectedBrand.audience && (
              <div className="kv-row">
                <span className="kv-key">{translate(lang, "brands.audience")}</span>
                <span className="kv-val">{selectedBrand.audience}</span>
              </div>
            )}
            {selectedBrand.voice && (
              <div className="kv-row">
                <span className="kv-key">{translate(lang, "brands.voice")}</span>
                <span className="kv-val">{selectedBrand.voice}</span>
              </div>
            )}
            {selectedBrand.channels && (
              <div className="kv-row">
                <span className="kv-key">{translate(lang, "brands.channels")}</span>
                <span className="kv-val">{selectedBrand.channels}</span>
              </div>
            )}
            {selectedBrand.notes && (
              <div className="kv-row">
                <span className="kv-key">{translate(lang, "brands.notes")}</span>
                <p className="inspector-body">{selectedBrand.notes}</p>
              </div>
            )}
            <div className="kv-row">
              <span className="kv-key">MCP Resource URI</span>
              <code style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--accent)" }}>
                motif://brands/{selectedBrand.id}
              </code>
            </div>
          </div>

          <div className="inspector-section" style={{ flexDirection: "row", flexWrap: "wrap" }}>
            <button type="button" className="btn btn--primary" onClick={() => onEditBrand(selectedBrand)}>
              <Pencil size={14} />
              {translate(lang, "brands.edit")}
            </button>
            <button type="button" className="btn" onClick={() => onOpenMcpWithBrand(selectedBrand.id)}>
              <Sparkles size={14} />
              MCP Brief
            </button>
            <button type="button" className="btn btn--danger" onClick={() => onDeleteBrand(selectedBrand)}>
              <Trash2 size={14} />
            </button>
          </div>
        </>
      ) : selectedProject ? (
        <>
          <div className="inspector-head">
            <div>
              <div className="inspector-kicker">{translate(lang, "inspector.selectedProject")}</div>
              <h2 className="inspector-title">{selectedProject.name}</h2>
            </div>
            <button
              type="button"
              className="btn btn--ghost icon-btn"
              onClick={onClearSelection}
              aria-label={translate(lang, "inspector.close")}
            >
              <X size={16} />
            </button>
          </div>

          <div className="kv-list">
            <div className="kv-row">
              <span className="kv-key">{translate(lang, "inspector.status")}</span>
              <select
                className="select"
                value={selectedProject.status}
                onChange={(e) => {
                  const status = e.target.value as ProjectStatus;
                  const progress = status === "exported" || status === "approved" ? 100 : selectedProject.progress;
                  onUpdateProject(selectedProject.id, { status, progress });
                }}
              >
                <option value="preparing">{translate(lang, "status.preparing")}</option>
                <option value="editing">{translate(lang, "status.editing")}</option>
                <option value="rendering">{translate(lang, "status.rendering")}</option>
                <option value="exported">{translate(lang, "status.exported")}</option>
                <option value="approved">{translate(lang, "status.approved")}</option>
              </select>
            </div>

            <div className="kv-row">
              <span className="kv-key">{translate(lang, "inspector.brand")}</span>
              <select
                className="select"
                value={selectedProject.brandId || ""}
                onChange={(e) => onUpdateProject(selectedProject.id, { brandId: e.target.value })}
              >
                <option value="">{translate(lang, "today.unassigned")}</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="kv-row">
              <span className="kv-key">
                {translate(lang, "inspector.progress")} · {selectedProject.progress}%
              </span>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${selectedProject.progress}%` }} />
              </div>
            </div>

            <div className="kv-row">
              <span className="kv-key">Format</span>
              <span className="kv-val" style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                {selectedProject.aspect} · {selectedProject.resolution} · {selectedProject.fps} fps
              </span>
            </div>
          </div>

          {selectedProject.summary && (
            <div className="inspector-section">
              <span className="kv-key">{translate(lang, "inspector.summary")}</span>
              <p className="inspector-body">{selectedProject.summary}</p>
            </div>
          )}

          {selectedProject.notes && (
            <div className="inspector-section">
              <span className="kv-key">{translate(lang, "inspector.notes")}</span>
              <p className="inspector-body">{selectedProject.notes}</p>
            </div>
          )}

          <div className="inspector-section" style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {selectedProject.progress < 100 && (
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  const next = Math.min(100, selectedProject.progress + 15);
                  onUpdateProject(selectedProject.id, {
                    progress: next,
                    status: next >= 100 ? "exported" : "rendering",
                  });
                }}
              >
                {translate(lang, "inspector.advanceRender")}
              </button>
            )}
            {selectedProject.status !== "exported" && (
              <button
                type="button"
                className="btn"
                onClick={() => onUpdateProject(selectedProject.id, { status: "exported", progress: 100 })}
              >
                <CheckCircle2 size={14} />
                {translate(lang, "inspector.markExported")}
              </button>
            )}
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => onDeleteProject(selectedProject.id)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </>
      ) : selectedFootage ? (
        <>
          <div className="inspector-head">
            <div>
              <div className="inspector-kicker">{translate(lang, "inspector.selectedFootage")}</div>
              <h2 className="inspector-title" style={{ wordBreak: "break-word" }}>{selectedFootage.name}</h2>
            </div>
            <button
              type="button"
              className="btn btn--ghost icon-btn"
              onClick={onClearSelection}
              aria-label={translate(lang, "inspector.close")}
            >
              <X size={16} />
            </button>
          </div>

          <div className="kv-list">
            <div className="kv-row">
              <span className="kv-key">Specs</span>
              <span className="kv-val" style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                {selectedFootage.resolution} · {selectedFootage.colorProfile}
              </span>
            </div>
            {selectedFootage.brandId && brandById.get(selectedFootage.brandId) && (
              <div className="kv-row">
                <span className="kv-key">{translate(lang, "inspector.brand")}</span>
                <span className="kv-val">{brandById.get(selectedFootage.brandId)?.name}</span>
              </div>
            )}
            {selectedFootage.tags.length > 0 && (
              <div className="kv-row">
                <span className="kv-key">Tags</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 4 }}>
                  {selectedFootage.tags.map((tag) => (
                    <span key={tag} className="pill-badge">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="inspector-section">
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => onDeleteFootage(selectedFootage.id)}
            >
              <Trash2 size={14} />
              {translate(lang, "inspector.deleteItem")}
            </button>
          </div>
        </>
      ) : selectedVoice ? (
        <>
          <div className="inspector-head">
            <div>
              <div className="inspector-kicker">{translate(lang, "inspector.selectedVoice")}</div>
              <h2 className="inspector-title">{selectedVoice.title}</h2>
            </div>
            <button
              type="button"
              className="btn btn--ghost icon-btn"
              onClick={onClearSelection}
              aria-label={translate(lang, "inspector.close")}
            >
              <X size={16} />
            </button>
          </div>

          {selectedVoice.hasAudio && (
            <audio controls src={`/api/voice-notes/${encodeURIComponent(selectedVoice.id)}/audio`} style={{ width: "100%" }} />
          )}

          {selectedVoice.transcript && (
            <p className="inspector-body">{selectedVoice.transcript}</p>
          )}

          <div className="inspector-section">
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => onDeleteVoiceNote(selectedVoice.id)}
            >
              <Trash2 size={14} />
              {translate(lang, "inspector.deleteItem")}
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Default Brief + Reply Liquid Glass Chip (DESIGN.md) */}
          <div>
            <div className="inspector-kicker">{translate(lang, "inspector.brief")}</div>
            <h2 className="inspector-title">
              {activeRender
                ? activeRender.name
                : lang === "ar"
                  ? "MOTIF جاهز للعمل"
                  : "MOTIF Ready"}
            </h2>
            <p className="inspector-body" style={{ marginTop: 8 }}>
              {activeRender
                ? lang === "ar"
                  ? `جارٍ العمل على «${activeRender.name}» (${activeRender.progress}%). يقرأ وكيل MCP حالياً ${brands.length} براندات و${projects.length} مشاريع من مساحة العمل.`
                  : `“${activeRender.name}” is at ${activeRender.progress}%. MCP exposes ${brands.length} saved brands, ${projects.length} projects, and ${voiceNotes.length} voice notes to your AI agent.`
                : lang === "ar"
                  ? `مساحة العمل متصلة وتضم ${brands.length} براندات و${projects.length} مشاريع جاهزة للتحرير وللربط عبر MCP.`
                  : `Workspace connected with ${brands.length} brands, ${projects.length} projects, and ${footage.length} clips ready for editing or MCP agent collaboration.`}
            </p>

            <div style={{ marginTop: 14 }}>
              <button
                type="button"
                className="glass glass-btn glass-btn--sm"
                onClick={onReplyVoice}
              >
                <Mic size={14} />
                {translate(lang, "inspector.reply")}
              </button>
            </div>
          </div>

          {/* Live Activity Feed */}
          <div className="inspector-section" style={{ flex: 1 }}>
            <div className="inspector-kicker">{translate(lang, "inspector.liveActivity")}</div>
            {activity.length === 0 ? (
              <p className="inspector-body">{translate(lang, "inspector.noActivity")}</p>
            ) : (
              <div className="activity-list">
                {activity.slice(0, 8).map((ev) => (
                  <div key={ev.id} className="activity-item">
                    <span className={`activity-dot ${ev.source === "mcp" ? "activity-dot--mcp" : ""}`} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="activity-title">{ev.title}</div>
                      {ev.detail && <div className="activity-detail">{ev.detail}</div>}
                    </div>
                    <span style={{ fontSize: 11, color: "var(--ink-faint)", fontFamily: "var(--font-mono)" }}>
                      {relativeTime(ev.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
