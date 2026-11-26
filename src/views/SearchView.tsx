import { Film, Mic, Palette, Clapperboard } from "lucide-react";
import type { Brand, FootageItem, Lang, Project, SelectedItem, VoiceNote } from "../types";
import { translate } from "../i18n";

interface SearchViewProps {
  lang: Lang;
  query: string;
  brands: Brand[];
  projects: Project[];
  footage: FootageItem[];
  voiceNotes: VoiceNote[];
  onSelect: (item: SelectedItem) => void;
}

export function SearchView({
  lang,
  query,
  brands,
  projects,
  footage,
  voiceNotes,
  onSelect,
}: SearchViewProps) {
  const trimmed = query.trim();
  const q = trimmed.toLowerCase();

  if (!trimmed) {
    return (
      <div className="content-card empty-state">
        <p style={{ margin: 0 }}>{translate(lang, "search.prompt")}</p>
      </div>
    );
  }

  const hit = (...fields: Array<string | undefined>) =>
    fields.some((f) => String(f || "").toLowerCase().includes(q));

  const mBrands = brands.filter((b) =>
    hit(b.name, b.tagline, b.audience, b.voice, b.channels, b.notes, ...b.colors),
  );
  const mProjects = projects.filter((p) => hit(p.name, p.folder, p.summary, p.notes, p.status));
  const mFootage = footage.filter((f) => hit(f.name, f.colorProfile, f.resolution, ...f.tags));
  const mVoice = voiceNotes.filter((v) => hit(v.title, v.transcript));

  const total = mBrands.length + mProjects.length + mFootage.length + mVoice.length;

  if (total === 0) {
    return (
      <div className="content-card empty-state">
        <p style={{ margin: 0, fontSize: 15, color: "var(--ink)" }}>
          {translate(lang, "search.empty", { q: trimmed })}
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {mBrands.length > 0 && (
        <section>
          <div className="section-label">
            <span>{translate(lang, "search.group.brands")}</span>
            <span>{mBrands.length}</span>
          </div>
          <div className="brands-list">
            {mBrands.map((b) => (
              <article
                key={b.id}
                className="content-card content-card--interactive brand-row"
                onClick={() => onSelect({ kind: "brand", id: b.id })}
              >
                <div
                  className="brand-tile"
                  style={{
                    background: `linear-gradient(135deg, ${b.colors[0] || "#2f7268"}, ${b.colors[1] || "#0c2729"})`,
                  }}
                >
                  {b.logo ? <img src={b.logo} alt="" /> : <Palette size={18} />}
                </div>
                <div className="brand-row-main">
                  <div className="brand-row-name">{b.name}</div>
                  <div className="brand-row-tagline">{b.tagline || b.voice || "—"}</div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {mProjects.length > 0 && (
        <section>
          <div className="section-label">
            <span>{translate(lang, "search.group.projects")}</span>
            <span>{mProjects.length}</span>
          </div>
          <div className="brands-list">
            {mProjects.map((p) => (
              <article
                key={p.id}
                className="content-card content-card--interactive brand-row"
                onClick={() => onSelect({ kind: "project", id: p.id })}
              >
                <div className="footage-icon">
                  <Film size={18} />
                </div>
                <div className="brand-row-main">
                  <div className="brand-row-name">{p.name}</div>
                  <div className="brand-row-tagline">
                    {p.aspect} · {p.status} · {p.summary || p.notes || "—"}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {mFootage.length > 0 && (
        <section>
          <div className="section-label">
            <span>{translate(lang, "search.group.footage")}</span>
            <span>{mFootage.length}</span>
          </div>
          <div className="brands-list">
            {mFootage.map((f) => (
              <article
                key={f.id}
                className="content-card content-card--interactive brand-row"
                onClick={() => onSelect({ kind: "footage", id: f.id })}
              >
                <div className="footage-icon">
                  <Clapperboard size={18} />
                </div>
                <div className="brand-row-main">
                  <div className="brand-row-name">{f.name}</div>
                  <div className="brand-row-tagline">
                    {f.resolution} · {f.colorProfile}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {mVoice.length > 0 && (
        <section>
          <div className="section-label">
            <span>{translate(lang, "search.group.voice")}</span>
            <span>{mVoice.length}</span>
          </div>
          <div className="brands-list">
            {mVoice.map((v) => (
              <article
                key={v.id}
                className="content-card content-card--interactive brand-row"
                onClick={() => onSelect({ kind: "voice", id: v.id })}
              >
                <div className="footage-icon">
                  <Mic size={18} />
                </div>
                <div className="brand-row-main">
                  <div className="brand-row-name">{v.title}</div>
                  <div className="brand-row-tagline">{v.transcript}</div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
