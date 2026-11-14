import { ArrowUp, ChevronDown, Paperclip, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useStore, useStyle } from "@/lib/store";
import { StyleIcon } from "./Shell";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function Composer({ placeholder, onSend, busy, initial }: { placeholder: string; onSend: (text: string, files: string[]) => void; busy?: boolean; initial?: string | undefined }) {
  const { styles, setActiveStyleId } = useStore();
  const style = useStyle();
  const [text, setText] = useState(initial ?? "");
  const [files, setFiles] = useState<string[]>([]);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fi = useRef<HTMLInputElement>(null);
  useEffect(() => { if (initial !== undefined) setText(initial); ta.current?.focus(); }, [initial]);
  useEffect(() => { if (!busy) ta.current?.focus(); }, [busy]);
  const send = () => {
    if (!text.trim() || busy) return;
    onSend(text.trim(), files); setText(""); setFiles([]);
  };
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {files.map((f) => (
            <span key={f} className="flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs">
              <Paperclip className="size-3" />{f}<button onClick={() => setFiles(files.filter((x) => x !== f))}><X className="size-3" /></button>
            </span>
          ))}
        </div>
      )}
      <textarea ref={ta} value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={placeholder}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
        className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <input ref={fi} type="file" multiple accept="video/*,audio/*,image/*" className="hidden"
          onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? []).map((f) => f.name)])} />
        <button onClick={() => fi.current?.click()} className="hover:text-foreground" aria-label="Attach footage"><Paperclip className="size-4" /></button>
        <span className="flex items-center gap-1"><ShieldCheck className="size-3.5" /> Workspace Write</span>
        <DropdownMenu>
          <DropdownMenuTrigger className="ml-auto flex items-center gap-1.5 text-foreground"><StyleIcon style={style} size="size-4" />{style.name}<ChevronDown className="size-3.5" /></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {styles.map((s) => <DropdownMenuItem key={s.id} onClick={() => setActiveStyleId(s.id)}><StyleIcon style={s} size="size-4" />{s.name}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
        <button onClick={send} disabled={busy || !text.trim()} aria-label="Send"
          className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"><ArrowUp className="size-4" /></button>
      </div>
    </div>
  );
}
