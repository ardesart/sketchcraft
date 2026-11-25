// Drives the real SketchCraft engine for the minimodel spike, the way an AI
// agent does: `sketchcraft mcp` over stdio, as the untrusted MCP caller (same
// allowlist, same per-command number/path checks, steps labelled as an agent's).
// One engine process per request, with a scratch SKETCHCRAFT_DOC/HOME.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export function findBinary() {
  const cands = [
    process.env.SKETCHCRAFT_BIN,
    process.env.CARGO_TARGET_DIR && join(process.env.CARGO_TARGET_DIR, "release/sketchcraft"),
    resolve(here, "../../../target/release/sketchcraft"),
  ].filter(Boolean);
  for (const c of cands) if (existsSync(c)) return c;
  throw new Error("no sketchcraft binary: build it (cargo build --release -p sketchcraft-core) or set SKETCHCRAFT_BIN");
}

export class Session {
  constructor(bin = findBinary()) {
    this.scratch = mkdtempSync(join(process.env.MINIMODEL_SCRATCH || tmpdir(), "mm-sess-"));
    mkdirSync(join(this.scratch, "work"), { recursive: true });
    const doc = join(this.scratch, "work", "model.sketchcraft");
    this.docPath = doc; // the engine saves the document here after every call: lib/probe.mjs `doc` probes read it
    this.proc = spawn(bin, ["mcp", "--doc", doc], {
      env: { ...process.env, HOME: this.scratch, SKETCHCRAFT_DOC: doc },
      stdio: ["pipe", "pipe", "ignore"],
    });
    this.buf = "";
    this.waiting = new Map();
    this.nextId = 1;
    this.proc.stdout.on("data", (d) => {
      this.buf += d;
      let i;
      while ((i = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, i);
        this.buf = this.buf.slice(i + 1);
        try {
          const m = JSON.parse(line);
          const w = this.waiting.get(m.id);
          if (w) { this.waiting.delete(m.id); w(m); }
        } catch {}
      }
    });
    this.proc.on("exit", () => { for (const w of this.waiting.values()) w({ error: "engine exited" }); });
  }
  rpc(method, params) {
    const id = this.nextId++;
    return new Promise((res) => {
      this.waiting.set(id, res);
      this.proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }
  async init() { await this.rpc("initialize", { protocolVersion: "2025-06-18" }); return this; }
  /** Run commands in order. Stops at the first error. Returns {ok, replies, failedAt, error}. */
  async run(commands) {
    const r = await this.rpc("tools/call", { name: "sketchcraft_run", arguments: { commands } });
    const text = r.result?.content?.[0]?.text ?? "";
    const replies = [];
    for (const line of text.split("\n")) {
      if (line.startsWith("{")) { try { replies.push(JSON.parse(line)); } catch {} }
    }
    const bad = replies.findIndex((x) => x.ok !== true);
    const stopped = text.split("\n").find((l) => l.startsWith("stopped at:"));
    // refused or unparsable commands come back as a failed reply
    return { ok: !r.result?.isError && bad < 0 && replies.length === commands.length, replies, failedAt: bad >= 0 ? bad : null, error: bad >= 0 ? replies[bad].error : (r.result?.isError ? text.slice(0, 300) : null), stopped };
  }
  /** info + parts + faces, as plain JSON, for the checks. */
  async inspect() {
    const r = await this.run([{ cmd: "info" }, { cmd: "parts" }, { cmd: "faces" }]);
    const [info, parts, faces] = r.replies;
    return { info: info || {}, parts: parts?.parts || [], faces: faces?.faces || [] };
  }
  close() {
    try { this.proc.stdin.end(); this.proc.kill(); } catch {}
    try { rmSync(this.scratch, { recursive: true, force: true }); } catch {}
  }
  get pid() { return this.proc.pid; }
}
