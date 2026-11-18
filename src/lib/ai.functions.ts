import { createServerFn } from "@tanstack/react-start";
import { ask, explainAiFailure } from "./ai.server";

type StyleIn = {
  name: string;
  colors: string[];
  display: string;
  body: string;
  logo?: string | undefined;
  motion: string[];
};

function parseJson<T>(s: string): T {
  const m = s.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : s) as T;
}

export type EditPlan = {
  reply: string;
  steps: { title: string; detail: string }[];
  filename: string;
  duration: string;
  cuts: number;
  captions: { t: string; text: string }[];
};

export const chatEdit = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { style: StyleIn; history: { role: string; text: string }[]; files: string[] }) => d,
  )
  .handler(async ({ data }) => {
    const s = data.style;
    const prompt = `You are Motif, an AI video editor. The user's saved style is ALWAYS applied — never ask them for references or clarifying questions; decide yourself.
ACTIVE STYLE: ${s.name}. Colors: ${s.colors.join(", ")}. Display font: ${s.display}. Body font: ${s.body}. Logo: ${s.logo ?? "none"}. Motion rules: ${s.motion.join("; ")}.
Attached footage: ${data.files.join(", ") || "none"}.
Conversation:
${data.history.map((m) => `${m.role.toUpperCase()}: ${m.text}`).join("\n")}

Respond in the same language as the user's last message. Return ONLY valid JSON (no markdown fences) with this shape:
{"reply":"one or two sentence summary of the finished edit (mention it's a sample preview, no real video rendered)","steps":[{"title":"Style applied","detail":"..."},{"title":"Brand layer","detail":"..."},{"title":"Pacing","detail":"..."},{"title":"Captions","detail":"..."}],"filename":"kebab-case-name.mp4","duration":"mm:ss","cuts":number,"captions":[{"t":"mm:ss","text":"..."}]}
Give 8-12 captions spread over the duration.`;
    try {
      const plan = parseJson<EditPlan>(await ask(prompt));
      return { plan, error: null, relink: false };
    } catch (e) {
      console.error(e);
      return { plan: null, ...explainAiFailure(e, "The AI couldn't finish this edit. Try again.") };
    }
  });

export type ExtractedStyle = {
  name: string;
  colors: string[];
  display: string;
  body: string;
  motion: string[];
};

export const extractStyle = createServerFn({ method: "POST" })
  .inputValidator((d: { kind: "md" | "url" | "video"; content: string }) => d)
  .handler(async ({ data }) => {
    let source = data.content;
    if (data.kind === "url") {
      try {
        const url = /^https?:\/\//.test(source) ? source : `https://${source}`;
        const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 MotifBot" } });
        source = `URL: ${url}\n` + (await r.text()).slice(0, 20000);
      } catch {
        source = `URL: ${source} (could not fetch; infer from the brand name)`;
      }
    }
    const prompt = `Extract a video editing style/brand system from this ${data.kind === "md" ? "style markdown file" : data.kind === "url" ? "website HTML" : "reference video filename"}.
Return ONLY JSON: {"name":"short style name","colors":["#RRGGBB" x5, most important first],"display":"display font + descriptor","body":"body font","motion":["3 short motion/pacing rules for video edits"]}
SOURCE:
${source}`;
    try {
      const style = parseJson<ExtractedStyle>(await ask(prompt));
      return { style, error: null, relink: false };
    } catch (e) {
      console.error(e);
      return { style: null, ...explainAiFailure(e, "Couldn't read that style. Try again.") };
    }
  });
