import { Link } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { toast } from "sonner";
import type { EditPlan } from "@/lib/ai.functions";
import type { Style } from "@/lib/store";

export function ResultCard({ plan, style, sessionId, onRevise }: { plan: EditPlan; style: Style; sessionId: string; onRevise: () => void }) {
  const title = plan.filename.replace(/\.mp4$/, "").replace(/-/g, " ");
  return (
    <div className="flex gap-4 rounded-xl border border-border bg-card p-3">
      <Link to="/session/$id/edit" params={{ id: sessionId }} className="relative grid aspect-video w-56 shrink-0 place-items-center overflow-hidden rounded-lg" style={{ backgroundColor: style.colors[2] }}>
        <span className="absolute bottom-5 left-3 right-3 truncate text-center font-display text-sm capitalize" style={{ color: style.colors[3] }}>{title}</span>
        <span className="absolute bottom-3 left-3 h-0.5 w-6" style={{ backgroundColor: style.colors[0] }} />
        <span className="grid size-8 place-items-center rounded-full bg-background/80"><Play className="size-3.5 fill-current" /></span>
      </Link>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{plan.filename}</div>
        <div className="font-mono text-[11px] text-muted-foreground">{plan.duration} | 1080p | {plan.cuts} cuts</div>
        <div className="mt-2 space-y-1.5">
          {(["VIDEO", "CAPTION", "LOGO"] as const).map((t, ti) => (
            <div key={t} className="flex items-center gap-2">
              <span className="w-12 font-mono text-[8px] text-muted-foreground">{t}</span>
              <div className="flex h-1.5 flex-1 gap-1">
                {ti === 2 ? <span className="flex-1 rounded-full" style={{ backgroundColor: style.colors[4] }} /> :
                  Array.from({ length: 12 }).map((_, i) => <span key={i} className="flex-1 rounded-full" style={{ backgroundColor: (i * (ti + 3)) % 5 === 0 ? style.colors[0] : "var(--muted)" }} />)}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={() => toast("Sample preview only — no real video was rendered.")} className="rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground">Download</button>
          <button onClick={onRevise} className="rounded-md border border-border px-4 py-1.5 text-xs font-semibold hover:bg-accent">Revise</button>
        </div>
      </div>
    </div>
  );
}
