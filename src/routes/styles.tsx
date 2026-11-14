import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FileText, Film, Globe, Pencil } from "lucide-react";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/Shell";
import { useStore } from "@/lib/store";
import { extractStyle } from "@/lib/ai.functions";

export const Route = createFileRoute("/styles")({
  head: () => ({ meta: [
    { title: "Style Library — Motif" },
    { name: "description", content: "Teach Motif a style once from a video, style file, website or manual input." },
    { property: "og:title", content: "Style Library — Motif" },
    { property: "og:description", content: "Add a style once. It gets reused on every edit." },
  ] }),
  component: Styles,
});

function Styles() {
  const { styles, addStyle, setActiveStyleId } = useStore();
  const nav = useNavigate();
  const run = useServerFn(extractStyle);
  const [busy, setBusy] = useState(false);
  const learn = async (kind: "md" | "url" | "video", content: string, label: string, src: string) => {
    setBusy(true);
    const { style, error } = await run({ data: { kind, content } }).catch(() => ({ style: null, error: "Failed" }));
    setBusy(false);
    if (!style) return toast.error(error ?? "Failed");
    const id = addStyle({ ...style, kind: label, source: src });
    setActiveStyleId(id); toast.success(`Learned "${style.name}"`);
  };
  const pick = (accept: string, cb: (f: File) => void) => {
    const i = document.createElement("input"); i.type = "file"; i.accept = accept;
    i.onchange = () => i.files?.[0] && cb(i.files[0]); i.click();
  };
  const cards = [
    { icon: Film, t: "Reference video", d: "Upload a clip you like. We read its colors, type and pacing.",
      go: () => pick("video/*", (f) => learn("video", f.name, "Video reference", f.name)) },
    { icon: FileText, t: "Style file", d: "Add a .md file with your colors, fonts and tone.",
      go: () => pick(".md,.txt", async (f) => learn("md", await f.text(), "Design system", f.name)) },
    { icon: Pencil, t: "Manual", d: "Type your colors and upload your logo.", go: () => {
      const name = prompt("Style name?"); if (!name) return;
      const colors = (prompt("5 hex colors, comma separated", "#FFD400,#FF2020,#0B0B0F,#FFFFFF,#2A7BFF") ?? "").split(",").map((c) => c.trim()).filter(Boolean);
      const display = prompt("Display font", "Anton") ?? "Anton";
      const id = addStyle({ name, kind: "Manual", source: "Typed by you", colors, display, body: "Inter", motion: ["Cut every 3s", "Captions on"] });
      setActiveStyleId(id);
    } },
    { icon: Globe, t: "Website", d: "Paste your site URL and we pull the look from it.", go: () => {
      const u = prompt("Website URL"); if (u) learn("url", u, "Website", u);
    } },
  ];
  return (
    <AppShell title="Style Library">
      <div className="h-full overflow-y-auto px-6 py-4">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-xl font-bold">Teach it a style once</h1>
          <p className="text-sm text-muted-foreground">Add a style any way you like. It gets reused on every edit.{busy && " Reading style…"}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {cards.map((c) => (
              <button key={c.t} disabled={busy} onClick={c.go} className="rounded-xl border border-border bg-card p-4 text-left hover:bg-accent disabled:opacity-50">
                <span className="grid size-8 place-items-center rounded-md bg-secondary"><c.icon className="size-4" /></span>
                <div className="mt-6 text-sm font-semibold">{c.t}</div><div className="text-xs text-muted-foreground">{c.d}</div>
              </button>
            ))}
          </div>
          <h2 className="mt-8 font-bold">Your styles</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            {styles.map((s) => (
              <div key={s.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex h-8 overflow-hidden rounded-md">{s.colors.map((c, i) => <span key={i} className="flex-1" style={{ backgroundColor: c }} />)}</div>
                <div className="mt-3 text-sm font-bold">{s.name}</div><div className="text-xs text-muted-foreground">{s.kind}</div>
                <div className="truncate font-mono text-[11px] text-muted-foreground">{s.source}</div>
                <button onClick={() => { setActiveStyleId(s.id); nav({ to: "/" }); }} className="mt-3 w-full rounded-md border border-border py-1.5 text-xs font-semibold hover:bg-accent">Use in new session</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
