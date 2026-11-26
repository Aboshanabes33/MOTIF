import { Plus, Pencil, Trash2, Cpu } from "lucide-react";
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
}: BrandsViewProps) {
  const projectCountByBrand = new Map<string, number>();
  for (const p of projects) {
    if (p.brandId) {
      projectCountByBrand.set(p.brandId, (projectCountByBrand.get(p.brandId) || 0) + 1);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span className="pill-badge pill-badge--accent">
          <Cpu size={12} />
          {translate(lang, "brands.mcpVisible")} · prefs.json
        </span>
        <button type="button" className="btn btn--primary" onClick={onAddBrand}>
          <Plus size={15} />
          {translate(lang, "brands.add")}
        </button>
      </div>

      {brands.length === 0 ? (
        <div className="content-card empty-state">
          <p style={{ margin: 0, maxWidth: 440 }}>{translate(lang, "brands.empty")}</p>
          <button type="button" className="btn btn--primary" onClick={onAddBrand}>
            <Plus size={15} />
            {translate(lang, "brands.add")}
          </button>
        </div>
      ) : (
        <div className="brands-list">
          {brands.map((brand) => {
            const isSelected = selected?.kind === "brand" && selected.id === brand.id;
            const linkedCount = projectCountByBrand.get(brand.id) || 0;
            return (
              <article
                key={brand.id}
                className={`content-card content-card--interactive brand-row ${isSelected ? "is-selected" : ""}`}
                onClick={() => onSelect({ kind: "brand", id: brand.id })}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect({ kind: "brand", id: brand.id });
                  }
                }}
              >
                {/* 44px brand swatch / logo tile, radius 13px per DESIGN.md */}
                <div
                  className="brand-tile"
                  style={{
                    background: brand.logo
                      ? "#0c2729"
                      : `linear-gradient(135deg, ${brand.colors[0] || "#2f7268"}, ${brand.colors[1] || "#0c2729"})`,
                  }}
                >
                  {brand.logo ? (
                    <img src={brand.logo} alt={brand.name} />
                  ) : (
                    brand.name.slice(0, 1).toUpperCase()
                  )}
                </div>

                <div className="brand-row-main">
                  <div className="brand-row-top">
                    <span className="brand-row-name">{brand.name}</span>
                    <div className="brand-swatches" aria-label="Brand colors">
                      {brand.colors.map((hex) => (
                        <span
                          key={hex}
                          className="swatch-chip"
                          style={{ background: hex }}
                          title={hex}
                        />
                      ))}
                    </div>
                    <span className="pill-badge">
                      {translate(lang, "brands.projectsLinked", { n: linkedCount })}
                    </span>
                  </div>
                  <div className="brand-row-tagline">
                    {brand.tagline || brand.voice || brand.channels || "—"}
                  </div>
                </div>

                <div className="brand-row-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="btn btn--ghost icon-btn"
                    title={translate(lang, "brands.edit")}
                    aria-label={`${translate(lang, "brands.edit")} ${brand.name}`}
                    onClick={() => onEditBrand(brand)}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost icon-btn"
                    title={translate(lang, "brands.delete")}
                    aria-label={`${translate(lang, "brands.delete")} ${brand.name}`}
                    onClick={() => onDeleteBrand(brand)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
