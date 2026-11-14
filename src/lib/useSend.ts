import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { chatEdit } from "./ai.functions";
import { uid, useStore, type Message } from "./store";

export function useSend() {
  const { updateSession, styles, activeStyleId, sessions } = useStore();
  const call = useServerFn(chatEdit);
  const [busyId, setBusyId] = useState<string | null>(null);
  const send = async (sessionId: string, text: string, files: string[], prior?: Message[]) => {
    const style = styles.find((s) => s.id === activeStyleId)!;
    const user: Message = { id: uid(), role: "user", text, files, styleId: style.id };
    const history = [...(prior ?? sessions.find((s) => s.id === sessionId)?.messages ?? []), user];
    updateSession(sessionId, (s) => ({ ...s, styleId: style.id, title: s.messages.length ? s.title : text.slice(0, 40), messages: [...s.messages, user] }));
    setBusyId(sessionId);
    try {
      const allFiles = history.flatMap((m) => m.files ?? []);
      const { plan, error } = await call({ data: {
        style: { name: style.name, colors: style.colors, display: style.display, body: style.body, logo: style.logo, motion: style.motion },
        history: history.map((m) => ({ role: m.role, text: m.plan ? `${m.text} Steps: ${m.plan.steps.map((s) => `${s.title}: ${s.detail}`).join(" | ")}` : m.text })),
        files: allFiles,
      } });
      const msg: Message = plan ? { id: uid(), role: "assistant", text: plan.reply, plan } : { id: uid(), role: "assistant", text: error ?? "Something went wrong.", error: true };
      updateSession(sessionId, (s) => ({ ...s, messages: [...s.messages, msg] }));
    } catch {
      updateSession(sessionId, (s) => ({ ...s, messages: [...s.messages, { id: uid(), role: "assistant", text: "Couldn't reach the AI. Try again.", error: true }] }));
    } finally {
      setBusyId(null);
    }
  };
  return { send, busyId };
}
