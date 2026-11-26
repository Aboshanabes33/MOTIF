import {
  CalendarDays,
  Palette,
  Mic,
  Search,
  Cpu,
  Download,
} from "lucide-react";
import type { Lang, NavView } from "../types";
import { translate, type MessageKey } from "../i18n";

interface SidebarProps {
  activeView: NavView;
  onSelectView: (view: NavView) => void;
  lang: Lang;
  connected: boolean;
  brandsCount: number;
  projectsCount: number;
  version: string;
}

const PRIMARY_ITEMS: Array<{ id: NavView; labelKey: MessageKey; kbd: string; icon: typeof CalendarDays }> = [
  { id: "today", labelKey: "nav.today", kbd: "1", icon: CalendarDays },
  { id: "brands", labelKey: "nav.brands", kbd: "2", icon: Palette },
  { id: "voice", labelKey: "nav.voice", kbd: "3", icon: Mic },
  { id: "search", labelKey: "nav.search", kbd: "4", icon: Search },
];

const SYSTEM_ITEMS: Array<{ id: NavView; labelKey: MessageKey; kbd: string; icon: typeof Cpu }> = [
  { id: "mcp", labelKey: "nav.mcp", kbd: "5", icon: Cpu },
  { id: "releases", labelKey: "nav.releases", kbd: "6", icon: Download },
];

export function Sidebar({
  activeView,
  onSelectView,
  lang,
  connected,
  brandsCount,
  projectsCount,
  version,
}: SidebarProps) {
  return (
    <aside className="sidebar glass" aria-label="Primary navigation">
      <nav className="sidebar-nav">
        {PRIMARY_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${active ? "is-active" : ""}`}
              onClick={() => onSelectView(item.id)}
              aria-current={active ? "page" : undefined}
              title={translate(lang, item.labelKey)}
            >
              <Icon size={18} strokeWidth={1.85} />
              <span className="nav-item-label">{translate(lang, item.labelKey)}</span>
              <span className="nav-kbd">{item.kbd}</span>
            </button>
          );
        })}

        <div className="sidebar-sep" />

        {SYSTEM_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${active ? "is-active" : ""}`}
              onClick={() => onSelectView(item.id)}
              aria-current={active ? "page" : undefined}
              title={translate(lang, item.labelKey)}
            >
              <Icon size={18} strokeWidth={1.85} />
              <span className="nav-item-label">{translate(lang, item.labelKey)}</span>
              <span className="nav-kbd">{item.kbd}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="conn-row">
          <span className={`mint-dot ${connected ? "" : "is-off"}`} />
          <span className="conn-text">
            {translate(lang, connected ? "status.connected" : "status.offline")}
          </span>
        </div>
        <div className="sidebar-meta">
          <span>{translate(lang, "status.brandsCount", { n: brandsCount })}</span>
          <span>v{version}</span>
        </div>
        <div className="sidebar-meta">
          <span>{translate(lang, "status.projectsCount", { n: projectsCount })}</span>
          <span>Win · MCP</span>
        </div>
      </div>
    </aside>
  );
}
