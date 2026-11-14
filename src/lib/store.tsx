import { createContext, useContext, useState, type ReactNode } from "react";
import type { EditPlan } from "./ai.functions";

export type Style = {
  id: string; name: string; kind: string; source: string;
  colors: string[]; display: string; body: string; logo?: string; logoUrl?: string; motion: string[];
};
export type Message = { id: string; role: "user" | "assistant"; text: string; files?: string[]; styleId?: string; plan?: EditPlan; error?: boolean };
export type Session = { id: string; title: string; styleId: string; messages: Message[] };

export const uid = () => Math.random().toString(36).slice(2, 9);

const initialStyles: Style[] = [
  { id: "energetic", name: "Energetic Challenge", kind: "Video reference", source: "challenge-ref.mp4, 12:40",
    colors: ["#FFD400", "#FF2020", "#0B0B0F", "#FFFFFF", "#2A7BFF"], display: "Anton, heavy condensed caps", body: "Inter Bold", logo: "logo.svg",
    motion: ["Cut every 2.4s", "Punch-in zoom on beats", "Pop captions, 2 words at a time"] },
  { id: "brand", name: "My Brand", kind: "Design system", source: "brand-kit.zip, tokens and fonts",
    colors: ["#1FC59A", "#FFB800", "#0F1A2B", "#F5F5F5", "#7B5CFF"], display: "Space Grotesk Bold", body: "Inter Regular", logo: "brand-mark.svg",
    motion: ["Smooth 0.4s crossfades", "Lower-third name tags", "Captions in brand green"] },
  { id: "explainer", name: "Clean Explainer", kind: "Video reference", source: "explainer-ref.mp4, 8:12",
    colors: ["#2F7BF6", "#10B07A", "#F5F5F2", "#1E2433", "#F5A30F"], display: "DM Sans Bold", body: "DM Sans Regular",
    motion: ["Cut every 5s", "Slow push-ins", "Full-sentence captions at bottom"] },
];

const samplePlan: EditPlan = {
  reply: "Finished. This edit is not real: no video was rendered, so the output is sample data. Click the final video to see its timeline and captions on the right.",
  steps: [
    { title: "Style applied", detail: "Yellow and red on black with heavy condensed type, taken from your reference video." },
    { title: "Brand layer", detail: "Your logo bottom-right, name tags, and an end card." },
    { title: "Pacing", detail: "38 cuts, silences trimmed, punch-in zooms on key moments." },
    { title: "Captions", detail: "Word-pop captions in Anton, key words highlighted in yellow." },
  ],
  filename: "channel-intro-edit.mp4", duration: "20:04", cuts: 38,
  captions: ["Welcome back to the channel", "Here is the big idea", "Step one: set it up", "The mistake most people make", "Subscribe for part two", "Let us look at an example", "This is the key part", "Watch what happens next", "Welcome back to the channel", "Here is the big idea"].map((text, i) => ({ t: `${String(Math.floor((i * 115 + 3) / 60)).padStart(2, "0")}:${String((i * 115 + 3) % 60).padStart(2, "0")}`, text })),
};

const initialSessions: Session[] = [
  { id: "intro", title: "Channel intro edit", styleId: "energetic", messages: [
    { id: "m1", role: "user", text: "Edit the 20-minute raw footage in my active style. Add my logo and keep captions on.", files: ["raw-footage-20min.mp4"], styleId: "energetic" },
    { id: "m2", role: "assistant", text: samplePlan.reply, plan: samplePlan },
  ] },
  { id: "demo", title: "Product demo, 20 min", styleId: "brand", messages: [] },
  { id: "shorts", title: "Shorts batch", styleId: "energetic", messages: [] },
];

type Ctx = {
  styles: Style[]; sessions: Session[]; activeStyleId: string;
  setActiveStyleId: (id: string) => void;
  addStyle: (s: Omit<Style, "id">) => string;
  createSession: (title?: string, styleId?: string) => string;
  updateSession: (id: string, fn: (s: Session) => Session) => void;
};
const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [styles, setStyles] = useState(initialStyles);
  const [sessions, setSessions] = useState(initialSessions);
  const [activeStyleId, setActiveStyleId] = useState("energetic");
  const value: Ctx = {
    styles, sessions, activeStyleId, setActiveStyleId,
    addStyle: (s) => { const id = uid(); setStyles((p) => [...p, { ...s, id }]); return id; },
    createSession: (title = "New session", styleId) => {
      const id = uid();
      setSessions((p) => [{ id, title, styleId: styleId ?? activeStyleId, messages: [] }, ...p]);
      return id;
    },
    updateSession: (id, fn) => setSessions((p) => p.map((s) => (s.id === id ? fn(s) : s))),
  };
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("StoreProvider missing");
  return c;
}
export function useStyle(id?: string) {
  const { styles, activeStyleId } = useStore();
  return (styles.find((s) => s.id === (id ?? activeStyleId)) ?? styles[0])!;
}
