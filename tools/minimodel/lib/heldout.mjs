// Keeps training data apart from the eval set (eval/cases.jsonl is test-only: never trained on, tuned on or
// used to write templates or paraphrases).
//
// HARD rules (a pair that breaks one is dropped by the generator, and `gen_data.mjs --check` fails on it):
//   exact     same request after normalising (lowercase, punctuation and extra spaces removed, numbers kept)
//   masked    same request with every number (digits and number words) and its unit replaced by "#": the same
//             sentence pattern as an eval request with other numbers or units in it
//   shingle   character 8-gram Jaccard >= 0.7 with an eval request (numbers kept): a light rewording of it
//   gold      same (starting-model kind, command names in order, sorted numbers) as an eval gold answer:
//             the same answer, whatever the words (only for answers with numbers in them: a bare `parts`
//             or `undo` is the one right answer to many different requests)
// SOFT measure (recorded per pair as `sim`, reported, not a drop rule): TF-IDF cosine on words with numbers
// removed (the same vectoriser as lib/retrieve.mjs), the closest eval request. Many good training requests
// share vocabulary with the eval ("a ... by ... box ... tall"), because that is how people say it. The
// report counts how many are at or above 0.6 (the spike's near-duplicate threshold), and `--strict` drops them
// so a second model can measure generalisation to unseen phrasing.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCases } from "./run_case.mjs";

const NUMWORDS = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty hundred half quarter twice double triple".split(" ");
const NUMRE = new RegExp(`\\b(${NUMWORDS.join("|")})\\b`, "g");
export const norm = (s) => s.toLowerCase().replace(/[^a-z0-9.\s]/g, " ").replace(/\.(?!\d)/g, " ").replace(/\s+/g, " ").trim();
// numbers AND their units become "#", so "8.5m", "8.5 metres" and "5.5 m" all read the same
const UNITS = "(?:m|meters?|metres?|cm|centimet(?:er|re)s?|mm|millimet(?:er|re)s?|ft|feet|foot|in|inch(?:es)?|deg|degrees?)";
export const mask = (s) => norm(s).replace(/-?\d+(\.\d+)?/g, " # ").replace(NUMRE, "#").replace(new RegExp(`#\\s*${UNITS}\\b`, "g"), "#").replace(/\s+/g, " ").replace(/#( #)+/g, "#").trim();
const shingles = (s, n = 8) => { const t = norm(s); const out = new Set(); for (let i = 0; i + n <= t.length; i++) out.add(t.slice(i, i + n)); return out; };
const jaccard = (a, b) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i || 1); };

const STOP = new Set("a an the of and to in on at with by is it its be m meter meters metre metres".split(" "));
const words = (s) => s.toLowerCase().replace(/[0-9.,]+/g, " ").split(/[^a-z']+/).filter((w) => w && !STOP.has(w));
const nums = (x, out = []) => { if (typeof x === "number") out.push(+x.toFixed(3)); else if (Array.isArray(x)) x.forEach((y) => nums(y, out)); else if (x && typeof x === "object") Object.entries(x).forEach(([k, y]) => k !== "as" && nums(y, out)); return out; };
/** what an answer IS, ignoring names: starting-model kind + command names + sorted numbers */
export const goldSig = (fixtureKind, cmds) => `${fixtureKind || "-"}|${cmds.map((c) => c.cmd).join(",")}|${nums(cmds).sort((a, b) => a - b).join(",")}`;

const evalFile = (f) => existsSync(join(dirname(fileURLToPath(import.meta.url)), "../eval", f));
export function makeHeldout(cases = [...loadCases(), ...(evalFile("new_cases.jsonl") ? loadCases("new") : []), ...(evalFile("v5_cases.jsonl") ? loadCases("v5") : [])]) {
  const exact = new Map(cases.map((c) => [norm(c.request), c.id]));
  const masked = new Map(cases.map((c) => [mask(c.request), c.id]));
  const sh = cases.map((c) => shingles(c.request));
  const gold = new Map(cases.map((c) => [goldSig(c.fixture, c.gold), c.id]));
  const df = new Map();
  const docs = cases.map((c) => words(c.request));
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) || 0) + 1);
  const N = cases.length;
  const vec = (ws) => {
    const v = new Map();
    for (const t of ws) v.set(t, (v.get(t) || 0) + Math.log((N + 1) / ((df.get(t) || 0) + 1)) + 1);
    let n2 = 0; for (const x of v.values()) n2 += x * x; n2 = Math.sqrt(n2) || 1;
    for (const [k, x] of v) v.set(k, x / n2);
    return v;
  };
  const vecs = docs.map(vec);
  const cos = (a, b) => { let s = 0; for (const [k, x] of a) s += x * (b.get(k) || 0); return s; };

  /** @returns {{bad: string|null, evalId: string|null, sim: number, simId: string}} */
  return function check(request, fixtureKind, cmds) {
    const n = norm(request);
    if (exact.has(n)) return { bad: "exact", evalId: exact.get(n), sim: 1, simId: exact.get(n) };
    const m = mask(request);
    if (masked.has(m)) return { bad: "masked", evalId: masked.get(m), sim: 1, simId: masked.get(m) };
    const g = goldSig(fixtureKind, cmds);
    if (gold.has(g) && nums(cmds).length) return { bad: "gold", evalId: gold.get(g), sim: 0, simId: gold.get(g) };
    const s = shingles(request);
    for (const [i, e] of sh.entries()) if (jaccard(s, e) >= 0.7) return { bad: "shingle", evalId: cases[i].id, sim: 1, simId: cases[i].id };
    const v = vec(words(request));
    let best = 0, bi = 0;
    for (const [i, e] of vecs.entries()) { const c = cos(v, e); if (c > best) { best = c; bi = i; } }
    return { bad: null, evalId: null, sim: +best.toFixed(3), simId: cases[bi].id };
  };
}
