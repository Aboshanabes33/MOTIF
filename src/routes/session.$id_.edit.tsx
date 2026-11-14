import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, MousePointer2, Pause, Play, Scissors, SkipBack, SkipForward, Undo2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell, Label } from "@/components/Shell";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/session/$id_/edit")({
  head: () => ({ meta: [
    { title: "Timeline editor — Motif" },
    { name: "description", content: "Review the final cut, clips and captions of your Motif edit." },
    { property: "og:title", content: "Timeline editor — Motif" },
    { property: "og:description", content: "Clips, captions and overlays generated in your style." },
  ] }),
  component: Editor,
});

const toSec = (t: string) => t.split(":").map(Number).reduce((a, b) => a * 60 + b, 0);
const fmt = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function Editor() {
  const { id } = Route.useParams();
  const { sessions, styles } = useStore();
  const session = sessions.find((s) => s.id === id);
  const plan = [...(session?.messages ?? [])].reverse().find((m) => m.plan)?.plan;
  const style = (styles.find((s) => s.id === session?.styleId) ?? styles[0])!;
  const total = plan ? Math.max(toSec(plan.duration), 60) : 1200;
  const [clips, setClips] = useState<{ start: number; len: number }[]>([]);
  useEffect(() => {
    const n = Math.min(plan?.cuts ?? 12, 24);
    setClips(Array.from({ length: n }, (_, i) => ({ start: (total / n) * i, len: total / n })));
  }, [plan, total]);
  const [sel, setSel] = useState(0);
  const [time, setTime] = useState(66);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setTime((v) => (v + 1 >= total ? 0 : v + 1)), 100);
    return () => clearInterval(t);
  }, [playing, total]);
  const caption = useMemo(() => [...(plan?.captions ?? [])].reverse().find((c) => toSec(c.t) <= time), [plan, time]);
  if (!session || !plan) return <AppShell title="Editor"><div className="p-8 text-sm text-muted-foreground">No finished edit yet. <Link to="/" className="underline">Start a session</Link>.</div></AppShell>;
  const pct = (s: number) => `${(s / total) * 100}%`;
  const clip = clips[sel];
  const split = () => {
    const c = clips[sel]; if (!c || time <= c.start || time >= c.start + c.len) return;
    const a = { start: c.start, len: time - c.start }, b = { start: time, len: c.start + c.len - time };
    setClips([...clips.slice(0, sel), a, b, ...clips.slice(sel + 1)]);
  };
  const right = (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div><Label>Final video</Label><div className="text-sm font-bold">{plan.filename}</div><div className="text-xs text-muted-foreground">Style: {style.name}</div><div className="font-mono text-[11px] text-muted-foreground">{plan.duration} | 1080p | {plan.cuts} cuts</div></div>
        <Link to="/session/$id" params={{ id }}><X className="size-4 text-muted-foreground" /></Link>
      </div>
      {clip && <div><Label>Selected clip</Label>
        <div className="space-y-1.5 rounded-lg border border-border bg-card p-3 text-xs">
          <div className="font-bold">Clip {String(sel + 1).padStart(2, "0")}</div>
          {[["Start", mmss(clip.start)], ["Duration", mmss(clip.len)], ["Speed", "1.0x"], ["Style", style.name]].map(([k, v]) => (
            <div key={k} className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className="font-mono">{v}</span></div>))}
        </div></div>}
      <div><Label>Captions</Label>
        <div className="space-y-2">{plan.captions.map((c, i) => (
          <button key={i} onClick={() => setTime(toSec(c.t))} className="flex w-full gap-3 text-left text-xs hover:text-brand-yellow">
            <span className="font-mono text-muted-foreground">{c.t}</span><span className="font-semibold">{c.text}</span></button>))}
        </div></div>
    </div>
  );
  return (
    <AppShell right={right} title={<span>{plan.filename}</span>}
      headerLeft={<Link to="/session/$id" params={{ id }} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-normal"><ChevronLeft className="size-3" />Back to chat</Link>}>
      <div className="flex h-full flex-col">
        <div className="px-4">
          <div className="relative mx-auto aspect-video max-h-[46vh] overflow-hidden rounded-lg border border-border" style={{ backgroundColor: style.colors[2] }}>
            <div className="absolute left-6 top-6 font-display text-3xl capitalize" style={{ color: style.colors[3] }}>{plan.filename.replace(/\.mp4$/, "").replace(/-/g, " ")}</div>
            <div className="absolute bottom-[30%] right-[18%] h-[60%] w-[18%] rounded-t-full bg-muted" style={{ transform: `scale(${1 + ((Math.floor(time / 3) % 2) * 0.04)})` }} />
            {caption && <div className="absolute inset-x-0 bottom-10 text-center font-display text-2xl uppercase" style={{ color: style.colors[0] }}>{caption.text}</div>}
            <div className="absolute bottom-6 left-6 h-1 w-10" style={{ backgroundColor: style.colors[0] }} />
            <div className="absolute bottom-4 right-4 text-lg" style={{ color: style.colors[3] }}>▲</div>
          </div>
          <div className="flex items-center justify-between py-2 font-mono text-xs">
            <span className="text-brand-blue">{fmt(time)}</span>
            <div className="flex items-center gap-4">
              <button onClick={() => setTime(Math.max(0, time - 10))}><SkipBack className="size-4" /></button>
              <button onClick={() => setPlaying(!playing)} className="grid size-8 place-items-center rounded-full bg-foreground text-background">{playing ? <Pause className="size-3.5" /> : <Play className="size-3.5 fill-current" />}</button>
              <button onClick={() => setTime(Math.min(total, time + 10))}><SkipForward className="size-4" /></button>
            </div>
            <span className="text-muted-foreground">{fmt(total)}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 border-y border-border px-4 py-1.5 text-xs">
          <MousePointer2 className="size-3.5" /><button onClick={split} className="flex items-center gap-1 hover:text-brand-yellow"><Scissors className="size-3.5" />Split</button><Undo2 className="size-3.5 text-muted-foreground" />
          <div className="ml-auto flex items-center gap-3"><button onClick={() => setZoom(Math.max(1, zoom - 0.5))}>−</button><span>Fit</span><button onClick={() => setZoom(Math.min(4, zoom + 0.5))}>+</button></div>
        </div>
        <div className="flex min-h-0 flex-1 text-xs">
          <div className="w-28 shrink-0 space-y-1 py-6 pl-3">
            {[["CC", "Captions", "text-brand-yellow"], ["V2", "Overlay", "text-brand-red"], ["V1", "Video", "text-brand-blue"], ["A1", "Voice", "text-brand-green"], ["A2", "Music", "text-brand-green"]].map(([k, n, c]) => (
              <div key={k} className="flex h-7 items-center gap-2"><span className={`font-mono text-[10px] ${c}`}>{k}</span>{n}</div>))}
          </div>
          <div className="relative flex-1 overflow-x-auto">
            <div className="relative h-full" style={{ width: `${zoom * 100}%` }}
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTime(Math.round(((e.clientX - r.left) / r.width) * total)); }}>
              <div className="flex h-5 border-b border-border font-mono text-[9px] text-muted-foreground">
                {Array.from({ length: 8 }).map((_, i) => <span key={i} className="flex-1 pl-1">{mmss((total / 8) * i)}</span>)}
              </div>
              <div className="space-y-1 pt-1">
                <div className="relative h-7">{plan.captions.map((c, i) => <span key={i} className="absolute top-1 h-5 w-2 rounded-sm bg-track-caption" style={{ left: pct(toSec(c.t)) }} />)}</div>
                <div className="relative h-7"><span className="absolute inset-y-0 left-0 right-2 flex items-center rounded-md bg-track-overlay px-2">▲ {style.logo ?? "logo"}</span></div>
                <div className="relative h-7">{clips.map((c, i) => (
                  <button key={i} onClick={(e) => { e.stopPropagation(); setSel(i); setTime(Math.round(c.start)); }}
                    className={`absolute inset-y-0 truncate rounded-md border bg-track-video px-1 text-left text-[10px] ${sel === i ? "border-foreground" : "border-background"}`}
                    style={{ left: pct(c.start), width: pct(c.len) }}>Clip {String(i + 1).padStart(2, "0")}</button>))}</div>
                <div className="relative h-7 overflow-hidden rounded-md bg-track-voice">
                  <div className="flex h-full items-center gap-px px-1">{Array.from({ length: 160 }).map((_, i) => <span key={i} className="w-full bg-foreground/40" style={{ height: `${20 + ((i * 37) % 70)}%` }} />)}</div>
                </div>
                <div className="relative h-7 rounded-md bg-track-music px-2 leading-7">Music bed</div>
              </div>
              <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-brand-red" style={{ left: pct(time) }} />
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
