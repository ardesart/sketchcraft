// SketchCraft AI box, the pure part: the prompt the model was trained with, and reading its answer.
// Keep SHORT_SYSTEM and the message format identical to tools/minimodel/lib/spec.mjs (a test compares them), and the
// parsing identical to tools/minimodel/run_eval.mjs (parseFree) and lib/retrieve.mjs (repair).
// The model's text is untrusted DATA: it is only ever JSON.parse'd, never evaluated, never used as a path. What it
// may run is decided in Rust (app/src-tauri/src/ai.rs), not here.

export const SHORT_SYSTEM = [
  "You are SketchCraft's modeling assistant. Turn the request into SketchCraft commands.",
  'Reply with JSON only: {"commands":[...]}, each command an object with "cmd". Meters, Z up, +X east, +Y north, degrees.',
  'Questions use only read-only commands (info, parts, faces, volume, room_info). Area or size of a named room: room_info {name}; never compute it yourself. Anything outside modeling (files, network, programs) gets {"commands":[{"cmd":"info"}]}.',
  'A house or floor plan described room by room is ONE floorplan_build command in the person\'s units (units:"ft" or "m"): floors:[{rooms:[{name, rect:[x,y,width,depth]}], openings:[{kind:door|window|opening|open, between:[room, room or "outside"], side?, width?}], stairs?:[{room}]}]. Rooms go row by row from the front (y=0) to the back, left to right from x=0; rooms that touch share a wall. Front = south, back = north, left = west, right = east.',
].join("\n");

export type Msg = { role: "system" | "user" | "assistant"; content: string };
export const chatMessages = (state: string, request: string): Msg[] => [
  { role: "system", content: SHORT_SYSTEM },
  { role: "user", content: `Model state: ${state}\nRequest: ${request}` },
];

type Cmd = Record<string, unknown>;

/** the model's text -> a command list (run_eval.mjs parseFree), or null */
export function parseAnswer(text: string): Cmd[] | null {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const tryJson = (s: string): unknown => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };
  let v = tryJson(t);
  if (v === undefined) {
    const a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a >= 0 && b > a) v = tryJson(t.slice(a, b + 1));
  }
  if (v === undefined) {
    const a = t.indexOf("["), b = t.lastIndexOf("]");
    if (a >= 0 && b > a) v = tryJson(t.slice(a, b + 1));
  }
  if (v === undefined) {
    const lines = t.split("\n").map((l) => tryJson(l.trim())).filter((x) => x && typeof x === "object");
    if (lines.length) v = lines;
  }
  const isCmd = (x: unknown): x is Cmd => !!x && typeof x === "object" && !Array.isArray(x);
  if (Array.isArray(v)) return v.filter(isCmd).length === v.length ? (v as Cmd[]) : null;
  const o = v as { commands?: unknown; cmd?: unknown } | undefined;
  if (o && Array.isArray(o.commands)) return o.commands.filter(isCmd).length === o.commands.length ? (o.commands as Cmd[]) : null;
  if (o && typeof o === "object" && o.cmd) return [o as Cmd];
  return null;
}

/** the eval harness's deterministic glue (lib/retrieve.mjs repair): box-as-one-rect, stray end_group, undefined @names */
export function repair(cmds: Cmd[], known: Set<string> = new Set()): Cmd[] {
  const out: Cmd[] = [];
  let open = 0;
  for (const c0 of cmds) {
    const c = { ...c0 };
    const from = c.from as number[] | undefined, to = c.to as number[] | undefined;
    if (c.cmd === "rect" && Array.isArray(from) && Array.isArray(to) && from.every((v, i) => v !== to[i])) {
      const z0 = Math.min(from[2], to[2]), h = Math.abs(to[2] - from[2]);
      const face = (c.as as string) || `rb${out.length}`;
      out.push({ cmd: "rect", from: [from[0], from[1], z0], to: [to[0], to[1], z0], as: face });
      out.push({ cmd: "pushpull", face: `@${face}`, distance: h, toward: [0, 0, 1] });
      continue;
    }
    if (c.cmd === "begin_group") open++;
    if (c.cmd === "end_group") {
      if (open === 0) continue;
      open--;
    }
    out.push(c);
  }
  const defined = new Set([...known, ...out.map((c) => c.as).filter((x): x is string => typeof x === "string")]);
  const refs = (c: Cmd) => (JSON.stringify(c).match(/"@(\w+)"/g) || []).map((s) => s.slice(2, -1));
  for (const [i, c] of out.entries()) {
    for (const r of refs(c)) {
      if (defined.has(r)) continue;
      for (let j = i - 1; j >= 0; j--) {
        const p = out[j];
        if (p.as) continue;
        if (p.cmd === r || (p.cmd === "insert" && p.asset === r) || (p.cmd === "begin_group" && p.name === r) || (p.cmd === "wall" && /wall|room/.test(r))) {
          p.as = r;
          defined.add(r);
          break;
        }
      }
    }
  }
  return out;
}

/** names the state line offers as @name: `@house is a group ...` */
export const knownNames = (state: string): Set<string> => new Set([...state.matchAll(/@(\w+) is a/g)].map((m) => m[1]));

/** A group's name as SketchCraft AI uses it (without the @): lowercase, spaces and dashes as `_`, letters, digits and
 *  `_` only, like the training data. The same rule as src-tauri/src/ai.rs `ident`. */
export function aiName(name: string): string {
  return name.trim().toLowerCase().replace(/[ -]/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 32);
}
