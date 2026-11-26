import { useState, type FormEvent } from "react";
import { Film, Palette, Clapperboard, X } from "lucide-react";
import type { Brand, FootageItem, Lang, Project } from "../types";
import { translate } from "../i18n";

interface NewDialogProps {
  lang: Lang;
  brands: Brand[];
  onClose: () => void;
  onCreateProject: (payload: Partial<Project>) => Promise<void>;
  onAddFootage: (payload: Partial<FootageItem>) => Promise<void>;
  onOpenBrandDialog: () => void;
}

export function NewDialog({
  lang,
  brands,
  onClose,
  onCreateProject,
  onAddFootage,
  onOpenBrandDialog,
}: NewDialogProps) {
  const [tab, setTab] = useState<"project" | "brand" | "footage">("project");
  const [projectName, setProjectName] = useState("");
  const [brandId, setBrandId] = useState(brands[0]?.id || "");
  const [aspect, setAspect] = useState<"9:16" | "16:9" | "1:1">("9:16");
  const [summary, setSummary] = useState("");

  const [footageName, setFootageName] = useState("");
  const [footageKind, setFootageKind] = useState<"video" | "audio" | "image">("video");
  const [colorProfile, setColorProfile] = useState("D-Log M");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submitProject = async (e: FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;
    setBusy(true);
    setError("");
    try {
      await onCreateProject({
        name: projectName.trim(),
        brandId,
        aspect,
        summary: summary.trim(),
        status: "editing",
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setBusy(false);
    }
  };

  const submitFootage = async (e: FormEvent) => {
    e.preventDefault();
    if (!footageName.trim()) return;
    setBusy(true);
    setError("");
    try {
      await onAddFootage({
        name: footageName.trim(),
        kind: footageKind,
        colorProfile,
        brandId,
        resolution: footageKind === "audio" ? "48 kHz · 24-bit" : "3840×2160",
        fps: footageKind === "audio" ? 0 : 30,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add footage");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card glass">
        <div className="modal-head">
          <div>
            <h2 id="new-modal-title" className="modal-title">
              {translate(lang, "new.title")}
            </h2>
            <p className="view-subtitle" style={{ marginTop: 4 }}>
              {translate(lang, "new.subtitle")}
            </p>
          </div>
          <button type="button" className="btn btn--ghost icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Mode switch inside modal (flat tabs, not nested glass!) */}
        <div className="tab-strip">
          <button
            type="button"
            className={`tab-pill ${tab === "project" ? "is-active" : ""}`}
            onClick={() => setTab("project")}
          >
            <Film size={13} style={{ marginInlineEnd: 6, verticalAlign: "-2px" }} />
            {translate(lang, "new.tab.project")}
          </button>
          <button
            type="button"
            className={`tab-pill ${tab === "brand" ? "is-active" : ""}`}
            onClick={() => setTab("brand")}
          >
            <Palette size={13} style={{ marginInlineEnd: 6, verticalAlign: "-2px" }} />
            {translate(lang, "new.tab.brand")}
          </button>
          <button
            type="button"
            className={`tab-pill ${tab === "footage" ? "is-active" : ""}`}
            onClick={() => setTab("footage")}
          >
            <Clapperboard size={13} style={{ marginInlineEnd: 6, verticalAlign: "-2px" }} />
            {translate(lang, "new.tab.footage")}
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {tab === "project" && (
          <form onSubmit={submitProject} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label className="field">
              <span className="field-label">{translate(lang, "new.projectName")} *</span>
              <input
                className="input"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder={translate(lang, "new.projectNamePh")}
                autoFocus
                required
              />
            </label>

            <div className="field-grid">
              <label className="field">
                <span className="field-label">{translate(lang, "inspector.brand")}</span>
                <select className="select" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
                  <option value="">{translate(lang, "today.unassigned")}</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="field-label">{translate(lang, "new.aspect")}</span>
                <select
                  className="select"
                  value={aspect}
                  onChange={(e) => setAspect(e.target.value as "9:16" | "16:9" | "1:1")}
                >
                  <option value="9:16">9:16 Vertical (Reels / Shorts)</option>
                  <option value="16:9">16:9 Horizontal (YouTube)</option>
                  <option value="1:1">1:1 Square</option>
                </select>
              </label>
            </div>

            <label className="field">
              <span className="field-label">{translate(lang, "new.summary")}</span>
              <textarea
                className="textarea"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder={translate(lang, "new.summaryPh")}
              />
            </label>

            <div className="modal-foot">
              <button type="button" className="btn" onClick={onClose}>
                {translate(lang, "brands.form.cancel")}
              </button>
              <button type="submit" className="btn btn--primary" disabled={busy || !projectName.trim()}>
                {translate(lang, "new.createProject")}
              </button>
            </div>
          </form>
        )}

        {tab === "brand" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "8px 0" }}>
            <p className="inspector-body">
              {translate(lang, "brands.subtitle")}
            </p>
            <div className="modal-foot">
              <button type="button" className="btn" onClick={onClose}>
                {translate(lang, "brands.form.cancel")}
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  onClose();
                  onOpenBrandDialog();
                }}
              >
                <Palette size={14} />
                {translate(lang, "new.openBrandForm")}
              </button>
            </div>
          </div>
        )}

        {tab === "footage" && (
          <form onSubmit={submitFootage} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label className="field">
              <span className="field-label">{translate(lang, "new.footageName")} *</span>
              <input
                className="input"
                value={footageName}
                onChange={(e) => setFootageName(e.target.value)}
                placeholder={translate(lang, "new.footageNamePh")}
                autoFocus
                required
              />
            </label>

            <div className="field-grid">
              <label className="field">
                <span className="field-label">{translate(lang, "new.footageKind")}</span>
                <select
                  className="select"
                  value={footageKind}
                  onChange={(e) => setFootageKind(e.target.value as "video" | "audio" | "image")}
                >
                  <option value="video">Video</option>
                  <option value="audio">Audio</option>
                  <option value="image">Image</option>
                </select>
              </label>

              <label className="field">
                <span className="field-label">{translate(lang, "new.footageProfile")}</span>
                <input
                  className="input"
                  value={colorProfile}
                  onChange={(e) => setColorProfile(e.target.value)}
                />
              </label>
            </div>

            <label className="field">
              <span className="field-label">{translate(lang, "inspector.brand")}</span>
              <select className="select" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
                <option value="">{translate(lang, "today.unassigned")}</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="modal-foot">
              <button type="button" className="btn" onClick={onClose}>
                {translate(lang, "brands.form.cancel")}
              </button>
              <button type="submit" className="btn btn--primary" disabled={busy || !footageName.trim()}>
                {translate(lang, "new.addFootage")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
