import { useState } from "react";
import { Check, Sparkles, X } from "lucide-react";
import type { Lang, McpStatusPayload } from "../types";
import { api } from "../api/client";
import { captureAppEvent } from "../telemetry";

interface Props { lang: Lang; status: McpStatusPayload | null; onComplete: () => void; onToast: (message: string) => void; }
export function OnboardingModal({ lang, status, onComplete, onToast }: Props) {
  const ar = lang === "ar";
  const clients = status?.clients || [];
  const [agent, setAgent] = useState("");
  const [busy, setBusy] = useState(false);
  const done = async () => { await api.putPrefs({ onboardingCompleted: true, ...(agent ? { selectedAgent: agent } : {}) }).catch(() => {}); captureAppEvent("onboarding_completed", { agentSelected: Boolean(agent) }); onComplete(); };
  const connect = async () => {
    if (!agent) return;
    setBusy(true);
    try { const result = await api.installMcpClient(agent); onToast(ar ? `تمت إضافة MOTIF إلى ${result.label}` : `MOTIF added to ${result.label}`); await done(); }
    catch (err) { onToast(err instanceof Error ? err.message : (ar ? "تعذر الربط" : "Could not connect")); }
    finally { setBusy(false); }
  };
  return <div className="onboarding-backdrop"><section className="onboarding-card glass" role="dialog" aria-modal="true" aria-labelledby="onboarding-title"><button className="btn btn--ghost icon-btn onboarding-close" onClick={done} aria-label="Close"><X size={16}/></button><div className="onboarding-mark"><Sparkles size={23}/></div><span className="eyebrow">MOTIF · {ar ? "الخطوة ١ من ١" : "QUICK SETUP"}</span><h2 id="onboarding-title">{ar ? "مرحباً بك في MOTIF" : "Welcome to MOTIF"}</h2><p>{ar ? "اختر وكيل الذكاء الاصطناعي الذي تستخدمه، وسنجهز الاتصال لك تلقائياً." : "Choose the AI agent you use and we'll set up the connection for you automatically."}</p><div className="onboarding-options">{clients.map((client) => <button key={client.id} className={agent === client.id ? "is-selected" : ""} onClick={() => setAgent(client.id)}><span>{client.label}</span><small>{client.configured ? (ar ? "متصل" : "Connected") : client.installed ? (ar ? "مكتشف" : "Detected") : (ar ? "إعداد سريع" : "Quick setup")}</small>{agent === client.id && <Check size={16}/>}</button>)}</div><button className="btn btn--primary onboarding-submit" disabled={!agent || busy} onClick={connect}><Sparkles size={16}/>{busy ? (ar ? "جارٍ الإعداد…" : "Setting up…") : (ar ? "إضافة MCP تلقائياً" : "Add MCP automatically")}</button><button className="onboarding-skip" onClick={done}>{ar ? "سأفعل ذلك لاحقاً" : "I'll do this later"}</button><small>{ar ? "لن تحتاج إلى نسخ أي كود." : "No code copying required."}</small></section></div>;
}
