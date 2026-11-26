import { useState, useRef, type ChangeEvent, type FormEvent } from "react";
import { Plus, Trash2, Upload, X } from "lucide-react";
import type { Brand, Lang } from "../types";
import { translate } from "../i18n";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const PRESET_SWATCHES = ["#2f7268", "#9fd8cd", "#b5673b", "#3a7ca5", "#e8c8a0", "#d95d39", "#7c6cf0", "#172a3a"];

interface BrandDialogProps {
  lang: Lang;
  initialBrand: Brand | null;
  onClose: () => void;
  onSave: (payload: Partial<Brand>, editId: string | null) => Promise<void>;
}

export function BrandDialog({ lang, initialBrand, onClose, onSave }: BrandDialogProps) {
  const [name, setName] = useState(initialBrand?.name || "");
  const [tagline, setTagline] = useState(initialBrand?.tagline || "");
  const [logo, setLogo] = useState(initialBrand?.logo || "");
  const [colors, setColors] = useState<string[]>(
    initialBrand?.colors?.length ? [...initialBrand.colors] : ["#2f7268", "#9fd8cd"],
  );
  const [audience, setAudience] = useState(initialBrand?.audience || "");
  const [voice, setVoice] = useState(initialBrand?.voice || "");
  const [channels, setChannels] = useState(initialBrand?.channels || "");
  const [notes, setNotes] = useState(initialBrand?.notes || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleLogoFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    if (file.size > MAX_LOGO_BYTES) {
      setError(translate(lang, "brands.form.logoTooBig"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setLogo(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const updateColor = (idx: number, val: string) => {
    setColors((prev) => prev.map((c, i) => (i === idx ? val : c)));
  };

  const addColor = (hex = "#9fd8cd") => {
    setColors((prev) => (prev.length >= 4 ? prev : [...prev, hex]));
  };

  const removeColor = (idx: number) => {
    setColors((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(translate(lang, "brands.form.nameRequired"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(
        {
          name: name.trim(),
          tagline: tagline.trim(),
          logo,
          colors,
          audience: audience.trim(),
          voice: voice.trim(),
          channels: channels.trim(),
          notes: notes.trim(),
        },
        initialBrand?.id || null,
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save brand");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="brand-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form className="modal-card glass" onSubmit={handleSubmit}>
        <div className="modal-head">
          <div>
            <h2 id="brand-modal-title" className="modal-title">
              {translate(lang, initialBrand ? "brands.form.editTitle" : "brands.form.newTitle")}
            </h2>
            <p className="view-subtitle" style={{ marginTop: 4 }}>
              {translate(lang, "brands.subtitle")}
            </p>
          </div>
          <button type="button" className="btn btn--ghost icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="field-grid">
          <label className="field">
            <span className="field-label">{translate(lang, "brands.form.name")} *</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={translate(lang, "brands.form.namePh")}
              autoFocus
              required
            />
          </label>

          <label className="field">
            <span className="field-label">{translate(lang, "brands.form.tagline")}</span>
            <input
              className="input"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder={translate(lang, "brands.form.taglinePh")}
            />
          </label>

          {/* Logo uploader */}
          <div className="field field--full">
            <span className="field-label">{translate(lang, "brands.form.logo")}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div
                className="brand-tile"
                style={{
                  width: 48,
                  height: 48,
                  background: logo
                    ? "#0c2729"
                    : `linear-gradient(135deg, ${colors[0] || "#2f7268"}, ${colors[1] || "#0c2729"})`,
                }}
              >
                {logo ? <img src={logo} alt="" /> : (name.trim().slice(0, 1) || "M").toUpperCase()}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                hidden
                onChange={handleLogoFile}
              />
              <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
                <Upload size={14} />
                {translate(lang, "brands.form.uploadLogo")}
              </button>
              {logo && (
                <button type="button" className="btn btn--danger" onClick={() => setLogo("")}>
                  <Trash2 size={14} />
                  {translate(lang, "brands.form.removeLogo")}
                </button>
              )}
              <span style={{ fontSize: 11.5, color: "var(--ink-muted)" }}>
                {translate(lang, "brands.form.logoHint")}
              </span>
            </div>
          </div>

          {/* Colors (up to 4) */}
          <div className="field field--full">
            <span className="field-label">{translate(lang, "brands.form.colors")}</span>
            <div className="color-editor-row">
              {colors.map((c, idx) => (
                <div key={idx} className="color-chip-input">
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(c) ? c : "#2f7268"}
                    onChange={(e) => updateColor(idx, e.target.value)}
                    aria-label={`Color ${idx + 1}`}
                  />
                  <input
                    type="text"
                    className="color-hex-text"
                    value={c}
                    onChange={(e) => updateColor(idx, e.target.value)}
                    dir="ltr"
                  />
                  {colors.length > 1 && (
                    <button
                      type="button"
                      className="btn btn--ghost"
                      style={{ height: 22, width: 22, padding: 0 }}
                      onClick={() => removeColor(idx)}
                      aria-label="Remove color"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
              {colors.length < 4 && (
                <button type="button" className="btn" onClick={() => addColor()}>
                  <Plus size={14} />
                  {translate(lang, "brands.form.addColor")}
                </button>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
              {PRESET_SWATCHES.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  title={hex}
                  aria-label={`Add preset ${hex}`}
                  onClick={() => {
                    if (colors.includes(hex)) return;
                    if (colors.length < 4) addColor(hex);
                    else updateColor(colors.length - 1, hex);
                  }}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    border: "1px solid rgba(255,255,255,0.28)",
                    background: hex,
                    cursor: "pointer",
                  }}
                />
              ))}
            </div>
          </div>

          <label className="field">
            <span className="field-label">{translate(lang, "brands.form.audience")}</span>
            <input
              className="input"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder={translate(lang, "brands.form.audiencePh")}
            />
          </label>

          <label className="field">
            <span className="field-label">{translate(lang, "brands.form.channels")}</span>
            <input
              className="input"
              value={channels}
              onChange={(e) => setChannels(e.target.value)}
              placeholder={translate(lang, "brands.form.channelsPh")}
            />
          </label>

          <label className="field field--full">
            <span className="field-label">{translate(lang, "brands.form.voice")}</span>
            <input
              className="input"
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              placeholder={translate(lang, "brands.form.voicePh")}
            />
          </label>

          <label className="field field--full">
            <span className="field-label">{translate(lang, "brands.form.notes")}</span>
            <textarea
              className="textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={translate(lang, "brands.form.notesPh")}
            />
          </label>
        </div>

        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>
            {translate(lang, "brands.form.cancel")}
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {translate(lang, "brands.form.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
