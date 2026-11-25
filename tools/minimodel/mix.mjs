#!/usr/bin/env node
// Builds a training mix from chat JSONL files (to_chat.mjs output) and re-applies the held-out rules of TODAY's eval sets to
// every row, so pairs made before a newer eval set existed (v3/v4 data vs eval/v5_cases.jsonl) cannot leak into training.
// The request and the answer are read back out of each chat row; the gold rule is applied without the starting-model kind
// (chat rows do not carry it), which is stricter than gen_data.mjs. Duplicate ids and duplicate (state, request) pairs
// are dropped. Usage:
//   node mix.mjs --out DIR/train.chat.jsonl IN1.chat.jsonl IN2.chat.jsonl ...
import { readFileSync, writeFileSync } from "node:fs";
import { goldSig, makeHeldout } from "./lib/heldout.mjs";
import { loadCases } from "./lib/run_case.mjs";

const args = process.argv.slice(2);
const oi = args.indexOf("--out");
const out = oi >= 0 ? args[oi + 1] : null;
const ins = args.filter((a, i) => a !== "--out" && i !== oi + 1);
if (!out || !ins.length) { console.error("usage: node mix.mjs --out OUT.chat.jsonl IN.chat.jsonl..."); process.exit(2); }

const heldout = makeHeldout();
const cases = [...loadCases(), ...loadCases("new"), ...loadCases("v5")];
const kindFree = (cmds) => goldSig(null, cmds).replace(/^[^|]*\|/, "");
const gold = new Map(cases.filter((c) => c.gold?.length).map((c) => [kindFree(c.gold), c.id]));
const hasNums = (s) => !s.endsWith("|");

const seenId = new Set(), seenReq = new Set(), stats = {};
const bump = (k) => (stats[k] = (stats[k] || 0) + 1);
const kept = [];
for (const f of ins) {
  for (const line of readFileSync(f, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const user = row.messages.find((m) => m.role === "user")?.content || "";
    const m = /^Model state: ([\s\S]*)\nRequest: ([\s\S]*)$/.exec(user);
    if (!m) { bump("unparsable"); continue; }
    const [, state, request] = m;
    let cmds = [];
    try { cmds = JSON.parse(row.messages.find((x) => x.role === "assistant").content).commands; } catch { bump("bad answer"); continue; }
    if (row.id && seenId.has(row.id)) { bump("duplicate id"); continue; }
    const key = state + "\n" + request.toLowerCase().trim();
    if (seenReq.has(key)) { bump("duplicate request"); continue; }
    const h = heldout(request, null, cmds);
    if (h.bad) { bump("heldout " + h.bad); continue; }
    const g = kindFree(cmds);
    if (hasNums(g) && gold.has(g)) { bump("heldout gold (any state)"); continue; }
    if (row.id) seenId.add(row.id);
    seenReq.add(key);
    kept.push(line);
    bump("kept");
  }
}
writeFileSync(out, kept.join("\n") + "\n");
console.log(JSON.stringify({ out, inputs: ins, ...stats }, null, 1));
