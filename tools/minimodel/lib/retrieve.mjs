// Retrieval-picked few-shot examples and a per-request command subset, for the prompting-only variants.
//
// Held-out pool: the 201 requests are split in two folds. Fold A is the evenly spread 100-request subset that
// `--limit 100` scores; fold B is the other 101. A request in A only ever sees examples from B and vice versa,
// so the scored request (and its gold answer) is never in its own prompt. Because the request set is written
// in families ("a 4 by 3 box...", "a 50 cm cube..."), the other fold usually holds a close cousin; `maxSim`
// drops pool entries that are too similar, to estimate how much of the gain is near-duplicate copying.
//
// Similarity: TF-IDF cosine on words (numbers removed, so "a 3 m cube" and "a 50 cm cube" match on structure),
// plus a bonus for the same starting model (fixture), since the right ids (@house, @top...) depend on it.
import { COMMANDS } from "./spec.mjs";

const STOP = new Set("a an the of and to in on at with by is it its be m meter meters metre metres".split(" "));
const words = (s) => s.toLowerCase().replace(/[0-9.,]+/g, " ").split(/[^a-z']+/).filter((w) => w && !STOP.has(w));

export function foldA(cases) {
  const n = 100, step = cases.length / n;
  return new Set(Array.from({ length: n }, (_, i) => cases[Math.floor(i * step)].id));
}

export function makeRetriever(cases) {
  const A = foldA(cases);
  const df = new Map();
  const docs = cases.map((c) => { const w = new Set(words(c.request)); for (const t of w) df.set(t, (df.get(t) || 0) + 1); return words(c.request); });
  const N = cases.length;
  const vec = (ws) => {
    const v = new Map();
    for (const t of ws) v.set(t, (v.get(t) || 0) + Math.log((N + 1) / ((df.get(t) || 0) + 1)) + 1);
    let norm = 0; for (const x of v.values()) norm += x * x; norm = Math.sqrt(norm) || 1;
    for (const [k, x] of v) v.set(k, x / norm);
    return v;
  };
  const vecs = docs.map(vec);
  const cos = (a, b) => { let s = 0; for (const [k, x] of a) s += x * (b.get(k) || 0); return s; };
  /** the k most similar pool examples for case c (other fold only), least similar first so the closest is last */
  return function pick(c, k, { maxSim = 1.01 } = {}) {
    const qi = cases.findIndex((x) => x.id === c.id);
    const inA = A.has(c.id);
    const scored = [];
    for (const [i, p] of cases.entries()) {
      if (p.id === c.id || A.has(p.id) === inA) continue; // the other fold only
      const sim = cos(vecs[qi], vecs[i]);
      if (sim > maxSim) continue;
      scored.push({ p, sim, score: sim + (p.fixture === c.fixture ? 0.25 : 0) });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k).reverse();
  };
}

// Commands always offered in a narrowed subset: the building blocks almost every answer can need.
const CORE = ["rect", "pushpull", "begin_group", "end_group", "move", "paint", "info", "parts", "undo"];
// Words that switch on a command the examples might not show.
const TRIGGERS = [
  [/\bwall|room\b/, ["wall"]], [/stair|step/, ["stairs"]], [/roof|gable|hip|shed/, ["roof"]], [/column|pillar|post/, ["column", "array", "scale"]],
  [/door|window|garage|tree|palm|car|streetlight|lamp|bench|hydrant/, ["insert"]], [/circle|round|cylinder|disc|disk|radius|diameter/, ["circle"]],
  [/rotate|turn|degrees|spin|face (north|south|east|west)/, ["rotate"]], [/twice|half|scale|bigger|smaller|wider|taller|times|longer|higher|double/, ["scale"]],
  [/copy|copies|duplicate|another|second|two|three|four|five|six|row|grid|repeat/, ["copy", "duplicate", "array"]], [/delete|remove|erase|get rid/, ["delete"]],
  [/volume/, ["volume"]], [/dimension|measure|how long|distance/, ["dimension"]], [/tag|layer/, ["tag"]], [/hide|unhide|show/, ["hide", "unhide"]],
  [/component|instance|place/, ["make_component", "place"]], [/rename|call it|name/, ["rename"]], [/group/, ["group"]], [/inset|offset|border|frame|shrink/, ["offset"]],
  [/triangle|polygon|shape|points|l-shaped|pentagon|hexagon/, ["polygon"]], [/line|edge/, ["line"]], [/face|which|what|where|how/, ["faces", "pick"]],
];

/** command names for a narrowed schema: core + what the retrieved examples used + keyword triggers */
export function subsetFor(c, shots) {
  const s = new Set(CORE);
  for (const { p } of shots) for (const g of p.gold) s.add(g.cmd);
  const r = c.request.toLowerCase();
  for (const [re, cmds] of TRIGGERS) if (re.test(r)) cmds.forEach((x) => s.add(x));
  return COMMANDS.map(([n]) => n).filter((n) => s.has(n));
}

/**
 * `--repair`: deterministic glue between the model and the engine (not model skill; reported separately).
 * Fixes the three mechanical slips that make up most engine refusals:
 *  - a rect whose corners differ in x, y AND z (the model's way of writing a box) -> rect on its lowest plane + pushpull
 *  - an @name used but never created, when an earlier command made exactly that kind of thing without `as`
 *    (column, insert of that asset, a group of that name) -> give that command `as`
 *  - an end_group with no open begin_group -> dropped
 */
export function repair(cmds, fixtureNames = new Set()) {
  if (!Array.isArray(cmds)) return cmds;
  const out = [];
  let open = 0;
  for (const c0 of cmds) {
    const c = { ...c0 };
    if (c.cmd === "rect" && Array.isArray(c.from) && Array.isArray(c.to) && c.from.every((v, i) => v !== c.to[i])) {
      const z0 = Math.min(c.from[2], c.to[2]), h = Math.abs(c.to[2] - c.from[2]);
      const face = c.as || `rb${out.length}`;
      out.push({ cmd: "rect", from: [c.from[0], c.from[1], z0], to: [c.to[0], c.to[1], z0], as: face });
      out.push({ cmd: "pushpull", face: `@${face}`, distance: h, toward: [0, 0, 1] });
      continue;
    }
    if (c.cmd === "begin_group") open++;
    if (c.cmd === "end_group") { if (open === 0) continue; open--; }
    out.push(c);
  }
  const defined = new Set([...fixtureNames, ...out.map((c) => c.as).filter(Boolean)]);
  const refs = (c) => JSON.stringify(c).match(/"@(\w+)"/g)?.map((s) => s.slice(2, -1)) || [];
  for (const [i, c] of out.entries()) {
    for (const r of refs(c)) {
      if (defined.has(r)) continue;
      for (let j = i - 1; j >= 0; j--) {
        const p = out[j];
        if (p.as) continue;
        if (p.cmd === r || (p.cmd === "insert" && p.asset === r) || (p.cmd === "begin_group" && p.name === r) || (p.cmd === "wall" && /wall|room/.test(r))) { p.as = r; defined.add(r); break; }
      }
    }
  }
  return out;
}
