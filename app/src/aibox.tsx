// SketchCraft AI: a tab in the side panel. A chat with the local model. Each answer shows the commands it ran, what the
// engine said, anything refused, and an Undo. The rules live in ai.ts and app/src-tauri/src/ai.rs: the model's text is
// untrusted data; it runs as an untrusted agent (allowlist), one undo step per answer. Files are added by the PERSON
// here (a normal import or a picture material); the model only ever sees a material's name, never a file or a path.
import { useEffect, useRef, useState, type DragEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { inTauri, type Reply, type Scene } from "./engine";
import { prepareImage } from "./textures";
import { chatMessages, knownNames, parseAnswer, repair } from "./ai";

type Row = { cmd: string; command: unknown; status: "ok" | "refused" | "error" | "skipped" | "pending"; error?: string; reply?: Record<string, unknown> };
type Turn =
  | { kind: "user"; text: string }
  | { kind: "note"; text: string; bad?: boolean }
  | { kind: "ai"; rows: Row[]; raw?: string; error?: string; ms: number; changed: boolean; undone?: boolean; notes?: string[] };

const URL_KEY = "sketchcraft.ai.url";
const readUrl = () => {
  try {
    return localStorage.getItem(URL_KEY) ?? "";
  } catch {
    return "";
  }
};
const short = (o: unknown) => JSON.stringify(o).slice(0, 200);
const replyText = (r?: Record<string, unknown>) => {
  if (!r) return "";
  const rest = { ...r };
  delete rest.ok;
  return Object.keys(rest).length ? short(rest) : "";
};
const IMAGE = /\.(png|jpe?g|webp|gif|bmp)$/i;
const MODEL_FILE = /\.(dxf|obj|skp|fbx|dwg)$/i;

/** The beaver at work (the brand mascot: architect and builder in one animal): bobs, pencil sketching, bricks going up. */
export function BeaverBuilding() {
  return (
    <div className="beaver-build" role="img" aria-label="The beaver is building your answer">
      <svg width="56" height="56" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="#6f4df0" />
        <g className="beaver-body">
          <path d="M4.2 14.2C4 10.2 7.6 7.2 13.6 6.4C20.6 5.6 26.4 8.6 28.2 15L30.5 32H8.2L8.2 26.6C6 25.2 4.6 22.6 4.4 19Z" fill="#f8f3e6" />
          <circle cx="21.6" cy="7.6" r="1.7" fill="#15131c" />
          <circle cx="12.4" cy="11" r="1.2" fill="#15131c" />
          <path d="M2.6 12.6C2.6 10.4 4.6 9.4 6.8 9.8C8.6 10.2 8.8 12.6 7.6 13.8C6 15.2 2.6 15 2.6 12.6Z" fill="#15131c" />
          <path d="M4.8 16H10.4L10.6 22.4H5.4Z" fill="#e8892b" stroke="#15131c" strokeWidth="1" strokeLinejoin="round" />
        </g>
        <g className="beaver-pencil">
          <path d="M5.5 27.6L22.5 14.4L24.6 17L7.8 30Z" fill="#f2c230" stroke="#15131c" strokeWidth=".9" strokeLinejoin="round" />
        </g>
        <rect className="brick b1" x="22" y="26" width="3.6" height="2.2" fill="#e8892b" />
        <rect className="brick b2" x="25.8" y="26" width="3.6" height="2.2" fill="#e8892b" />
        <rect className="brick b3" x="23.9" y="23.6" width="3.6" height="2.2" fill="#e8892b" />
      </svg>
      <span>Building…</span>
    </div>
  );
}

export function AiPanel({ scene, run, refresh, say, importFile }: { scene: Scene | null; run: (c: Record<string, unknown>) => Promise<Reply>; refresh: () => Promise<void>; say: (t: string, bad?: boolean) => void; importFile: (f: File) => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState(readUrl);
  const [log, setLog] = useState<Turn[]>([{ kind: "note", text: "Ask for a change or a question about the model. One Undo takes back a whole answer. The AI can't read picture plans yet." }]);
  const [over, setOver] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const pick = useRef<HTMLInputElement>(null);
  const field = useRef<HTMLInputElement>(null);
  // the box takes focus back when an answer is in, so the next request can be typed straight away
  useEffect(() => { if (!busy) field.current?.focus(); }, [busy]);
  useEffect(() => end.current?.scrollIntoView?.({ block: "end" }), [log, busy]);
  if (!inTauri) return <div className="aibox-note">SketchCraft AI runs in the desktop app.</div>;
  const push = (t: Turn) => setLog((l) => [...l.slice(-60), t]);

  const ask = async () => {
    const request = text.trim();
    if (!request || busy) return;
    setBusy(true);
    setText("");
    push({ kind: "user", text: request });
    const t0 = Date.now();
    let rows: Row[] = [], error: string | undefined, raw: string | undefined, changed = false, notes: string[] = [];
    let state = "", sent: unknown = null, endpoint = "";
    try {
      state = await invoke<string>("ai_state");
      const got = await invoke<{ text: string; url: string }>("ai_chat", { messages: chatMessages(state, request), url: url.trim() || null });
      raw = got.text;
      endpoint = got.url;
      const parsed = parseAnswer(got.text);
      if (!parsed) error = "The model's answer was not a command list.";
      else {
        sent = repair(parsed, knownNames(state));
        const done = await invoke<{ ok: boolean; error?: string; rows: Row[]; changed?: boolean; notes?: string[] }>("ai_apply", { commands: sent });
        notes = done.notes ?? [];
        rows = done.rows;
        changed = !!done.changed;
        if (!done.ok) error = done.error;
      }
    } catch (e) {
      error = String(e);
    }
    // the debugger: every turn, whole, one JSON line (src-tauri ai_log; "AI debug" folder beside the model)
    const ms = Date.now() - t0;
    const failed = !!error || rows.some((r) => r.status === "error" || r.status === "refused");
    void invoke("ai_log", { entry: { at: new Date().toISOString(), request, state, endpoint, raw: raw ?? null, sent, rows, notes, changed, error: error ?? null, failed, ms } }).catch(() => {});
    setLog((l) => l.map((t) => (t.kind === "ai" ? { ...t, undoable: false } : t)));
    push({ kind: "ai", rows, raw: error && rows.length === 0 ? raw?.slice(0, 200) : undefined, error, ms, changed, notes });
    await refresh();
    setBusy(false);
  };

  const undo = async (i: number) => {
    const r = await run({ cmd: "undo" });
    if (r.ok) setLog((l) => l.map((t, j) => (j === i && t.kind === "ai" ? { ...t, undone: true } : t)));
  };

  const addFile = async (file: File) => {
    try {
      if (IMAGE.test(file.name)) {
        const img = await prepareImage(file);
        let name = file.name.replace(/\.[^.]+$/, "").replace(/[^\w .-]/g, "").slice(0, 40) || "Image";
        while (scene?.materials.some((m) => m.name === name)) name += " 2";
        const r = await run({ cmd: "texture", name, data: img.data, width: 1, height: img.aspect, color: img.color });
        if (r.ok) push({ kind: "note", text: `Added picture material "${name}". You can ask the AI to use it by name. It never sees the file, only the name. The AI can't read picture plans yet; to trace over a picture use a reference image.` });
      } else if (MODEL_FILE.test(file.name)) {
        await importFile(file);
        push({ kind: "note", text: `Imported ${file.name.slice(0, 60)} the normal way. The AI's next request is told what is in the model now.` });
      } else push({ kind: "note", text: `${file.name.slice(0, 60)}: SketchCraft can't import that kind of file here.`, bad: true });
    } catch (e) {
      push({ kind: "note", text: String(e), bad: true });
    }
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    for (const f of Array.from(e.dataTransfer.files).slice(0, 5)) void addFile(f);
  };
  const lastAi = log.map((t, i) => (t.kind === "ai" ? i : -1)).filter((i) => i >= 0).pop();

  return (
    <div className="aibox" data-testid="ai-box">
      <div className="aibox-log" data-testid="ai-log" role="log" aria-live="polite">
        {log.map((t, i) =>
          t.kind === "user" ? (
            <div key={i} className="aibox-user">{t.text}</div>
          ) : t.kind === "note" ? (
            <div key={i} className={`aibox-sys${t.bad ? " bad" : ""}`}>{t.text}</div>
          ) : (
            <div key={i} className="aibox-ai" data-testid="ai-answer">
              {t.rows.map((x, j) => (
                <div key={j} className={`aibox-cmd ${x.status}`} data-status={x.status}>
                  <code>{short(x.command)}</code>
                  <span>{x.status === "ok" ? replyText(x.reply) || "ok" : x.status === "refused" ? `refused: ${x.error}` : x.status === "error" ? `failed: ${x.error}` : x.status}</span>
                </div>
              ))}
              {t.error && <div className="aibox-err">{t.error}{t.raw ? ` (${t.raw})` : ""}</div>}
              {t.notes?.map((note, k) => <div key={k} className="aibox-meta" data-testid="ai-note">{note}</div>)}
              {!t.error && <div className="aibox-meta">{t.undone ? "undone" : t.changed ? "changed the model (one Undo)" : "no change"} · {(t.ms / 1000).toFixed(1)} s</div>}
              {t.changed && !t.undone && i === lastAi && !busy && <button className="btn small" data-testid="ai-undo" onClick={() => void undo(i)}>Undo this answer</button>}
            </div>
          )
        )}
        {busy && <BeaverBuilding />}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => (e.preventDefault(), void ask())}>
        <input ref={field} data-testid="ai-input" value={text} disabled={busy} aria-label="Ask SketchCraft AI" placeholder="e.g. a 4 by 3 m box 2.5 m high" onChange={(e) => setText(e.target.value)} />
        <button className="btn small" type="submit" disabled={busy || !text.trim()} data-testid="ai-send">Ask</button>
      </form>
      <div className={`aibox-drop${over ? " over" : ""}`} data-testid="ai-drop" onDragOver={(e) => (e.preventDefault(), setOver(true))} onDragLeave={() => setOver(false)} onDrop={drop}>
        Drop a picture or a drawing here
        <button className="btn small ghost" onClick={() => pick.current?.click()}>Add file</button>
        <input ref={pick} type="file" hidden multiple accept="image/*,.dxf,.obj,.skp,.fbx,.dwg" onChange={(e) => { for (const f of Array.from(e.target.files ?? []).slice(0, 5)) void addFile(f); e.target.value = ""; }} />
      </div>
      <label className="aibox-url">
        model address <input value={url} aria-label="Model address" placeholder="default http://127.0.0.1:11437 (or SKETCHCRAFT_AI_URL)" onChange={(e) => { setUrl(e.target.value); try { localStorage.setItem(URL_KEY, e.target.value); } catch { /* ignore */ } }} />
      </label>
    </div>
  );
}
