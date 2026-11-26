import { useEffect, useRef, useState, type FormEvent } from "react";
import { Mic, Square, Trash2, Save } from "lucide-react";
import type { Brand, Lang, Project, SelectedItem, VoiceNote } from "../types";
import { translate } from "../i18n";

interface VoiceNoteViewProps {
  lang: Lang;
  brands: Brand[];
  projects: Project[];
  voiceNotes: VoiceNote[];
  selected: SelectedItem;
  onSelect: (item: SelectedItem) => void;
  onSaveVoiceNote: (payload: {
    title?: string;
    transcript?: string;
    durationSec?: number;
    brandId?: string;
    projectId?: string;
    audioBase64?: string;
  }) => Promise<void>;
  onDeleteVoiceNote: (id: string) => void;
}

function formatTimer(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function VoiceNoteView({
  lang,
  brands,
  projects,
  voiceNotes,
  selected,
  onSelect,
  onSaveVoiceNote,
  onDeleteVoiceNote,
}: VoiceNoteViewProps) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [micNote, setMicNote] = useState("");
  const [audioBase64, setAudioBase64] = useState("");
  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [brandId, setBrandId] = useState(brands[0]?.id || "");
  const [projectId, setProjectId] = useState(projects[0]?.id || "");
  const [saving, setSaving] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    };
  }, []);

  const stopRecording = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    setRecording(false);
  };

  const toggleRecording = async () => {
    if (recording) {
      stopRecording();
      return;
    }
    setMicNote("");
    setAudioBase64("");
    setSeconds(0);

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMicNote(translate(lang, "voice.micFallback"));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size > 0) {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === "string") setAudioBase64(reader.result);
          };
          reader.readAsDataURL(blob);
        }
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setMicNote(translate(lang, "voice.micFallback"));
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!audioBase64 && !transcript.trim()) return;
    setSaving(true);
    try {
      await onSaveVoiceNote({
        title: title.trim() || undefined,
        transcript: transcript.trim(),
        durationSec: seconds,
        brandId,
        projectId,
        audioBase64: audioBase64 || undefined,
      });
      setTitle("");
      setTranscript("");
      setAudioBase64("");
      setSeconds(0);
    } finally {
      setSaving(false);
    }
  };

  const brandMap = new Map(brands.map((b) => [b.id, b.name]));
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Centered 120px Liquid Glass Record Button (DESIGN.md) */}
      <div className="voice-stage">
        <button
          type="button"
          className={`record-circle glass ${recording ? "is-recording" : ""}`}
          onClick={toggleRecording}
          aria-label={translate(lang, recording ? "voice.recording" : "voice.tapToRecord")}
        >
          {recording ? <Square size={36} fill="currentColor" /> : <Mic size={42} strokeWidth={1.7} />}
        </button>

        <div className="record-timer">{formatTimer(seconds)}</div>
        <div style={{ fontSize: 13, color: "var(--ink-secondary)" }}>
          {translate(lang, recording ? "voice.recording" : "voice.tapToRecord")}
        </div>
        {micNote && (
          <div style={{ fontSize: 12.5, color: "var(--accent)", textAlign: "center", maxWidth: 460 }}>
            {micNote}
          </div>
        )}

        <form className="content-card voice-composer" onSubmit={handleSave}>
          {audioBase64 && (
            <audio controls src={audioBase64} style={{ width: "100%" }} />
          )}

          <div className="field-grid">
            <label className="field field--full">
              <span className="field-label">{translate(lang, "voice.titleLabel")}</span>
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={translate(lang, "voice.titlePh")}
              />
            </label>

            <label className="field">
              <span className="field-label">{translate(lang, "voice.linkBrand")}</span>
              <select className="select" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
                <option value="">{translate(lang, "voice.none")}</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">{translate(lang, "voice.linkProject")}</span>
              <select className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">{translate(lang, "voice.none")}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field field--full">
              <span className="field-label">{translate(lang, "voice.transcriptLabel")}</span>
              <textarea
                className="textarea"
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder={translate(lang, "voice.transcriptPh")}
              />
            </label>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={saving || (!audioBase64 && !transcript.trim())}
            >
              <Save size={14} />
              {translate(lang, "voice.save")}
            </button>
          </div>
        </form>
      </div>

      {/* Saved Voice Notes List */}
      <section className="voice-list">
        <div className="section-label">
          <span>{translate(lang, "voice.savedList")}</span>
          <span>{voiceNotes.length}</span>
        </div>

        {voiceNotes.length === 0 ? (
          <div className="content-card empty-state">{translate(lang, "voice.empty")}</div>
        ) : (
          voiceNotes.map((note) => {
            const isSelected = selected?.kind === "voice" && selected.id === note.id;
            return (
              <article
                key={note.id}
                className={`content-card content-card--interactive voice-item ${isSelected ? "is-selected" : ""}`}
                onClick={() => onSelect({ kind: "voice", id: note.id })}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 600, fontSize: 14.5 }}>{note.title}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {note.brandId && brandMap.get(note.brandId) && (
                      <span className="pill-badge">{brandMap.get(note.brandId)}</span>
                    )}
                    {note.projectId && projectMap.get(note.projectId) && (
                      <span className="pill-badge">{projectMap.get(note.projectId)}</span>
                    )}
                    <button
                      type="button"
                      className="btn btn--ghost icon-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteVoiceNote(note.id);
                      }}
                      aria-label="Delete voice note"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {note.hasAudio && (
                  <audio
                    controls
                    src={`/api/voice-notes/${encodeURIComponent(note.id)}/audio`}
                    style={{ width: "100%", height: 34 }}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}

                {note.transcript && (
                  <p className="inspector-body" style={{ margin: 0 }}>
                    {note.transcript}
                  </p>
                )}
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
