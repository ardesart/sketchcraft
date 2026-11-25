import { readFileSync } from "node:fs";
// Result probes for checks that info/parts/faces cannot see (UVs, vertex colours, paint-texture pixels, rooms).
// A check may carry `probes: [{cmd:{...read-only command...}, expect:[...]}]`; after the answer ran, each probe command is
// run (read-only: it changes nothing) and every `expect` must hold on its reply. Still a check on the RESULT, never on
// the command text. An expectation is {path, op, value, tol?, find?}:
//   path   dotted path into the reply ("rooms", "uv.18", "colors.27.0"); with `find:{k:v}` the path must be an array and
//          the first element whose fields equal `find` is used (then `get` is a dotted path inside it)
//   op     eq | approx (number or array of numbers, tol default 0.02) | nonnull | null | len (array/object length) | min | max |
//          all_nonnull (every value of an object/array is not null) | all_null | within01 (every number in the value is 0..1, tol 0.001)
// "*" fans out over an array's elements or an object's values: "faces.*.uv" is the list of every face's uv
const get = (o, path) => {
  if (path === "" || path == null) return o;
  const ks = String(path).split(".");
  const go = (a, i) => {
    if (a == null) return undefined;
    if (i === ks.length) return a;
    if (ks[i] === "*") { const xs = Array.isArray(a) ? a : typeof a === "object" ? Object.values(a) : []; return xs.map((x) => go(x, i + 1)); }
    return go(a[ks[i]], i + 1);
  };
  return go(o, 0);
};
const flat = (x, out = []) => { if (typeof x === "number") out.push(x); else if (Array.isArray(x)) x.forEach((y) => flat(y, out)); else if (x && typeof x === "object") Object.values(x).forEach((y) => flat(y, out)); return out; };
const approx = (a, b, tol) => (Array.isArray(b) ? Array.isArray(a) && a.length === b.length && b.every((v, i) => approx(a[i], v, tol)) : typeof a === "number" && Math.abs(a - b) <= tol);

const colorsOf = (v) => Object.values(v || {}).flatMap((x) => (Array.isArray(x) ? x : []));
export function expectErr(reply, e, pre = null) {
  let v = reply;
  if (e.find) {
    const arr = get(reply, e.path);
    if (!Array.isArray(arr)) return `${e.path} is not a list`;
    const hit = arr.find((x) => Object.entries(e.find).every(([k, w]) => (typeof w === "string" && typeof x[k] === "string" ? x[k].toLowerCase() === w.toLowerCase() : x[k] === w)));
    if (!hit) return `no ${e.path} entry ${JSON.stringify(e.find)}`;
    v = get(hit, e.get);
  } else v = get(reply, e.path);
  const lbl = `${e.find ? JSON.stringify(e.find) + "." + e.get : e.path}`;
  switch (e.op) {
    case "eq": return JSON.stringify(v) === JSON.stringify(e.value) ? null : `${lbl} = ${JSON.stringify(v)}, want ${JSON.stringify(e.value)}`;
    case "approx": return approx(v, e.value, e.tol ?? 0.02) ? null : `${lbl} = ${JSON.stringify(v)}, want ~${JSON.stringify(e.value)}`;
    case "nonnull": return v != null ? null : `${lbl} is null`;
    case "null": return v == null ? null : `${lbl} should be null`;
    case "len": { const n = Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : -1; return n === e.value ? null : `${lbl} has ${n}, want ${e.value}`; }
    case "min": return typeof v === "number" && v >= e.value ? null : `${lbl} = ${JSON.stringify(v)}, want >= ${e.value}`;
    case "max": return typeof v === "number" && v <= e.value ? null : `${lbl} = ${JSON.stringify(v)}, want <= ${e.value}`;
    case "all_nonnull": { const xs = v && typeof v === "object" ? Object.values(v) : []; return xs.length && xs.every((x) => x != null) ? null : `${lbl}: some null (${JSON.stringify(v)?.slice(0, 80)})`; }
    case "all_null": { const xs = v && typeof v === "object" ? Object.values(v) : []; return xs.every((x) => x == null) ? null : `${lbl}: not all null`; }
    case "delta": { // after - before of the same path (flattened numbers), every element within tol of value (a number or a list)
      const a = flat(v), b = flat(pre == null ? undefined : (e.find ? get(get(pre, e.path)?.find?.((x) => Object.entries(e.find).every(([k, w]) => x[k] === w)), e.get) : get(pre, e.path)));
      if (!a.length || a.length !== b.length) return `${lbl}: cannot compare (${a.length} vs ${b.length} numbers)`;
      const want = Array.isArray(e.value) ? e.value : null;
      const bad = a.findIndex((x, i) => Math.abs(x - b[i] - (want ? want[i % want.length] : e.value)) > (e.tol ?? 0.02));
      return bad < 0 ? null : `${lbl}: changed by ${(a[bad] - b[bad]).toFixed(3)} at ${bad}, want ${want ? want[bad % want.length] : e.value}`;
    }
    case "pixels_min": { // e.value {color:[r,g,b] 0..255, min, tol?}: pixels of that colour in a texture_pixels reply
      const rows = (v || []).flat(), tol = e.value.tol ?? 14;
      const n = rows.filter((px) => e.value.color.every((c, i) => Math.abs(px[i] - c) <= tol)).length;
      return n >= e.value.min ? null : `${lbl}: ${n} pixels of ${e.value.color}, want >= ${e.value.min}`;
    }
    case "tinted_min": { const n = colorsOf(v).filter((c) => c && c.some((x, i) => i < 3 && x < 0.995)).length; return n >= e.value ? null : `${lbl}: ${n} tinted corners, want >= ${e.value}`; }
    case "corners_eq": { const cs = colorsOf(v); const ok = cs.length && cs.every((c) => c && approx(c, e.value, e.tol ?? 0.02)); return ok ? null : `${lbl}: corners are not all ${JSON.stringify(e.value)}`; }
    case "within": { const xs = flat(v); return xs.length && xs.every((x) => x >= e.value[0] - 0.001 && x <= e.value[1] + 0.001) ? null : `${lbl}: values outside ${e.value}`; }
    case "affine": { // e.value [a,b,c,d,e,f]: every [u,v] after = [a u + c v + e, b u + d v + f] of the same [u,v] before
      const a = flat(v), b = flat(pre == null ? undefined : get(pre, e.path)), [A, B, C, D, E, F] = e.value, tol = e.tol ?? 0.002;
      if (!a.length || a.length !== b.length || a.length % 2) return `${lbl}: cannot compare (${a.length} vs ${b.length} numbers)`;
      for (let i = 0; i < a.length; i += 2) { const u = b[i], w = b[i + 1]; if (Math.abs(a[i] - (A * u + C * w + E)) > tol || Math.abs(a[i + 1] - (B * u + D * w + F)) > tol) return `${lbl}: [${a[i].toFixed(3)}, ${a[i + 1].toFixed(3)}] is not the map of [${u.toFixed(3)}, ${w.toFixed(3)}]`; }
      return null;
    }
    case "changed": { const b = pre == null ? undefined : (e.find ? undefined : get(pre, e.path)); return JSON.stringify(v) !== JSON.stringify(b) ? null : `${lbl}: did not change`; }
    case "has_line": { // e.value {p:[x,y,z], dir:[x,y,z]|null}: some entry of the list is that line (any point on it, either direction) or that point
      const xs = Array.isArray(v) ? v : [], tol = e.tol ?? 0.01, w = e.value;
      const sub = (a, b) => a.map((x, i) => x - b[i]), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], nrm = (a) => Math.sqrt(dot(a, a)) || 1;
      const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const ok = xs.some((g) => {
        if (!w.dir) return !g.dir && approx(g.p, w.p, tol);
        if (!g.dir) return false;
        const d = w.dir.map((x) => x / nrm(w.dir)), gd = g.dir.map((x) => x / nrm(g.dir));
        const c = cross(sub(g.p, w.p), d);
        return Math.abs(Math.abs(dot(d, gd)) - 1) < 1e-4 && Math.sqrt(dot(c, c)) <= tol;
      });
      return ok ? null : `${lbl}: no ${w.dir ? "line" : "point"} ${JSON.stringify(w)} (have ${JSON.stringify(xs).slice(0, 160)})`;
    }
    case "within01": { const xs = flat(v); return xs.length && xs.every((x) => x >= -0.001 && x <= 1.001) ? null : `${lbl}: values outside 0..1`; }
    default: return `unknown op ${e.op}`;
  }
}

// A `doc` probe ({doc: true, expect: [...]}) reads the saved document instead of running a command: state no read-only
// command reports (construction guides, text labels, the drawing axes, soft edges, welded curves, material settings).
// Its reply is docState(): {guides:[{p,dir}], texts:[{at,text,leader}], axes:[origin,x,y]|null, edges:n, soft:n,
// curves:n, materials:{name:{color, roughness?, metalness?, glass?, emission?, tile?:[w,h]}}}.
export function docState(path) {
  let d = {};
  try { d = JSON.parse(readFileSync(path, "utf8")); } catch (e) { if (e.code !== "ENOENT") throw e; } // nothing saved yet: an empty model
  const es = Object.values(d.edges || {});
  const materials = Object.fromEntries(Object.entries(d.materials || {}).map(([k, m]) => {
    const { texture, ...rest } = m;
    return [k, texture ? { ...rest, tile: [texture.width, texture.height] } : rest];
  }));
  return {
    guides: (d.guides || []).map((g) => ({ p: g.p, dir: g.dir ?? null })),
    texts: (d.annotations || []).filter((a) => a.kind === "text").map((a) => ({ at: a.at, text: a.text, leader: a.leader ?? null })),
    axes: d.axes ?? null, edges: es.length, soft: es.filter((e) => e.soft).length,
    curves: new Set(es.map((e) => e.curve).filter((c) => c != null)).size, materials,
  };
}
/** what the one-undo check compares besides info/faces: the doc state minus nothing */
export const docSig = (session) => { try { return JSON.stringify(docState(session.docPath)); } catch { return ""; } };
const probeReply = async (session, p) => (p.doc ? { ok: true, reply: docState(session.docPath) } : (async () => { const r = await session.run([p.cmd]); return { ok: r.ok, error: r.error, reply: r.replies[0] }; })());

/** run a check's probes on a live Session; returns error strings */
export async function probePre(session, check) {
  const pre = [];
  for (const p of check.probes || []) pre.push(p.before ? (await probeReply(session, p)).reply : null);
  return pre;
}
export async function probeErrs(session, check, pre = []) {
  const errs = [];
  let i = -1;
  for (const p of check.probes || []) {
    i++;
    const r = await probeReply(session, p);
    const lbl = p.doc ? "doc" : p.cmd.cmd;
    if (!r.ok) { errs.push(`probe ${lbl}: ${r.error || "failed"}`); continue; }
    for (const e of p.expect || []) { const m = expectErr(r.reply, e, pre[i]); if (m) errs.push(`probe ${lbl}: ${m}`); }
  }
  return errs;
}
