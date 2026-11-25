#!/usr/bin/env node
// Turns results/*.json into the markdown tables used in docs/dev/minimodel-spike.md.
//   node report.mjs            tables
//   node report.mjs --fails m  failure examples for results whose tag contains m
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "results");
const all = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
const label = (s) => s.mode + (s.variant ? "+" + s.variant : s.shots ? "+" + s.shots + "shot" : "");
const p = (a, b) => (b ? Math.round((100 * a) / b) + "%" : "-");
const fi = process.argv.indexOf("--fails");
if (fi > 0) {
  const m = process.argv[fi + 1];
  for (const r of all.filter((x) => x.summary.tag.includes(m))) {
    console.log(`\n## ${r.summary.tag}`);
    const stages = {};
    r.rows.filter((x) => !x.pass).forEach((x) => (stages[x.stage] = (stages[x.stage] || 0) + 1));
    console.log("failure stages:", JSON.stringify(stages));
    for (const x of r.rows.filter((x) => !x.pass).slice(0, Number(process.argv[fi + 2] || 12)))
      console.log(`- ${x.id} [${x.tier}] "${x.request}"\n    ${x.stage}: ${(x.errs[0] || "").slice(0, 160)}\n    ${JSON.stringify(x.commands ?? x.raw).slice(0, 220)}`);
  }
  process.exit(0);
}
console.log("| model | mode | overall | easy | medium | hard | a11y | parse | schema-valid | engine-ok | median s/req | tok/s | peak RSS MB |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const { summary: s } of all) {
  const t = s.tiers;
  console.log(`| ${s.model} | ${label(s)} | ${p(s.pass, s.n)} (${s.pass}/${s.n}) | ${p(t.easy?.pass, t.easy?.n)} | ${p(t.medium?.pass, t.medium?.n)} | ${p(t.hard?.pass, t.hard?.n)} | ${p(s.a11y.pass, s.a11y.n)} | ${p(s.parseOk, s.n)} | ${p(s.schemaValid, s.n)} | ${p(s.engineAccepted, s.n)} | ${s.medianMs ? (s.medianMs / 1000).toFixed(1) : "-"} | ${s.medianTokPerSec ? s.medianTokPerSec.toFixed(0) : "-"} | ${s.peakOllamaRssMb || "-"} |`);
}

// Secondary models ran an evenly spread 100-request subset (--limit 100). For a full 201-request result, restate it on
// that same subset so models are comparable.
const full = all.filter((x) => x.summary.n === 201);
if (full.length) {
  const set = new Set(Array.from({ length: 100 }, (_, i) => full[0].rows[Math.floor((i * 201) / 100)].id));
  console.log("\nSame 100-request subset, from the full runs:\n\n| model | mode | overall | easy | medium | hard | a11y |\n|---|---|---|---|---|---|---|");
  for (const { summary: s, rows } of full) {
    const r = rows.filter((x) => set.has(x.id));
    const c = (f) => { const v = r.filter(f); return p(v.filter((x) => x.pass).length, v.length) + ` (${v.length})`; };
    console.log(`| ${s.model} | ${label(s)} | ${c(() => true)} | ${c((x) => x.tier === "easy")} | ${c((x) => x.tier === "medium")} | ${c((x) => x.tier === "hard")} | ${c((x) => x.cat === "a11y")} |`);
  }
}
