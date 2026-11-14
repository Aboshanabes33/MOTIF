import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, Logo, StylePanel } from "@/components/Shell";
import { Composer } from "@/components/Composer";
import { useStore } from "@/lib/store";
import { pendingSend } from "@/lib/pending";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "New session — Motif" },
    { name: "description", content: "Pick a style, attach your footage, and describe the edit. Motif applies your style automatically." },
    { property: "og:title", content: "Motif — AI video edits in your style" },
    { property: "og:description", content: "Teach it a style once. Every AI edit follows it." },
  ] }),
  component: Index,
});

const chips = ["Edit my 20-minute YouTube video", "Cut five shorts from this clip", "Add captions and my logo to a recording"];

function Index() {
  const { createSession } = useStore();
  const nav = useNavigate();
  const [draft, setDraft] = useState<string | undefined>();
  return (
    <AppShell title="New session" right={<StylePanel />}>
      <div className="flex h-full flex-col px-6 pb-4">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="scale-[1.6]"><Logo /></div>
          <h1 className="mt-6 text-2xl font-bold">What should we edit?</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pick a style, attach your footage, and describe the edit.</p>
          <div className="mt-5 flex max-w-md flex-wrap justify-center gap-2">
            {chips.map((c) => (
              <button key={c} onClick={() => setDraft(c)} className="rounded-lg bg-secondary px-3 py-1.5 text-xs hover:bg-accent">{c}</button>
            ))}
          </div>
        </div>
        <div className="mx-auto w-full max-w-2xl">
          <Composer initial={draft} placeholder="Describe the edit you want, / commands, @ styles or clips"
            onSend={(text, files) => {
              const id = createSession(text.slice(0, 40));
              pendingSend.set({ id, text, files });
              nav({ to: "/session/$id", params: { id } });
            }} />
        </div>
      </div>
    </AppShell>
  );
}
