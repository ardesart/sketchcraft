// Run one eval case: scratch engine -> fixture -> the model's commands -> inspect -> grade.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Session } from "./engine.mjs";
import { grade } from "./check.mjs";
import { probeErrs, probePre } from "./probe.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const evalDir = join(here, "../eval");
// set "plans": the route 2 plan cases (eval/plan_cases.jsonl, written by gen_plans.mjs --eval, with the owner's townhouse)
export const loadCases = (set = "core") => readFileSync(join(evalDir, ({ plans: "plan_cases.jsonl", new: "new_cases.jsonl", v5: "v5_cases.jsonl" })[set] || "cases.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
export const loadFixture = (name) => readFileSync(join(evalDir, "fixtures", `${name}.jsonl`), "utf8").split("\n").filter((l) => l.trim() && !l.startsWith("#")).map((l) => JSON.parse(l));
export const fixtureDesc = (name) => JSON.parse(readFileSync(join(evalDir, "fixtures.json"), "utf8"))[name];

export const INSPECT = new Set(["info", "parts", "faces", "volume", "pick", "components", "levels", "report", "room_info", "rooms", "room_preview", "wall_info", "texture_uv", "texture_frame", "vertex_colors", "texture_paint_status", "uv_info", "texture_pixels"]);
export const sig = (s) => JSON.stringify([s.info.faces, s.info.bounds, (s.info.groups || []).length, (s.info.instances || []).length, s.faces.map((f) => f.material).join("|")]);

/** @returns {{pass:boolean, errs:string[], stage:string, engineMs:number}} */
export async function runCase(c, commands) {
  const t0 = Date.now();
  const s = await new Session().init();
  try {
    // a case may carry its own starting model as commands (`setup`, e.g. a floorplan_build), else a named fixture
    if (c.setup?.length || c.fixture) {
      const f = await s.run(c.setup?.length ? c.setup : loadFixture(c.fixture));
      if (!f.ok) return { pass: false, errs: [`fixture failed: ${f.error}`], stage: "fixture", engineMs: Date.now() - t0 };
    }
    const before = c.check.readonly ? await s.inspect() : null;
    if (!Array.isArray(commands) || commands.length === 0) return { pass: false, errs: ["no commands"], stage: "empty", engineMs: Date.now() - t0 };
    const pre = await probePre(s, c.check);
    const r = await s.run(commands);
    if (!r.ok) return { pass: false, errs: [`engine rejected command ${r.failedAt}: ${r.error || r.stopped || "unknown"}`], stage: "engine", engineMs: Date.now() - t0 };
    const after = await s.inspect();
    let errs = grade(c.check, after, r.replies);
    errs.push(...(await probeErrs(s, c.check, pre)));
    if (c.check.readonly) {
      if (!commands.some((x) => INSPECT.has(x.cmd))) errs.push("no read-only inspect command was used");
      if (sig(before) !== sig(after)) errs.push("a question changed the model");
    }
    return { pass: errs.length === 0, errs, stage: errs.length ? "check" : "ok", engineMs: Date.now() - t0 };
  } finally {
    s.close();
  }
}
