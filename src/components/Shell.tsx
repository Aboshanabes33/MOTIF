import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Check, Folder, Palette, PanelLeft, PanelRight, Plus, PlusCircle, User } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useStore, useStyle, type Style } from "@/lib/store";

export function Logo() {
  return (
    <div className="grid grid-cols-2 gap-[2px] size-4">
      <span className="rounded-[2px] bg-brand-yellow" /><span className="rounded-full bg-brand-red" />
      <span className="rounded-[2px] bg-brand-blue" /><span className="rounded-[2px] bg-brand-green" />
    </div>
  );
}

export function StyleIcon({ style, size = "size-5" }: { style: Style; size?: string }) {
  return (
    <div className={`grid grid-cols-2 overflow-hidden rounded-[4px] ${size}`}>
      {style.colors.slice(0, 4).map((c, i) => <span key={i} style={{ backgroundColor: c }} />)}
    </div>
  );
}

function Sidebar() {
  const { sessions, styles, activeStyleId, setActiveStyleId } = useStore();
  const nav = useNavigate();
  const params = useParams({ strict: false }) as { id?: string };
  return (
    <aside className="flex w-[230px] shrink-0 flex-col bg-panel px-2 py-3">
      <div className="flex items-center justify-between px-2 pb-4">
        <Link to="/" className="flex items-center gap-2"><Logo /><span className="text-sm font-bold tracking-[0.2em]">MOTIF</span></Link>
        <PanelLeft className="size-4 text-muted-foreground" />
      </div>
      <button onClick={() => nav({ to: "/" })} className="flex items-center justify-center gap-2 rounded-lg bg-secondary py-2.5 text-sm font-medium hover:bg-accent">
        <PlusCircle className="size-4" /> New Session
      </button>
      <Link to="/styles" className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-accent" activeProps={{ className: "bg-accent" }}>
        <Palette className="size-4" /> Style Library
      </Link>
      <div className="mt-5 px-3 text-xs text-muted-foreground">Workspace</div>
      <div className="mt-2 flex items-center gap-2 px-3 py-1.5 text-sm"><Folder className="size-4 text-muted-foreground" /> Default workspace</div>
      <div className="flex flex-col overflow-y-auto">
        {sessions.map((s) => (
          <Link key={s.id} to="/session/$id" params={{ id: s.id }}
            className={`truncate rounded-md px-5 py-1.5 text-sm hover:bg-accent ${params.id === s.id ? "bg-accent" : "text-foreground/85"}`}>
            {s.title}
          </Link>
        ))}
      </div>
      <div className="mt-5 flex items-center justify-between px-3 text-xs text-muted-foreground">
        Styles <Link to="/styles"><Plus className="size-3.5" /></Link>
      </div>
      <div className="mt-2 flex flex-col gap-0.5">
        {styles.map((st) => (
          <button key={st.id} onClick={() => setActiveStyleId(st.id)}
            className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-accent ${activeStyleId === st.id ? "bg-accent" : ""}`}>
            <StyleIcon style={st} />
            <div className="min-w-0"><div className="truncate text-sm font-medium">{st.name}</div><div className="text-[11px] text-muted-foreground">{st.kind}</div></div>
          </button>
        ))}
      </div>
      <div className="mt-auto flex items-center gap-2 px-2 pt-3 text-sm">
        <span className="grid size-6 place-items-center rounded-full bg-secondary"><User className="size-3.5" /></span> My Studio
      </div>
    </aside>
  );
}

export function StylePanel({ styleId }: { styleId?: string }) {
  const s = useStyle(styleId);
  return (
    <div className="space-y-5">
      <div>
        <Label>Active style</Label>
        <div className="text-lg font-bold">{s.name}</div>
        <div className="text-xs text-muted-foreground">{s.source}</div>
      </div>
      <div>
        <Label>Colors</Label>
        <div className="flex gap-2">
          {s.colors.map((c) => (
            <div key={c} className="text-center">
              <div className="size-9 rounded-md border border-border" style={{ backgroundColor: c }} />
              <div className="mt-1 font-mono text-[9px] text-muted-foreground">{c.replace("#", "")}</div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <Label>Typography</Label>
        <div className="space-y-2">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
            <span className="font-display text-2xl">Aa</span>
            <div><div className="text-[11px] text-muted-foreground">Display</div><div className="text-xs font-semibold">{s.display}</div></div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
            <span className="text-2xl">Aa</span>
            <div><div className="text-[11px] text-muted-foreground">Body</div><div className="text-xs font-semibold">{s.body}</div></div>
          </div>
        </div>
      </div>
      <div>
        <Label>Logo</Label>
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center overflow-hidden rounded-md bg-foreground text-background">
            {s.logoUrl ? <img src={s.logoUrl} alt="logo" className="size-full object-contain" /> : <span className="text-lg">▲</span>}
          </div>
          <div><div className="text-xs font-semibold">{s.logo ?? "No logo"}</div><div className="text-[11px] text-muted-foreground">Bottom-right, 12% width</div></div>
        </div>
      </div>
      <div>
        <Label>Motion</Label>
        <ul className="space-y-1.5">
          {s.motion.map((m) => <li key={m} className="flex items-center gap-2 text-xs"><Check className="size-3.5 text-brand-green" />{m}</li>)}
        </ul>
      </div>
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</div>;
}

export function AppShell({ title, children, right, headerLeft }: { title: ReactNode; children: ReactNode; right?: ReactNode; headerLeft?: ReactNode }) {
  const [showRight, setShowRight] = useState(true);
  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 px-4 text-sm font-semibold">
          {headerLeft}{title}
          {right && <button onClick={() => setShowRight((v) => !v)} className="ml-auto text-muted-foreground hover:text-foreground"><PanelRight className="size-4" /></button>}
        </header>
        <div className="min-h-0 flex-1">{children}</div>
      </main>
      {right && showRight && <aside className="w-[260px] shrink-0 overflow-y-auto bg-panel p-4">{right}</aside>}
    </div>
  );
}
