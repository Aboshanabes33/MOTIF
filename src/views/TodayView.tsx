import { Film, Music, Image as ImageIcon, Plus } from "lucide-react";
import type {
  Brand,
  FootageItem,
  Lang,
  Project,
  SelectedItem,
  TodaySegment,
} from "../types";
import { translate, type MessageKey } from "../i18n";

interface TodayViewProps {
  lang: Lang;
  segment: TodaySegment;
  onSegmentChange: (seg: TodaySegment) => void;
  projects: Project[];
  footage: FootageItem[];
  brands: Brand[];
  selected: SelectedItem;
  onSelect: (item: SelectedItem) => void;
  onOpenNew: () => void;
}

function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function TodayView({
  lang,
  segment,
  onSegmentChange,
  projects,
  footage,
  brands,
  selected,
  onSelect,
  onOpenNew,
}: TodayViewProps) {
  const brandById = new Map(brands.map((b) => [b.id, b]));
  const showVideos = segment === "all" || segment === "videos";
  const showFootage = segment === "all" || segment === "footage";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Segmented Liquid Glass Control (DESIGN.md: 380px glass pill, flat active fill inside) */}
      <div className="seg-control glass" role="tablist" aria-label="Today filter">
        {(["all", "videos", "footage"] as TodaySegment[]).map((seg) => (
          <button
            key={seg}
            type="button"
            role="tab"
            aria-selected={segment === seg}
            className={`seg-btn ${segment === seg ? "is-active" : ""}`}
            onClick={() => onSegmentChange(seg)}
          >
            {translate(lang, `today.seg.${seg}` as MessageKey)}
          </button>
        ))}
      </div>

      {showVideos && (
        <section>
          <div className="section-label">
            <span>{translate(lang, "today.section.videos")}</span>
            <span>{projects.length}</span>
          </div>

          {projects.length === 0 ? (
            <div className="content-card empty-state">
              <p style={{ margin: 0 }}>{translate(lang, "today.empty")}</p>
              <button type="button" className="btn btn--primary" onClick={onOpenNew}>
                <Plus size={15} />
                {translate(lang, "header.new")}
              </button>
            </div>
          ) : (
            <div className="projects-grid">
              {projects.map((proj) => {
                const brand = proj.brandId ? brandById.get(proj.brandId) : null;
                const isSelected = selected?.kind === "project" && selected.id === proj.id;
                const isActive = proj.status === "rendering" || proj.status === "preparing";
                return (
                  <article
                    key={proj.id}
                    className={`content-card content-card--interactive project-card ${isSelected ? "is-selected" : ""}`}
                    onClick={() => onSelect({ kind: "project", id: proj.id })}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect({ kind: "project", id: proj.id });
                      }
                    }}
                  >
                    <div
                      className="project-thumb"
                      style={{
                        background: `radial-gradient(circle at 80% 15%, ${proj.accentFrom || "#2f7268"}88, transparent 60%), linear-gradient(155deg, ${proj.accentFrom || "#21574f"} 0%, ${proj.accentTo || "#0c2729"} 100%)`,
                      }}
                    >
                      <div className="project-thumb-top">
                        <span className={`pill-badge ${isActive ? "pill-badge--accent" : ""}`}>
                          {translate(lang, `status.${proj.status}` as MessageKey)}
                          {isActive ? ` · ${proj.progress}%` : ""}
                        </span>
                        <span className="pill-badge" style={{ fontFamily: "var(--font-mono)" }}>
                          {proj.aspect}
                        </span>
                      </div>

                      <div className="project-thumb-bottom">
                        <span>{proj.resolution}</span>
                        <span>{formatDuration(proj.durationSec)}</span>
                      </div>
                    </div>

                    <div>
                      <h3 className="project-title" title={proj.name}>
                        {proj.name}
                      </h3>
                      <div className="project-meta" style={{ marginTop: 4 }}>
                        <span className="brand-inline">
                          <span
                            className="brand-dot"
                            style={{ background: brand?.colors?.[0] || "rgba(255,255,255,0.28)" }}
                          />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {brand ? brand.name : translate(lang, "today.unassigned")}
                          </span>
                        </span>
                        <span style={{ fontFamily: "var(--font-mono)" }}>{proj.fps}fps</span>
                      </div>
                    </div>

                    {(isActive || proj.progress > 0) && (
                      <div className="progress-track" aria-label={`${proj.progress}%`}>
                        <div className="progress-fill" style={{ width: `${proj.progress}%` }} />
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {showFootage && (
        <section>
          <div className="section-label">
            <span>{translate(lang, "today.section.footage")}</span>
            <span>{footage.length}</span>
          </div>

          <div className="footage-grid">
            {footage.map((item) => {
              const isSelected = selected?.kind === "footage" && selected.id === item.id;
              const Icon = item.kind === "audio" ? Music : item.kind === "image" ? ImageIcon : Film;
              return (
                <article
                  key={item.id}
                  className={`content-card content-card--interactive footage-card ${isSelected ? "is-selected" : ""}`}
                  onClick={() => onSelect({ kind: "footage", id: item.id })}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect({ kind: "footage", id: item.id });
                    }
                  }}
                >
                  <div className="footage-icon">
                    <Icon size={18} />
                  </div>
                  <div className="footage-info">
                    <div className="footage-name" title={item.name}>
                      {item.name}
                    </div>
                    <div className="footage-sub">
                      {item.resolution} · {item.colorProfile}
                      {item.durationSec > 0 ? ` · ${formatDuration(item.durationSec)}` : ""}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
