import { useEffect, useState } from "react";
import { Activity, ArrowDownToLine, Check, ChevronRight, Cpu, LockKeyhole, Settings2, ShieldCheck, Sparkles, X } from "lucide-react";
import type { Lang, McpStatusPayload, ReleasesPayload, WorkspacePrefs } from "../types";
import { api } from "../api/client";
import { McpView } from "../views/McpView";
import { VideoAgentView } from "../views/VideoAgentView";
import { ReleaseView } from "../views/ReleaseView";
import { captureAppEvent } from "../telemetry";

import { AccountPane } from "../auth/AuthGate";
type Pane = "connect" | "video" | "account" | "updates" | "privacy" | "technical";
interface Props { lang: Lang; version: string; status: McpStatusPayload | null; releases: ReleasesPayload | null; prefs: WorkspacePrefs; onPrefs: (prefs: Partial<WorkspacePrefs>) => void; onClose: () => void; onToast: (message: string) => void; onAfterInvoke: () => void; }
const paneLabels: Record<Pane, [string,string]> = { connect:["Connect agent","ربط الوكيل"], video:["Video agent","وكيل الفيديو"], account:["Account","الحساب"], updates:["Version & updates","الإصدار والتحديثات"], privacy:["Privacy & diagnostics","الخصوصية والتشخيص"], technical:["Technical details","التفاصيل التقنية"] };

export function AgentConfigDrawer({ lang, version, status, releases, prefs, onPrefs, onClose, onToast, onAfterInvoke }: Props) {
  const isAr = lang === "ar";
  const [pane, setPane] = useState<Pane>("connect");
  const [selectedAgent, setSelectedAgent] = useState("");
  const [installing, setInstalling] = useState(false);
  const [updateState, setUpdateState] = useState<string>("");
  const [diagnostics, setDiagnostics] = useState<Array<{at:string;kind:string;message?:string}>>([]);
  const clients = status?.clients || [];
  useEffect(() => { if (!selectedAgent && clients.length) setSelectedAgent(prefs.selectedAgent || clients.find((client) => client.installed && !client.configured)?.id || clients[0].id); }, [clients, selectedAgent, prefs.selectedAgent]);
  const addAgent = async () => {
    if (!selectedAgent) return;
    setInstalling(true);
    try { const result = await api.installMcpClient(selectedAgent); onPrefs({ selectedAgent }); captureAppEvent("mcp_agent_connected", { agent: selectedAgent }); onToast(isAr ? `تمت إضافة MOTIF إلى ${result.label}. أعد تشغيل التطبيق.` : `MOTIF added to ${result.label}. Restart that app to finish.`); onAfterInvoke(); }
    catch (error) { onToast(error instanceof Error ? error.message : "Could not add agent"); }
    finally { setInstalling(false); }
  };
  const checkUpdates = async () => { setUpdateState(isAr ? "جارٍ التحقق…" : "Checking…"); try { const result = await api.checkUpdates(); setUpdateState(result.updateAvailable ? (isAr ? `يتوفر إصدار ${result.latestVersion}` : `Version ${result.latestVersion} is available`) : (isAr ? "أنت تستخدم أحدث إصدار" : "You're up to date")); } catch { setUpdateState(isAr ? "تعذر التحقق الآن" : "Could not check right now"); } };
  const selectPane = (next: Pane) => { setPane(next); if (next === "privacy") api.getDiagnostics().then((items) => setDiagnostics(items)).catch(() => {}); };
  return <div className="settings-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="agent-config-drawer" role="dialog" aria-modal="true" aria-label={isAr ? "الإعدادات" : "Settings"}>
    <header className="settings-header"><div className="settings-brand-icon"><Settings2 size={19}/></div><div><span className="eyebrow">MOTIF</span><h2>{isAr ? "الإعدادات" : "Settings"}</h2></div><button className="btn btn--ghost icon-btn" onClick={onClose} aria-label="Close"><X size={17}/></button></header>
    <div className="settings-layout"><nav className="settings-nav">{(Object.keys(paneLabels) as Pane[]).map((item) => <button key={item} className={pane === item ? "is-active" : ""} onClick={() => selectPane(item)}><span>{paneLabels[item][isAr ? 1 : 0]}</span><ChevronRight size={14}/></button>)}</nav>
      <div className="settings-content">
        {pane === "connect" && <section><div className="settings-intro"><Sparkles size={19}/><h3>{isAr ? "اربط وكيلك المفضل" : "Connect your AI agent"}</h3><p>{isAr ? "اختر التطبيق الذي تستخدمه. سيضيف MOTIF الاتصال تلقائياً — بدون نسخ أو إعداد يدوي." : "Choose the AI app you use. MOTIF adds the connection automatically—no copying or manual setup."}</p></div><div className="agent-choice-list">{clients.map((client) => <button key={client.id} className={`agent-choice ${selectedAgent === client.id ? "is-selected" : ""}`} onClick={() => setSelectedAgent(client.id)}><span className="agent-choice-icon"><Cpu size={16}/></span><span><strong>{client.label}</strong><small>{client.configured ? (isAr ? "متصل بالفعل" : "Already connected") : client.installed ? (isAr ? "تم العثور عليه" : "Detected on this device") : (isAr ? "يمكنك اختياره للربط" : "Available to connect")}</small></span>{selectedAgent === client.id && <Check size={17}/>}</button>)}</div><button className="btn btn--primary settings-primary-action" disabled={!selectedAgent || installing} onClick={addAgent}><Sparkles size={16}/>{installing ? (isAr ? "جارٍ الإضافة…" : "Adding…") : isAr ? "إضافة MCP تلقائياً" : "Add MCP automatically"}</button><small className="settings-footnote">{isAr ? "قد تحتاج لإعادة تشغيل تطبيق الوكيل ليظهر MOTIF." : "You may need to restart your agent app to see MOTIF."}</small></section>}
        {pane === "video" && <VideoAgentView lang={lang} onToast={onToast}/>}
        {pane === "account" && <AccountPane lang={lang} onToast={onToast}/>}
        {pane === "technical" && <McpView lang={lang} mcpStatus={status} onAfterInvoke={onAfterInvoke} onToast={onToast}/>}
        {pane === "updates" && <section><div className="settings-intro"><ArrowDownToLine size={19}/><h3>{isAr ? "الإصدار والتحديثات" : "Version & updates"}</h3><p>{isAr ? "حافظ على MOTIF محدثاً بأحدث الميزات." : "Keep MOTIF up to date with the latest improvements."}</p></div><div className="settings-version-card"><span>{isAr ? "الإصدار الحالي" : "Current version"}</span><strong>MOTIF {version}</strong><small>{releases?.current.name}</small></div><button className="btn btn--primary settings-primary-action" onClick={checkUpdates}><ArrowDownToLine size={15}/>{isAr ? "التحقق من التحديثات" : "Check for updates"}</button>{updateState && <p className="settings-result">{updateState}</p>}<h3 className="settings-subhead">{isAr ? "ملاحظات الإصدار" : "Release notes"}</h3><ReleaseView lang={lang} releases={releases} mcpStatus={status} onToast={onToast}/></section>}
        {pane === "privacy" && <section><div className="settings-intro"><LockKeyhole size={19}/><h3>{isAr ? "الخصوصية والتشخيص" : "Privacy & diagnostics"}</h3><p>{isAr ? "التحليلات مفعّلة افتراضيا ويمكنك إيقافها في أي وقت. لا تُرسل ملفات ولا مسارات ولا أسماء مشاريع ولا نصوص ولا مفاتيح." : "Analytics are on by default and you can turn them off any time. Files, paths, project names, transcripts and keys are never sent."}</p></div><label className="privacy-toggle"><span><strong>{isAr ? "مشاركة بيانات الاستخدام" : "Share anonymous usage analytics"}</strong><small>{isAr ? "يساعدنا على تحسين MOTIF. يمكنك إيقافها في أي وقت." : "Helps improve MOTIF. You can turn it off any time."}</small></span><input type="checkbox" checked={Boolean(prefs.telemetryEnabled)} onChange={(e) => onPrefs({ telemetryEnabled: e.target.checked })}/></label><div className="settings-version-card"><ShieldCheck size={17}/><span>{isAr ? "مفاتيح PostHog وSentry تُدار عبر متغيرات البيئة فقط، ولا تحفظ في إعداداتك." : "PostHog and Sentry keys are managed via environment variables and never saved in your preferences."}</span></div><button className="btn" onClick={() => api.getDiagnostics().then((items) => setDiagnostics(items)).catch(() => {})}><Activity size={14}/>{isAr ? "تحديث سجل التشخيص" : "Refresh diagnostics"}</button><div className="diagnostics-list">{diagnostics.length ? diagnostics.slice(0, 12).map((item,index) => <div key={`${item.at}-${index}`}><time>{new Date(item.at).toLocaleString(isAr ? "ar-SA" : "en-US")}</time><span>{item.kind}: {item.message || "—"}</span></div>) : <p>{isAr ? "لا توجد أخطاء مسجلة." : "No recent errors recorded."}</p>}</div></section>}
      </div>
    </div>
  </aside></div>;
}
