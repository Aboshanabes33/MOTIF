import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Paperclip } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { AppShell, StyleIcon, StylePanel } from "@/components/Shell";
import { Composer } from "@/components/Composer";
import { ResultCard } from "@/components/ResultCard";
import { useStore } from "@/lib/store";
import { useSend } from "@/lib/useSend";
import { pendingSend } from "@/lib/pending";

export const Route = createFileRoute("/session/$id")({
  head: () => ({ meta: [
    { title: "Edit session — Motif" },
    { name: "description", content: "Chat with Motif to edit your footage in your saved style." },
    { property: "og:title", content: "Edit session — Motif" },
    { property: "og:description", content: "AI video edits that follow your style." },
  ] }),
  component: SessionPage,
});

function SessionPage() {
  const { id } = Route.useParams();
  const { sessions, styles } = useStore();
  const session = sessions.find((s) => s.id === id);
  const { send, busyId } = useSend();
  const [draft, setDraft] = useState<string | undefined>();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const p = pendingSend.take(id);
    if (p) send(id, p.text, p.files, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [session?.messages.length, busyId]);
  if (!session) return <AppShell title="Not found"><div className="p-8 text-sm text-muted-foreground">This session is gone (sessions reset on refresh). <Link to="/" className="underline">Start a new one</Link>.</div></AppShell>;
  const busy = busyId === id;
  return (
    <AppShell title={session.title} right={<StylePanel />}>
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-y-auto px-6">
          <div className="mx-auto max-w-2xl space-y-5 py-4">
            {session.messages.length === 0 && !busy && <p className="py-16 text-center text-sm text-muted-foreground">Describe the edit below — your active style is applied automatically.</p>}
            {session.messages.map((m) => {
              const st = styles.find((s) => s.id === m.styleId);
              if (m.role === "user") return (
                <div key={m.id} className="flex flex-col items-end gap-1.5">
                  <div className="max-w-[80%] rounded-xl bg-secondary px-3.5 py-2.5 text-sm">{m.text}</div>
                  <div className="flex gap-1.5">
                    {m.files?.map((f) => <span key={f} className="flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px]"><Paperclip className="size-3" />{f}</span>)}
                    {st && <span className="flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px]"><StyleIcon style={st} size="size-3" />{st.name}</span>}
                  </div>
                </div>
              );
              return (
                <div key={m.id} className="space-y-3 text-sm">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">Thought for a while <ChevronRight className="size-3" /></div>
                  <div className={m.error ? "text-destructive" : "font-semibold"}><ReactMarkdown>{m.text}</ReactMarkdown></div>
                  {m.plan && (
                    <>
                      <ol className="list-decimal space-y-1 pl-5">
                        {m.plan.steps.map((s) => <li key={s.title}><b>{s.title}</b> <span className="text-foreground/85">{s.detail}</span></li>)}
                      </ol>
                      <ResultCard plan={m.plan} style={styles.find((s) => s.id === session.styleId) ?? styles[0]!} sessionId={id} onRevise={() => setDraft("Revise: ")} />
                    </>
                  )}
                </div>
              );
            })}
            {busy && <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="size-2 animate-pulse rounded-full bg-brand-yellow" /> Thinking and applying your style…</div>}
            <div ref={end} />
          </div>
        </div>
        <div className="mx-auto w-full max-w-2xl px-6 pb-4">
          <Composer busy={busy} initial={draft} placeholder="Ask for changes, / commands, @ styles or clips" onSend={(t, f) => send(id, t, f)} />
        </div>
      </div>
    </AppShell>
  );
}
