import { useEffect, useState } from "react";
import type { Lang } from "../types";
import { translate } from "../i18n";
interface StatusBarProps { lang: Lang; connected: boolean; runtime?: string; version?: string; }
function formatClock(date: Date, lang: Lang) { return date.toLocaleTimeString(lang === "ar" ? "ar-SA" : "en-US", { hour: "2-digit", minute: "2-digit" }); }
export function StatusBar({ lang, connected }: StatusBarProps) {
  const [clock,setClock]=useState(()=>formatClock(new Date(),lang));
  useEffect(()=>{setClock(formatClock(new Date(),lang));const timer=setInterval(()=>setClock(formatClock(new Date(),lang)),15_000);return()=>clearInterval(timer);},[lang]);
  return <footer className="statusbar" role="status"><div className="statusbar-group"><span className={`mint-dot ${connected?"":"is-off"}`} style={{width:6,height:6}}/><span>{translate(lang,connected?"status.connected":"status.offline")}</span></div><div className="statusbar-group"><span className="statusbar-shortcuts">1–3 {lang==="ar"?"الأقسام":"sections"} · / {lang==="ar"?"بحث":"search"}</span><span className="statusbar-clock">{clock}</span></div></footer>;
}
