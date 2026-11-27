import type { CSSProperties } from "react";
import { useCurrentFrame } from "remotion";
import type { Project } from "../types";

export function RemotionMotionComposition({ project }: { project: Project }) {
  const currentFrame = useCurrentFrame();
  const second = currentFrame / (project.fps || 30);
  const edit = project.aiEdit;
  const scene = edit?.scenes?.find((item) => second >= item.start && second < item.start + item.duration) || edit?.scenes?.[0];
  const accent = project.accentFrom || "#45b8a3";
  const stageStyle: CSSProperties = { "--accent": accent } as CSSProperties;
  return <div className={`motion-preview motion-preview--${scene?.motion || "rise"}`} style={stageStyle}><div className="motion-preview-grain"/><div className="motion-preview-orb"/><div className="motion-preview-copy"><span className="motion-preview-kicker">{scene?.title || project.name}</span><strong>{edit?.captions?.[Math.floor(second / 3) % Math.max(1, edit.captions.length)] || project.name}</strong><span className="motion-preview-brand">{project.name}</span></div><div className="motion-preview-counter">{String(Math.floor(second)).padStart(2,"0")} : 00</div></div>;
}
