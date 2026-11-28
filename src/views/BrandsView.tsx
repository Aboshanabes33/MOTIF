import { ArrowLeft, Film, Loader2, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import type { Brand, Lang, Project, SelectedItem } from "../types";
import { translate } from "../i18n";

interface BrandsViewProps {
  lang: Lang;
  brands: Brand[];
  projects: Project[];
  selected: SelectedItem;
  onSelect: (item: SelectedItem) => void;
  onAddBrand: () => void;
  onEditBrand: (brand: Brand) => void;
  onDeleteBrand: (brand: Brand) => void;
  onOpenVideo: (project: Project) => void;
  onLoadExample: () => Promise<void>;
  exampleBusy?: boolean;
}

export function BrandsView({
  lang,
  brands,
  projects,
  selected,
  onSelect,
  onAddBrand,
  onEditBrand,
  onDeleteBrand,
  onOpenVideo,
  onLoadExample,
  exampleBusy = false,
}: BrandsViewProps) {
  const isAr = lang === "ar";
  const exampleLabel = translate(lang, "brands.example");
  const exampleHint = translate(lang, "brands.exampleHint");

  const ExampleButton = ({ primary = false }: { primary?: boolean }) => (
    <button
      type="button"
      className={`btn ${primary ? "btn--primary" : ""}`}
      onClick={() => {
        void onLoadExample();
      }}
      disabled={exampleBusy}
      title={exampleHint}
    >
      {exampleBusy ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
      {exampleLabel}
    </button>
  );

  const activeBrand = selected?.kind === "brand" ? brands.find((brand) => brand.id === selected.id) : undefined;
  const brandProjects = activeBrand ? projects.filter((project) => project.brandId === activeBrand.id) : [];

  if (activeBrand) {
    return (
      <div className="brand-hub">
        <button className="btn btn--ghost" onClick={() => onSelect(null)}>
          <ArrowLeft size={15} />
          {isAr ? "كل البراندات" : "All brands"}
        </button>
        <header className="brand-hub-header">
          <div
            className="brand-tile brand-hub-logo"
            style={{
              background: activeBrand.logo
                ? "#0c2729"
                : `linear-gradient(135deg, ${activeBrand.colors[0]}, ${activeBrand.colors[1] || "#0c2729"})`,
            }}
          >
            {activeBrand.logo ? <img src={activeBrand.logo} alt="" /> : activeBrand.name.slice(0, 1)}
          </div>
          <div>
            <span className="eyebrow">{isAr ? "مساحة البراند" : "BRAND HUB"}</span>
            <h2>{activeBrand.name}</h2>
            <p>{activeBrand.tagline || activeBrand.voice}</p>
          </div>
          <button className="btn" onClick={() => onEditBrand(activeBrand)}>
            <Pencil size={14} />
            {isAr ? "تعديل الهوية" : "Edit identity"}
          </button>
        </header>
        <div className="brand-hub-section">
          <div>
            <h3>{isAr ? "الفيديوهات المعدلة بالذكاء الاصطناعي" : "AI-edited videos"}</h3>
            <p>
              {isAr
                ? "اختر فيديو لعرض التعديل والمشاهد والتعليقات التي أنشأها الوكيل."
                : "Open a video to explore its scenes, captions, and the agent's creative decisions."}
            </p>
          </div>
          <span className="pill-badge">
            {brandProjects.length} {isAr ? "فيديو" : "videos"}
          </span>
        </div>
        {brandProjects.length ? (
          <div className="brand-video-grid">
            {brandProjects.map((project) => (
              <button key={project.id} className="brand-video-card" onClick={() => onOpenVideo(project)}>
                <div
                  className="brand-video-art"
                  style={{ background: `linear-gradient(135deg, ${project.accentFrom}, ${project.accentTo})` }}
                >
                  <Film size={23} />
                  <span className="brand-video-duration">{project.durationSec}s</span>
                  <span className="brand-video-ai">
                    <Sparkles size={12} />
                    AI EDIT
                  </span>
                </div>
                <strong>{project.name}</strong>
                <small>
                  {project.aspect} · {project.aiEdit?.stats?.scenes ?? 0} {isAr ? "مشاهد" : "scenes"}
                </small>
              </button>
            ))}
          </div>
        ) : (
          <div className="content-card empty-state">
            <Film size={24} />
            <p>{isAr ? "لا توجد فيديوهات لهذا البراند حتى الآن." : "No videos for this brand yet."}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="brand-list-view">
      <div className="brand-list-heading">
        <div>
          <h2>{isAr ? "هوياتك الإبداعية" : "Your creative identities"}</h2>
          <p>
            {isAr
              ? "كل براند يجمع الفيديوهات والنبرة والألوان في مكان واحد."
              : "Each brand brings its videos, voice, and visual identity together."}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <ExampleButton />
          <button type="button" className="btn btn--primary" onClick={onAddBrand}>
            <Plus size={15} />
            {isAr ? "إضافة براند" : "Add brand"}
          </button>
        </div>
      </div>

      {brands.length ? (
        <div className="brands-list">
          {brands.map((brand) => {
            const linkedCount = projects.filter((p) => p.brandId === brand.id).length;
            return (
              <article
                key={brand.id}
                className="content-card content-card--interactive brand-row"
                onClick={() => onSelect({ kind: "brand", id: brand.id })}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSelect({ kind: "brand", id: brand.id });
                }}
              >
                <div
                  className="brand-tile"
                  style={{
                    background: brand.logo
                      ? "#0c2729"
                      : `linear-gradient(135deg, ${brand.colors[0]}, ${brand.colors[1] || "#0c2729"})`,
                  }}
                >
                  {brand.logo ? <img src={brand.logo} alt="" /> : brand.name.slice(0, 1)}
                </div>
                <div className="brand-row-main">
                  <strong className="brand-row-name">{brand.name}</strong>
                  <div className="brand-row-tagline">
                    {brand.tagline || brand.voice || (isAr ? "لا يوجد وصف بعد" : "Add a brand description")}
                  </div>
                </div>
                <span className="pill-badge">
                  <Film size={12} />
                  {linkedCount} {isAr ? "فيديو" : "videos"}
                </span>
                <div className="brand-row-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="btn btn--ghost icon-btn" onClick={() => onEditBrand(brand)} aria-label="Edit">
                    <Pencil size={15} />
                  </button>
                  <button className="btn btn--ghost icon-btn" onClick={() => onDeleteBrand(brand)} aria-label="Delete">
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="content-card empty-state">
          <Sparkles size={26} />
          <p>
            {isAr
              ? "ما فيه براندات بعد. أضف براندك، أو حمّل مثالاً وحدة تشوف شكل الهوية الكاملة."
              : translate(lang, "brands.empty")}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn--primary" onClick={onAddBrand}>
              <Plus size={15} />
              {isAr ? "إضافة براند" : "Add brand"}
            </button>
            <ExampleButton />
          </div>
        </div>
      )}
    </div>
  );
}
