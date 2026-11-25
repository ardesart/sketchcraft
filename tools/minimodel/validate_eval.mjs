#!/usr/bin/env node
// Validates the eval set itself: every case's reference solution (`gold`) must pass its own check
// in the real engine. Run before trusting any score. Usage: node validate_eval.mjs [caseIdPrefix...]
import { loadCases, runCase } from "./lib/run_case.mjs";

const only = process.argv.slice(2);
const cases = loadCases().filter((c) => !only.length || only.some((o) => c.id.startsWith(o)));
let bad = 0;
for (const c of cases) {
  const r = await runCase(c, c.gold);
  if (!r.pass) { bad++; console.log(`FAIL ${c.id} [${c.tier}] ${c.request}\n     ${r.errs.join("\n     ")}`); }
}
console.log(`${cases.length - bad}/${cases.length} gold solutions pass their checks`);
process.exit(bad ? 1 : 0);
