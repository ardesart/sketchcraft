#!/usr/bin/env node
// Sorts the failed requests of one result file into failure kinds (first matching rule wins), so the doc can say
// WHY the model fails, not just how often.
//   node failures.mjs results/<tag>.json [--list kind]
// The rules read the engine's error, the check's message and the model's commands next to the case's gold
// commands. They are heuristics: spot-check with --list before quoting a number.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCases } from "./lib/run_case.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2];
if (!file) { console.error("usage: node failures.mjs results/<tag>.json [--list kind]"); process.exit(2); }
const { summary, rows } = JSON.parse(readFileSync(file, "utf8"));
const cases = Object.fromEntries(loadCases().map((c) => [c.id, c]));
const fixtureNames = (fx) => {
  if (!fx) return new Set();
  const s = new Set();
  for (const l of readFileSync(join(here, "eval/fixtures", `${fx}.jsonl`), "utf8").split("\n")) if (l.startsWith("{")) { const c = JSON.parse(l); if (c.as) s.add(c.as); }
  return s;
};
const nums = (x, out = []) => { if (typeof x === "number") out.push(x); else if (Array.isArray(x)) x.forEach((y) => nums(y, out)); else if (x && typeof x === "object") Object.values(x).forEach((y) => nums(y, out)); return out; };
const UNIT = /\b(cm|mm|centimet|millimet|foot|feet|ft|inch|inches|in\b|')/i;

export const KINDS = {
  parse: "no valid command list came out",
  box_as_rect: "drew a box as one 3-D rect (rect corners not on one plane)",
  vertical_rect: "a rect with zero width: a vertical opening / face drawn with the wrong coordinates",
  dangling_ref: "used an @name it never created (forgot `as`, or `insert`/`column` results it cannot name)",
  fixture_state: "misread the starting model: invented an id, rebuilt or ignored what was already there",
  other_engine: "other engine refusal (wrong id type, no such face/component...)",
  question: "a question that changed the model or used no read-only command",
  units: "wrong unit conversion (cm/mm/ft/in left unconverted or converted wrongly)",
  missing_step: "right commands so far, but a step the request asked for is missing",
  wrong_command: "picked the wrong command / approach (e.g. uniform scale for 'taller', room walls for one wall)",
  numbers: "right commands, wrong numbers or placement (sizes, offsets, counts, angles, directions)",
};

function classify(r) {
  const c = cases[r.id];
  const e = r.errs[0] || "";
  const cmds = Array.isArray(r.commands) ? r.commands : [];
  const made = new Set(cmds.map((x) => x.as).filter(Boolean));
  const fxn = fixtureNames(c.fixture);
  if (r.stage === "parse" || r.stage === "empty") return "parse";
  if (/must share one coordinate/.test(e)) return "box_as_rect";
  if (/zero width/.test(e)) return "vertical_rect";
  const unk = /unknown name @(\w+)/.exec(e);
  if (unk) {
    if (c.fixture && !made.has(unk[1])) {
      // an @name that neither the fixture nor the answer defines: for an object type the answer itself drew it is a
      // dangling reference, otherwise the model imagined the starting model differently
      const drewIt = cmds.some((x) => x.cmd === unk[1] || (x.cmd === "insert" && x.asset === unk[1]) || (x.name === unk[1]));
      return drewIt ? "dangling_ref" : "fixture_state";
    }
    return "dangling_ref";
  }
  if (r.stage === "engine") return c.fixture ? (/no (face|component|group)/.test(e) ? "fixture_state" : "other_engine") : "other_engine";
  if (c.check.readonly) return "question";
  // check failures
  if (UNIT.test(c.request)) {
    const big = nums(cmds).some((v) => Math.abs(v) >= 10) && !nums(c.gold).some((v) => Math.abs(v) >= 10);
    if (big) return "units";
  }
  if (c.fixture) {
    // rebuilt something the fixture already had (a house group, the room walls) instead of using it
    const rebuilt = cmds.some((x) => (x.cmd === "begin_group" && fxn.has(x.as)) || (x.cmd === "wall" && fxn.has("room")));
    if (rebuilt) return "fixture_state";
  }
  const g = new Set(c.gold.map((x) => x.cmd)), m = new Set(cmds.map((x) => x.cmd));
  const core = (s) => new Set([...s].filter((x) => !["begin_group", "end_group", "info", "parts", "faces"].includes(x)));
  const gc = core(g), mc = core(m);
  const missing = [...gc].filter((x) => !mc.has(x));
  if (missing.length === 0) return "numbers";
  if ([...mc].every((x) => gc.has(x))) return "missing_step";
  return "wrong_command";
}

const fails = rows.filter((r) => !r.pass);
const by = {};
for (const r of fails) (by[classify(r)] ||= []).push(r);
const li = process.argv.indexOf("--list");
if (li > 0) {
  for (const r of by[process.argv[li + 1]] || []) console.log(`- ${r.id} [${r.tier}${r.cat ? ",a11y" : ""}] "${r.request}"\n    ${(r.errs[0] || "").slice(0, 150)}\n    ${JSON.stringify(r.commands ?? r.raw).slice(0, 240)}`);
  process.exit(0);
}
console.log(`${summary.tag}: ${fails.length} failures of ${rows.length}\n\n| kind | n | share of failures | easy | medium | hard | a11y | what it means |\n|---|---|---|---|---|---|---|---|`);
for (const [k, v] of Object.entries(by).sort((a, b) => b[1].length - a[1].length)) {
  const t = (f) => v.filter(f).length;
  console.log(`| ${k} | ${v.length} | ${Math.round((100 * v.length) / fails.length)}% | ${t((r) => r.tier === "easy")} | ${t((r) => r.tier === "medium")} | ${t((r) => r.tier === "hard")} | ${t((r) => r.cat === "a11y")} | ${KINDS[k]} |`);
}
