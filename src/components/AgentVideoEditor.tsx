import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import "@hyperframes/player";
import { ArrowLeft, Captions, Check, Film, Layers, Play, Sparkles, WandSparkles } from "lucide-react";
import type { Brand, Lang, Project } from "../types";
import { RemotionMotionComposition } from "../motion/RemotionMotionComposition";

interface Props { project: Project; brand?: Brand; lang: Lang; onClose: () => void; onSave: (patch: Partial<Project>) => Promise<void>; }
export function AgentVideoEditor({ project, brand, lang, onClose, onSave }: Props) {
  const [engine, setEngine] = useState<"remotion" | "hyperframes">("remotion");
  const [frame, setFrame] = useState(0);
  const [captions, setCaptions] = useState(project.aiEdit?.captions || []);
  const [scenes, setScenes] = useState(project.aiEdit?.scenes || []);
  const [saving, setSaving] = useState(false);
  const [hyperframesRevision, setHyperframesRevision] = useState(0);
  const playerRef = useRef<PlayerRef>(null);
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onFrame = (event: { detail: { frame: number } }) => setFrame(event.detail.frame);
    player.addEventListener("frameupdate", onFrame);
    return () => player.removeEventListener("frameupdate", onFrame);
  }, [engine]);
  const edit = project.aiEdit;
  const currentEdit = { engine: edit?.engine || "remotion" as const, agentSummary: edit?.agentSummary || project.summary || "", stats: { cuts: edit?.stats?.cuts ?? 0, scenes: scenes.length, captions: captions.length, motionGraphics: edit?.stats?.motionGraphics ?? 0 }, actions: Array.isArray(edit?.actions) ? edit.actions : [], scenes, captions };
  const previewProject = { ...project, aiEdit: currentEdit };
  const durationFrames = Math.max(90, (project.durationSec || 30) * 30);
  const hyperframesUrl = useMemo(() => `/api/projects/${encodeURIComponent(project.id)}/hyperframes/index.html?v=${hyperframesRevision}`, [project.id, hyperframesRevision]);
  const isAr = lang === "ar";
  const save = async () => { setSaving(true); try { await onSave({ aiEdit: { ...currentEdit, stats: { ...currentEdit.stats, scenes: scenes.length, captions: captions.length } } }); setHyperframesRevision(Date.now()); } finally { setSaving(false); } };

  return <section className="agent-editor" aria-label={isAr ? "محرر فيديو الوكيل" : "Agent Video Editor"}>
    <header className="agent-editor-header">
      <button className="btn btn--ghost" onClick={onClose}><ArrowLeft size={16}/>{isAr ? "العودة للبراند" : "Back to brand"}</button>
      <div className="agent-editor-heading"><span className="pill-badge pill-badge--accent"><Sparkles size={13}/>{isAr ? "تعديل بالذكاء الاصطناعي" : "AI edited"}</span><h2>{project.name}</h2><p>{brand?.name || "MOTIF"} · {project.aspect} · {project.durationSec || "—"}s</p></div>
      <button className="btn btn--primary" disabled={saving} onClick={save}><Check size={15}/>{saving ? (isAr ? "جارٍ الحفظ…" : "Saving…") : (isAr ? "حفظ التعديلات" : "Save changes")}</button>
      <div className="engine-switch" aria-label="Motion engine"><button className={engine === "remotion" ? "is-active" : ""} onClick={() => setEngine("remotion")}>Remotion</button><button className={engine === "hyperframes" ? "is-active" : ""} onClick={() => setEngine("hyperframes")}>HyperFrames</button></div>
    </header>
    <div className="agent-editor-grid">
      <main className="agent-editor-main">
        <div className="agent-preview-wrap">
          {engine === "remotion" ? <Player ref={playerRef} component={RemotionMotionComposition} inputProps={{ project: previewProject }} durationInFrames={durationFrames} compositionWidth={project.aspect === "16:9" ? 960 : 540} compositionHeight={project.aspect === "16:9" ? 540 : 960} fps={project.fps || 30} controls autoPlay loop style={{ width: "100%", maxHeight: 540, background: "#081414" }} /> : <div className="hyperframes-wrap">{(window as any).customElements?.get("hyperframes-player") ? createElement("hyperframes-player", { src: hyperframesUrl, controls: true, loop: true, muted: true, style: { display: "block", width: "100%", height: "100%" } }) : <iframe title="HyperFrames composition" src={hyperframesUrl} />}</div>}
          <button className="preview-play" onClick={() => playerRef.current?.toggle()} aria-label={isAr ? "تشغيل المعاينة" : "Play preview"}><Play size={15}/></button>
        </div>
        <div className="editor-timeline content-card"><div className="timeline-heading"><div><strong>{isAr ? "مسار التعديل" : "Edit timeline"}</strong><span>{scenes.length} {isAr ? "مشاهد" : "scenes"} · {project.durationSec || 0}s</span></div><Layers size={17}/></div>
          <div className="timeline-ruler"><span>00:00</span><span>{Math.floor((project.durationSec || 0) / 2)}s</span><span>{project.durationSec || 0}s</span></div>
          <div className="timeline-track"><label><Film size={13}/>{isAr ? "المشاهد" : "Scenes"}</label><div className="timeline-blocks">{scenes.map((scene, index) => <button key={scene.id} style={{ flex: Math.max(1, scene.duration), background: `linear-gradient(135deg, ${project.accentFrom || "#2f7268"}, ${index % 2 ? "#214d4b" : "#356b60"})` }} onClick={() => { setFrame(scene.start * (project.fps || 30)); playerRef.current?.seekTo(scene.start * (project.fps || 30)); }} title={scene.title}>{scene.title}</button>)}</div></div>
          <div className="timeline-track"><label><Captions size={13}/>{isAr ? "التعليقات" : "Captions"}</label><div className="caption-blocks">{captions.map((caption, index) => <span key={`${caption}-${index}`}>{caption}</span>)}</div></div>
          <input className="timeline-scrubber" aria-label="Timeline position" type="range" min={0} max={durationFrames} value={frame} onChange={(event) => { const nextFrame = Number(event.target.value); setFrame(nextFrame); playerRef.current?.seekTo(nextFrame); }}/>
        </div>
      </main>
      <aside className="agent-story content-card"><div className="agent-story-title"><Sparkles size={17}/><h3>{isAr ? "ماذا أنجز الوكيل" : "What the agent did"}</h3></div>
        <p>{edit?.agentSummary || project.summary || (isAr ? "تم إعداد هذا الفيديو بواسطة وكيلك." : "Your agent prepared this video edit.")}</p>
        <div className="edit-stats"><span><b>{edit?.stats?.cuts ?? 0}</b>{isAr ? "قصات" : "cuts"}</span><span><b>{scenes.length}</b>{isAr ? "مشاهد" : "scenes"}</span><span><b>{captions.length}</b>{isAr ? "تعليقات" : "captions"}</span><span><b>{edit?.stats?.motionGraphics ?? 0}</b>{isAr ? "حركات" : "motion"}</span></div>
        <div className="agent-actions-list">{(edit?.actions || []).map((action, index) => <article key={`${action.at}-${index}`}><i>{String(Math.floor(action.at / 60)).padStart(2,"0")}:{String(action.at % 60).padStart(2,"0")}</i><strong>{action.title}</strong><span>{action.detail}</span></article>)}</div>
        <div className="editable-scenes"><strong><Film size={14}/>{isAr ? "مشاهد الحركة" : "Motion scenes"}</strong>{scenes.map((scene, index) => <div key={scene.id}><span>{String(index + 1).padStart(2,"0")}</span><input aria-label={`${isAr ? "اسم المشهد" : "Scene name"} ${index + 1}`} value={scene.title} onChange={(event) => setScenes((previous) => previous.map((item, i) => i === index ? { ...item, title: event.target.value } : item))}/><select aria-label={isAr ? "حركة المشهد" : "Scene motion"} value={scene.motion} onChange={(event) => setScenes((previous) => previous.map((item, i) => i === index ? { ...item, motion: event.target.value } : item))}><option value="rise">Rise</option><option value="reveal">Reveal</option><option value="float">Float</option><option value="fade">Fade</option></select></div>)}</div>
        <div className="editable-captions"><strong><Captions size={14}/>{isAr ? "التعليقات النصية" : "Captions"}</strong>{captions.map((text, index) => <input aria-label={`${isAr ? "التعليق" : "Caption"} ${index + 1}`} key={index} value={text} onChange={(event) => setCaptions((previous) => previous.map((line, i) => i === index ? event.target.value : line))}/>)}</div>
        <div className="engine-note"><WandSparkles size={14}/>{engine === "remotion" ? "Remotion Player" : "HyperFrames Player"} · {isAr ? "معاينة موشن جرافيك" : "motion graphics preview"}</div>
      </aside>
    </div>
  </section>;
}
