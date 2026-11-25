#!/usr/bin/env node
// minimodel eval harness: natural language -> local model (Ollama) -> SketchCraft commands -> engine -> graded.
//
//   node run_eval.mjs --model qwen2.5-coder:1.5b [--mode constrained|free] [--shots 0..8] [--limit N]
//                     [--retrieve K] [--max-sim 0.8] [--subset] [--timeout 120]
//                     [--ids e001,m010] [--cat a11y] [--tag name] [--no-memory-guard] [--set plans]
// --set new    the v4 new-features cases (eval/new_cases.jsonl: rooms, texturing, UV, vertex paint, texture painting)
// --set v5     the v5 Model-tab + UV/texture cases (eval/v5_cases.jsonl: arcs, Follow Me, text, guides, axes, edge and solid tools, materials, UV chains)
// --set plans  the route 2 floor-plan cases (eval/plan_cases.jsonl: 30 synthetic held-out plans + the owner's townhouse)
// --shots N    the first N hand-written worked examples (lib/spec.mjs FEW_SHOT)
// --retrieve K K examples picked by similarity from the OTHER fold of the request set (lib/retrieve.mjs): never the
//              scored request itself. --max-sim drops pool examples more similar than that (near-duplicate control).
// --repair     deterministic glue on the model's output before the engine runs it (lib/retrieve.mjs repair())
// --fix-schema the command table also allows `as` on insert (the engine accepts it; the original table left it out)
// --prompt short  the fine-tuning prompt (no command reference); use it to score a fine-tuned model
// --subset     the schema and the prompt reference list only the commands this request plausibly needs
//              (core + the retrieved examples' commands + keyword triggers)
//   node run_eval.mjs --model gold        # control: the reference solutions (must be 100%)
//   node run_eval.mjs --model noop        # control: only `info` (shows what a do-nothing answer scores)
//   node run_eval.mjs --check-spec        # the command table still matches core/src/commands/command.rs + policy.rs
//
// constrained = Ollama `format` = JSON schema built from the command table (output can only be a valid command list)
// free        = no `format`; the model is asked for JSON and the text is parsed as best we can
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COMMANDS, FEW_SHOT, SHORT_SYSTEM, buildReference, buildSchema } from "./lib/spec.mjs";
import { fixtureDesc, loadCases, loadFixture, runCase } from "./lib/run_case.mjs";
import { makeRetriever, repair, subsetFor } from "./lib/retrieve.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf("--" + n); return i < 0 ? d : args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true; };
const HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";

if (flag("check-spec")) {
  const root = join(here, "../..");
  const cmd = readFileSync(join(root, "core/src/commands/command.rs"), "utf8");
  const pol = readFileSync(join(root, "core/src/policy.rs"), "utf8");
  const model = /const MODEL: &\[&str\] = &\[([\s\S]*?)\];/.exec(pol)?.[1] || "";
  let bad = 0;
  for (const [name] of COMMANDS) {
    const pascal = name.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join("");
    if (!new RegExp(`\\b${pascal}\\b\\s*[{,(]`).test(cmd) && !new RegExp(`\\b${pascal}\\b`).test(cmd)) { console.log("not in Command enum:", name); bad++; }
    if (!model.includes(`"${name}"`) && name !== "undo") { console.log("not in agent allowlist:", name); bad++; }
  }
  console.log(bad ? `${bad} problems` : `ok: all ${COMMANDS.length} commands exist and are agent-allowed`);
  process.exit(bad ? 1 : 0);
}

const model = flag("model", null);
if (!model) { console.error("usage: see header of run_eval.mjs"); process.exit(2); }
const mode = flag("mode", "constrained");
const shots = Number(flag("shots", 0));
const retrieveK = Number(flag("retrieve", 0));
const maxSim = Number(flag("max-sim", 1.01));
const subset = !!flag("subset");
const timeoutS = Number(flag("timeout", 120));
const doRepair = !!flag("repair"), fixSchema = !!flag("fix-schema");
if (fixSchema) COMMANDS.find(([n]) => n === "insert")[1].as = "s?";
const variant = [flag("prompt", "long") === "short" && "short", shots && `${shots}shot`, retrieveK && `rag${retrieveK}`, maxSim <= 1 && `max${maxSim}`, subset && "subset", fixSchema && "fixschema", doRepair && "repair"].filter(Boolean).join("-");
const tag = flag("tag", `${model.replace(/[:/]/g, "_")}-${mode}${variant ? "-" + variant : ""}${flag("set", "core") === "plans" ? "-plans" : flag("set", "core") === "new" ? "-new" : flag("set", "core") === "v5" ? "-v5" : ""}`);
const guard = !flag("no-memory-guard");
let cases = loadCases(flag("set", "core"));
const pick = makeRetriever(cases);
if (flag("ids")) { const s = new Set(flag("ids").split(",")); cases = cases.filter((c) => s.has(c.id)); }
if (flag("cat")) cases = cases.filter((c) => c.cat === flag("cat"));
if (flag("limit")) {
  // an evenly spread subset so tiers stay represented
  const n = Number(flag("limit")), step = cases.length / n;
  cases = Array.from({ length: n }, (_, i) => cases[Math.floor(i * step)]);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePct = () => { try { return Number(/(\d+)%/.exec(execSync("memory_pressure | tail -1").toString())[1]); } catch { return 100; } };
const rssMb = () => {
  // everything named ollama (server + runner), in MB
  try { return execSync("ps -axo rss=,comm= | grep -i ollama | grep -v grep | awk '{s+=$1} END {print s/1024}'").toString().trim() * 1; } catch { return 0; }
};
async function waitForMemory() {
  if (!guard) return true;
  const t0 = Date.now();
  while (freePct() < 30) {
    if (Date.now() - t0 > 10 * 60 * 1000) return false;
    console.error(`memory low (${freePct()}% free), waiting...`);
    await sleep(15000);
  }
  return true;
}

const SCHEMA = buildSchema();
const promptKind = flag("prompt", "long"); // short = the fine-tuning prompt (lib/spec.mjs SHORT_SYSTEM), no reference
const system = (only) => {
  let s = promptKind === "short" ? SHORT_SYSTEM : buildReference(only);
  if (mode === "free") s += "\nReply with ONLY the JSON object, no explanation.";
  return s;
};
const fixtureIds = (fx) => new Set(fx ? loadFixture(fx).map((x) => x.as).filter(Boolean) : []);
const stateOf = (fx) => (fx ? fixtureDesc(fx) : "empty model");
/** the prompt (and, with --subset, the narrowed schema) for one request */
function prompt(c) {
  const ex = [...FEW_SHOT.slice(0, shots).map(([q, a, fx]) => ({ q, a, fx }))];
  const got = retrieveK ? pick(c, retrieveK, { maxSim }) : [];
  for (const { p } of got) ex.push({ q: p.request, a: { commands: p.gold }, fx: p.fixture });
  const only = subset ? subsetFor(c, got) : null;
  const m = [{ role: "system", content: system(only) }];
  for (const { q, a, fx } of ex) { m.push({ role: "user", content: `Model state: ${stateOf(fx)}\nRequest: ${q}` }); m.push({ role: "assistant", content: JSON.stringify(a) }); }
  m.push({ role: "user", content: `Model state: ${c.state || stateOf(c.fixture)}\nRequest: ${c.request}` });
  return { messages: m, schema: only ? buildSchema(only) : SCHEMA, only, shotIds: got.map(({ p }) => p.id) };
}

function parseFree(text) {
  let t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const tryJson = (s) => { try { return JSON.parse(s); } catch { return undefined; } };
  let v = tryJson(t);
  if (v === undefined) { const a = t.indexOf("{"), b = t.lastIndexOf("}"); if (a >= 0 && b > a) v = tryJson(t.slice(a, b + 1)); }
  if (v === undefined) { const a = t.indexOf("["), b = t.lastIndexOf("]"); if (a >= 0 && b > a) v = tryJson(t.slice(a, b + 1)); }
  if (v === undefined) { // JSON lines
    const lines = t.split("\n").map((l) => tryJson(l.trim())).filter((x) => x && typeof x === "object");
    if (lines.length) v = lines;
  }
  if (Array.isArray(v)) return v;
  if (v && Array.isArray(v.commands)) return v.commands;
  if (v && typeof v === "object" && v.cmd) return [v];
  return null;
}
const names = new Set(COMMANDS.map((c) => c[0]));
const reqs = Object.fromEntries(COMMANDS.map(([n, f]) => [n, Object.entries(f).filter(([, c]) => !c.endsWith("?")).map(([k]) => k)]));
const schemaValid = (cmds) => Array.isArray(cmds) && cmds.length > 0 && cmds.every((c) => c && names.has(c.cmd) && reqs[c.cmd].every((k) => k in c));

async function ask(c) {
  const pr = prompt(c);
  const body = { model, messages: pr.messages, stream: false, think: false, keep_alive: "10m", options: { temperature: 0, seed: 7, num_ctx: flag("set", "core") === "plans" ? 8192 : 4096, num_predict: flag("set", "core") === "plans" ? 3000 : 900 } };
  if (mode === "constrained") body.format = pr.schema;
  const t0 = Date.now();
  const res = await fetch(`${HOST}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutS * 1000) });
  const j = await res.json();
  if (j.error) throw new Error(j.error);
  return { only: pr.only, shotIds: pr.shotIds, text: j.message?.content ?? "", wall: Date.now() - t0, load: (j.load_duration || 0) / 1e6, promptTok: j.prompt_eval_count, genTok: j.eval_count, evalMs: (j.eval_duration || 0) / 1e6, promptMs: (j.prompt_eval_duration || 0) / 1e6 };
}

mkdirSync(join(here, "results"), { recursive: true });
const rows = [];
let peakRss = 0, skipped = false;
for (const [i, c] of cases.entries()) {
  if (!(await waitForMemory())) { skipped = true; console.error("memory never recovered: stopping, partial results saved"); break; }
  let commands, ans = null, parseOk = true, valid = true, err = null, raw0;
  try {
    if (model === "gold") commands = c.gold;
    else if (model === "noop") commands = [{ cmd: "info" }];
    else {
      ans = await ask(c);
      commands = mode === "constrained" ? JSON.parse(ans.text).commands : parseFree(ans.text);
      if (doRepair && commands) { raw0 = commands; commands = repair(commands, fixtureIds(c.fixture)); }
      if (!commands) { parseOk = false; }
      else valid = schemaValid(commands);
    }
  } catch (e) { err = String(e.message || e); parseOk = false; }
  const rss = rssMb(); peakRss = Math.max(peakRss, rss);
  const g = parseOk && commands ? await runCase(c, commands) : { pass: false, errs: [err || "output was not a parseable command list"], stage: "parse", engineMs: 0 };
  rows.push({ id: c.id, tier: c.tier, cat: c.cat || null, request: c.request, pass: g.pass, stage: g.stage, errs: g.errs, parseOk, schemaValid: parseOk ? valid : false, commands, ms: ans ? ans.wall - ans.load : 0, load: ans?.load || 0, promptTok: ans?.promptTok, genTok: ans?.genTok, tokPerSec: ans && ans.evalMs ? ans.genTok / (ans.evalMs / 1000) : null, rssMb: rss, subset: ans?.only?.length, repaired: raw0 && JSON.stringify(raw0) !== JSON.stringify(commands) ? raw0 : undefined, shotIds: ans?.shotIds?.length ? ans.shotIds : undefined, raw: parseOk ? undefined : ans?.text?.slice(0, 400) });
  if ((i + 1) % 10 === 0 || i + 1 === cases.length) console.error(`${i + 1}/${cases.length} pass so far ${rows.filter((r) => r.pass).length}  rss ${rss.toFixed(0)}MB  free ${freePct()}%`);
}

const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) + "%" : "-");
const by = (f) => { const m = {}; for (const r of rows) { const k = f(r); if (k == null) continue; (m[k] ||= []).push(r); } return m; };
const med = (xs) => { xs = xs.filter((x) => x != null).sort((a, b) => a - b); return xs.length ? xs[Math.floor(xs.length / 2)] : null; };
const summary = {
  tag, model, mode, shots, retrieve: retrieveK, maxSim: maxSim <= 1 ? maxSim : null, subset, repair: doRepair, fixSchema, variant, n: rows.length, skipped, pass: rows.filter((r) => r.pass).length,
  tiers: Object.fromEntries(Object.entries(by((r) => r.tier)).map(([k, v]) => [k, { n: v.length, pass: v.filter((r) => r.pass).length }])),
  a11y: (() => { const v = rows.filter((r) => r.cat === "a11y"); return { n: v.length, pass: v.filter((r) => r.pass).length }; })(),
  parseOk: rows.filter((r) => r.parseOk).length, schemaValid: rows.filter((r) => r.schemaValid).length,
  engineAccepted: rows.filter((r) => r.stage !== "engine" && r.stage !== "parse" && r.stage !== "empty").length,
  medianMs: med(rows.map((r) => r.ms)), p90Ms: (() => { const x = rows.map((r) => r.ms).filter(Boolean).sort((a, b) => a - b); return x.length ? x[Math.floor(x.length * 0.9)] : null; })(),
  medianGenTok: med(rows.map((r) => r.genTok)), medianTokPerSec: med(rows.map((r) => r.tokPerSec)), promptTok: med(rows.map((r) => r.promptTok)), loadMs: Math.max(0, ...rows.map((r) => r.load)),
  peakOllamaRssMb: Math.round(peakRss),
};
writeFileSync(join(here, "results", `${tag}.json`), JSON.stringify({ summary, rows }, null, 1));
console.log(`\n${tag}: ${summary.pass}/${summary.n} = ${pct(summary.pass, summary.n)}`);
for (const [k, v] of Object.entries(summary.tiers)) console.log(`  ${k.padEnd(7)} ${v.pass}/${v.n} ${pct(v.pass, v.n)}`);
console.log(`  a11y    ${summary.a11y.pass}/${summary.a11y.n} ${pct(summary.a11y.pass, summary.a11y.n)}`);
console.log(`  parsed ${pct(summary.parseOk, rows.length)}  schema-valid ${pct(summary.schemaValid, rows.length)}  engine-accepted ${pct(summary.engineAccepted, rows.length)}`);
console.log(`  latency median ${summary.medianMs?.toFixed(0)} ms, p90 ${summary.p90Ms?.toFixed(0)} ms, ${summary.medianTokPerSec?.toFixed(1)} tok/s, prompt ${summary.promptTok} tok, peak ollama RSS ${summary.peakOllamaRssMb} MB`);
