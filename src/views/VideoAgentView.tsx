import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Copy,
  Cpu,
  Film,
  FolderPlus,
  Layers,
  Play,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Terminal,
  Wand2,
} from "lucide-react";
import type {
  Lang,
  VideoEditStack,
  VideoEditStatus,
  VideoMode,
  VideoPlan,
  VideoRunResult,
} from "../types";
import { api } from "../api/client";
import { translate } from "../i18n";
import posthog, { isPostHogConfigured } from "../posthog";

interface VideoAgentViewProps {
  lang: Lang;
  onToast: (msg: string) => void;
}

const MODE_KEYS: Record<VideoMode, string> = {
  quick: "agent.mode.quick",
  light: "agent.mode.light",
  full: "agent.mode.full",
};

const STAGE_PROGRESS: Record<string, string> = {
  source: "src",
  cut: "cut.json",
  transcribe: "a.json",
  captions: "caps",
  script_review: "scenes",
  cutzoom: "cutz",
  scenes: "scenes",
  sfx: "sfx",
  render: "final",
  master: "master",
};

function pickTitle(
  lang: Lang,
  value: { ar: string; en: string } | undefined | null,
): string {
  if (!value) return "";
  return lang === "ar" ? value.ar : value.en;
}

function formatSec(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VideoAgentView({ lang, onToast }: VideoAgentViewProps) {
  const [status, setStatus] = useState<VideoEditStatus | null>(null);
  const [stack, setStack] = useState<VideoEditStack | null>(null);
  const [selectedClip, setSelectedClip] = useState<string>("");
  const [mode, setMode] = useState<VideoMode>("full");
  const [plan, setPlan] = useState<VideoPlan | null>(null);
  const [newName, setNewName] = useState("");
  const [expanded, setExpanded] = useState<string>("");
  const [stageInfo, setStageInfo] = useState<Record<string, { commands: string[]; checks: string[] }>>({});
  const [running, setRunning] = useState<string>("");
  const [runResult, setRunResult] = useState<(VideoRunResult & { stage: string }) | null>(null);
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [st, sk] = await Promise.all([api.getVideoStatus(), api.getVideoStack()]);
      setStatus(st);
      setStack(sk);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Video agent unavailable");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const clip = useMemo(
    () => status?.projects.find((p) => p.name === selectedClip) || null,
    [status, selectedClip],
  );

  const buildPlan = useCallback(
    async (name: string, nextMode: VideoMode) => {
      if (!name.trim()) {
        setError(translate(lang, "agent.clipName"));
        return;
      }
      try {
        const res = await api.getVideoPlan({ name: name.trim(), mode: nextMode });
        setPlan(res);
        setSelectedClip(res.name);
        setStageInfo({});
        setRunResult(null);
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Plan failed");
      }
    },
    [lang],
  );

  useEffect(() => {
    if (!plan) return;
    let alive = true;
    (async () => {
      const info: Record<string, { commands: string[]; checks: string[] }> = {};
      for (const step of plan.steps) {
        if (!["source", "cut", "transcribe", "captions", "cutzoom", "scenes", "sfx", "render", "verify"].includes(step.id)) {
          continue;
        }
        try {
          const res = await api.getVideoStage({ stage: step.id, work: plan.work, name: plan.name, mode: plan.mode });
          if (res.ok) info[step.id] = { commands: res.commands || [], checks: res.checks || [] };
        } catch {
          // keep static plan commands
        }
      }
      if (alive) setStageInfo(info);
    })();
    return () => {
      alive = false;
    };
  }, [plan]);

  const toggleStage = (id: string) => {
    setExpanded((cur) => (cur === id ? "" : id));
  };

  const runStep = async (stepId: string) => {
    if (!plan) return;
    setRunning(stepId);
    setError("");
    try {
      const res = await api.runVideoStage({
        stage: stepId,
        work: plan.work,
        name: plan.name,
        mode: plan.mode,
        posthogDistinctId: isPostHogConfigured ? posthog.get_distinct_id() : undefined,
      });
      setRunResult({ ...res, stage: stepId });
      if (isPostHogConfigured) {
        posthog.capture("video_stage_run_completed", {
          gate: res.gate,
          stage: stepId,
          succeeded: res.ok,
        });
      }
      if (res.gate === "refused") onToast(translate(lang, "agent.gateRefused"));
      if (res.gate === "ok") {
        onToast(translate(lang, "agent.gateOk"));
        refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setRunning("");
    }
  };

  const createClip = async () => {
    if (!newName.trim()) return;
    try {
      const res = await api.getVideoPlan({ name: newName.trim(), mode });
      setPlan(res);
      setSelectedClip(res.name);
      if (isPostHogConfigured) {
        posthog.capture("video_clip_plan_created", {
          frame: res.frame,
          mode: res.mode,
          stage_count: res.steps.length,
        });
      }
      setNewName("");
      onToast(res.work);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  };

  const setClipMode = async (nextMode: VideoMode) => {
    setMode(nextMode);
    if (!plan) return;
    try {
      await api.setVideoMode({ work: plan.work, mode: nextMode });
      await buildPlan(plan.name, nextMode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mode change failed");
    }
  };

  const copyText = (key: string, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(key);
    onToast(translate(lang, "mcp.copied"));
    setTimeout(() => setCopied(""), 1600);
  };

  const stackMeta = stack?.stack;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && <div className="error-banner">{error}</div>}

      {/* ── Readiness: is the workstation ready for the agent? ── */}
      <div className="content-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="mint-dot" />
            <strong style={{ fontSize: 14.5 }}>{translate(lang, "agent.readiness")}</strong>
            <span className="pill-badge pill-badge--accent" style={{ fontFamily: "var(--font-mono)" }}>
              {translate(lang, "agent.stackBadge")} v{status?.stack.version || stackMeta?.version || "1.1"}
            </span>
          </div>
          <button type="button" className="btn" onClick={() => refresh()}>
            <RefreshCw size={14} />
            {translate(lang, "agent.refresh")}
          </button>
        </div>

        <div className="three-col-grid">
          <div className="glass" style={{ borderRadius: 14, padding: "10px 12px" }}>
            <div className="section-label" style={{ marginBottom: 6 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <FolderPlus size={12} /> {translate(lang, "agent.home")}
              </span>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, direction: "ltr", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {status?.home || "…"}
            </div>
            <div style={{ fontSize: 11.5, color: status?.homeReady ? "var(--accent)" : "var(--ink-muted)", marginTop: 4 }}>
              {status?.homeReady ? translate(lang, "agent.stackBadge") : translate(lang, "agent.noClips")}
            </div>
          </div>

          <div className="glass" style={{ borderRadius: 14, padding: "10px 12px" }}>
            <div className="section-label" style={{ marginBottom: 6 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Sparkles size={12} /> {translate(lang, "agent.identity")}
              </span>
            </div>
            <div style={{ fontSize: 12.5 }}>
              {status?.profileReady && status.identity
                ? translate(lang, "agent.identityLine", {
                    handle: status.identity.handle || "—",
                    font: status.identity.font || "—",
                    style: status.identity.style || "—",
                  })
                : translate(lang, "agent.identityMissing")}
            </div>
            {status?.identity && (
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                {[status.identity.bg, status.identity.acc, status.identity.ink].filter(Boolean).map((c) => (
                  <span key={c} style={{ width: 16, height: 16, borderRadius: 5, background: c, border: "1px solid rgba(255,255,255,0.25)" }} />
                ))}
              </div>
            )}
          </div>

          <div className="glass" style={{ borderRadius: 14, padding: "10px 12px" }}>
            <div className="section-label" style={{ marginBottom: 6 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Layers size={12} /> {translate(lang, "agent.engine")}
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: status?.engine.remotionReady ? "var(--accent)" : "var(--ink-muted)" }}>
              {status?.engine.remotionReady
                ? translate(lang, "agent.engineReady")
                : translate(lang, "agent.engineMissing")}
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 6, fontFamily: "var(--font-mono)" }}>
              {status?.stageCount || stackMeta?.stages.length || 0} stages · {status?.redLines || 0} red lines
            </div>
          </div>
        </div>
      </div>

      {/* ── Clips + composer ── */}
      <div className="two-col-grid">
        <div className="content-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Clapperboard size={16} color="var(--accent)" />
            <strong style={{ fontSize: 14 }}>{translate(lang, "agent.clips")}</strong>
            <span className="pill-badge">{status?.projects.length ?? 0}</span>
          </div>

          {(status?.projects || []).length === 0 ? (
            <p className="inspector-body" style={{ margin: 0 }}>
              {translate(lang, "agent.noClips")}
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(status?.projects || []).map((p) => {
                const active = plan?.name === p.name;
                return (
                  <button
                    key={p.dir}
                    type="button"
                    className={`sc-row ${active ? "is-active" : ""}`}
                    onClick={() => {
                      setMode((p.mode as VideoMode) || "full");
                      buildPlan(p.name, (p.mode as VideoMode) || "full");
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <Film size={14} />
                      <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: 11 }}>
                      <span>{formatSec(p.durationSec)}</span>
                      <span>· {translate(lang, "agent.scenesCount", { n: p.scenes })}</span>
                      <span className={`pill-badge ${p.files.final || p.files.master ? "pill-badge--accent" : ""}`}>
                        {p.files.final || p.files.master ? translate(lang, "agent.stageDone") : translate(lang, "agent.stagePending")}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="field">
            <span className="field-label">{translate(lang, "agent.newClip")}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="input"
                value={newName}
                placeholder={translate(lang, "agent.clipName")}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createClip();
                }}
              />
              <button type="button" className="btn btn--primary" onClick={createClip} disabled={!newName.trim()}>
                <FolderPlus size={14} />
                {translate(lang, "agent.startClip")}
              </button>
            </div>
          </div>
        </div>

        <div className="content-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Cpu size={16} color="var(--accent)" />
            <strong style={{ fontSize: 14 }}>{translate(lang, "agent.modeTitle")}</strong>
          </div>
          <div className="tab-strip">
            {(Object.keys(MODE_KEYS) as VideoMode[]).map((m) => (
              <button
                key={m}
                type="button"
                className={`tab-pill ${mode === m ? "is-active" : ""}`}
                onClick={() => setClipMode(m)}
              >
                {translate(lang, MODE_KEYS[m] as Parameters<typeof translate>[1])}
              </button>
            ))}
          </div>

          {plan ? (
            <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontFamily: "var(--font-mono)", direction: "ltr", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {plan.work}
              </span>
              <span style={{ color: "var(--ink-muted)" }}>
                {plan.steps.length} stages · {mode} · {plan.frame}
              </span>
            </div>
          ) : (
            <p className="inspector-body" style={{ margin: 0 }}>
              {translate(lang, "agent.subtitle")}
            </p>
          )}

          {clip && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {[
                ["src.mov", clip.files.src],
                ["cutz.mp4", clip.files.cutz],
                ["caps.json", clip.files.caps],
                ["Scenes.tsx", clip.files.scenes],
                ["sfx", clip.files.sfx],
                ["ad-final.mp4", clip.files.final || clip.files.master],
              ].map(([label, ok]) => (
                <span key={String(label)} className={`pill-badge ${ok ? "pill-badge--accent" : ""}`} style={{ fontFamily: "var(--font-mono)", fontSize: 10.5 }}>
                  {ok ? <Check size={10} /> : null} {label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Pipeline: the exact stages the agent runs ── */}
      {plan && (
        <div className="content-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Wand2 size={16} color="var(--accent)" />
              <strong style={{ fontSize: 14 }}>{translate(lang, "agent.pipeline")}</strong>
            </div>
            <span className="pill-badge" style={{ fontFamily: "var(--font-mono)" }}>
              {translate(lang, "agent.gateRule")}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {plan.steps.map((step) => {
              const stageRef = stackMeta?.stages.find((s) => s.id === step.id);
              const info = stageInfo[step.id];
              const commands = info?.commands?.length ? info.commands : step.commands;
              const checks = info?.checks?.length ? info.checks : step.checks;
              const isOpen = expanded === step.id;
              const progKey = STAGE_PROGRESS[step.id];
              const done = Boolean(progKey && clip?.files?.[progKey]);
              const isRunnable = ["setup", "cut", "transcribe", "captions", "cutzoom", "sfx", "render"].includes(step.id);
              return (
                <div key={step.id} className={`stage-row ${done ? "is-done" : ""}`}>
                  <button type="button" className="stage-head" onClick={() => toggleStage(step.id)}>
                    <span className="stage-n">{String(step.n).padStart(2, "0")}</span>
                    <span style={{ fontWeight: 600, fontSize: 13.5, flex: 1, textAlign: "start" }}>
                      {pickTitle(lang, step.title)}
                    </span>
                    {stageRef?.optional && (
                      <span className="pill-badge">{translate(lang, "agent.stageOptional")}</span>
                    )}
                    {done ? (
                      <CheckCircle2 size={15} color="var(--accent)" />
                    ) : (
                      <span className="pill-badge">{translate(lang, "agent.stagePending")}</span>
                    )}
                    {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {isOpen && (
                    <div className="stage-body">
                      {stageRef?.note && (
                        <p className="inspector-body" style={{ margin: 0 }}>
                          {pickTitle(lang, stageRef.note)}
                        </p>
                      )}
                      {stageRef?.doc && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--ink-muted)" }}>
                          <BookOpen size={12} />
                          {translate(lang, "agent.stageDoc")}:
                          <span style={{ fontFamily: "var(--font-mono)", direction: "ltr" }}>video-edit/{stageRef.doc}</span>
                        </div>
                      )}

                      {commands.length > 0 ? (
                        <div className="cmd-list">
                          {commands.map((c) => (
                            <div key={c} className="cmd-row">
                              <code dir="ltr">{c}</code>
                              <button type="button" className="btn btn--ghost icon-btn" onClick={() => copyText(c, c)} aria-label="Copy command">
                                {copied === c ? <Check size={12} /> : <Copy size={12} />}
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="inspector-body" style={{ margin: 0 }}>
                          {translate(lang, "agent.noCommands")}
                        </p>
                      )}

                      {checks.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <span className="field-label" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                            <ShieldAlert size={12} /> {translate(lang, "agent.checks")}
                          </span>
                          {checks.map((c) => (
                            <code key={c} dir="ltr" style={{ fontSize: 11, color: "var(--ink-secondary)", fontFamily: "var(--font-mono)" }}>
                              {c}
                            </code>
                          ))}
                        </div>
                      )}

                      {isRunnable && (
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            className="btn btn--primary"
                            disabled={Boolean(running)}
                            onClick={() => runStep(step.id)}
                          >
                            <Play size={13} />
                            {translate(lang, running === step.id ? "agent.running" : "agent.run")}
                          </button>
                        </div>
                      )}

                      {runResult?.stage === step.id && (
                        <div className="run-result">
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {runResult.gate === "ok" ? (
                              <CheckCircle2 size={14} color="var(--accent)" />
                            ) : (
                              <AlertTriangle size={14} color="#e9a23b" />
                            )}
                            <strong style={{ fontSize: 12.5 }}>
                              {translate(
                                lang,
                                runResult.gate === "ok"
                                  ? "agent.gateOk"
                                  : runResult.gate === "refused"
                                    ? "agent.gateRefused"
                                    : "agent.gateError",
                              )}
                            </strong>
                            <span className="pill-badge" style={{ fontFamily: "var(--font-mono)" }}>
                              exit {runResult.exitCode} · {Math.round(runResult.elapsedMs / 100) / 10}s
                            </span>
                          </div>
                          <pre className="code-block" dir="ltr" style={{ maxHeight: 220, overflow: "auto", margin: 0 }}>
                            {runResult.output || "—"}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Red lines + brief ── */}
      <div className="two-col-grid">
        <div className="content-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ShieldAlert size={16} color="#e9a23b" />
            <strong style={{ fontSize: 14 }}>{translate(lang, "agent.redLines")}</strong>
          </div>
          <ul style={{ margin: 0, paddingInlineStart: 18, display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, color: "var(--ink-secondary)" }}>
            {(stackMeta?.redLines || []).map((r) => (
              <li key={r.en}>{pickTitle(lang, r)}</li>
            ))}
          </ul>
        </div>

        <div className="content-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Terminal size={16} color="var(--accent)" />
              <strong style={{ fontSize: 14 }}>{translate(lang, "agent.brief")}</strong>
            </div>
            <button type="button" className="btn" onClick={() => copyText("brief", stack?.brief || "")} disabled={!stack?.brief}>
              {copied === "brief" ? <Check size={14} /> : <Copy size={14} />}
              {translate(lang, "agent.copyBrief")}
            </button>
          </div>
          <pre className="code-block" dir="ltr" style={{ maxHeight: 240, overflow: "auto", margin: 0 }}>
            {stack?.brief || "…"}
          </pre>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--ink-muted)" }}>
            <Activity size={12} />
            {stackMeta?.stages.length || 0} stages · {(stackMeta?.styles || []).length} styles ·{" "}
            {Object.keys(stackMeta?.modes || {}).length} modes
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--ink-muted)" }}>
            <BookOpen size={12} />
            {translate(lang, "agent.overMcp")}
          </div>
        </div>
      </div>
    </div>
  );
}
