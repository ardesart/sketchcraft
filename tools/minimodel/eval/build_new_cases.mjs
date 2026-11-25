// Generates eval/new_cases.jsonl: the v4 "new features" eval category (Room mode, picture materials, projection, Position
// Texture, vertex paint, UV, lightmap UV, texture painting). A separate set, so the core (201) and plan (56) numbers stay
// comparable with v3. Same shape as the core cases: {id, tier, cat, request, fixture, state, setup, gold, check}; `gold` only
// proves the check can be satisfied (validate with: node eval/build_new_cases.mjs --validate). Never used as training data
// (lib/heldout.mjs reads this file too).  Run: node tools/minimodel/eval/build_new_cases.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pngUrl } from "../lib/png.mjs";
const here = dirname(fileURLToPath(import.meta.url));
const FT = 0.3048, r4 = (v) => +(+v).toFixed(4), fmt = (v) => String(+(+v).toFixed(3));
const cases = [];
let n = 0;
const add = (tier, request, fx, gold, check) => cases.push({ id: `n${String(++n).padStart(3, "0")}`, tier, cat: "new", request, fixture: fx?.kind || null, state: fx?.desc || "empty model", setup: fx?.setup || [], gold, check });
const E = (...a) => add("easy", ...a), M = (...a) => add("medium", ...a), H = (...a) => add("hard", ...a);

// ---- fixtures (same wording as the training fixtures; dimensions chosen here, held out by gen_data)
const roomM = (name, w, d) => ({
  kind: "roomm", name, w, d,
  setup: [{ cmd: "room_rect", from: [0, 0, 0], to: [w, d, 0], name }, { cmd: "pick", at: [r4(w / 2), r4(d + 0.1), 1], as: "north_out" }, { cmd: "pick", at: [r4(w + 0.1), r4(d / 2), 1], as: "east_out" }, { cmd: "pick", at: [r4(w / 2), -0.1, 1], as: "south_out" }, { cmd: "pick", at: [-0.1, r4(d / 2), 1], as: "west_out" }],
  desc: `A room named "${name}" built in Room mode: wall centerlines x 0..${fmt(w)} m, y 0..${fmt(d)} m, walls 0.2 m thick and 2.7 m high (a group; the inside is ${fmt(r4(w - 0.2))} by ${fmt(r4(d - 0.2))} m). @north_out, @south_out, @east_out and @west_out are the outer faces of its four walls (each faces away from the room, so pulling it by a positive amount moves that wall outward).`,
});
const twoRooms = (n1, w1, d1, n2, w2, d2) => ({
  kind: "tworooms", setup: [{ cmd: "room_rect", from: [0, 0, 0], to: [w1, d1, 0], name: n1 }, { cmd: "room_rect", from: [w1, 0, 0], to: [r4(w1 + w2), d2, 0], name: n2 }],
  desc: `Two rooms built in Room mode: "${n1}" (wall centerlines x 0..${fmt(w1)}, y 0..${fmt(d1)}) and "${n2}" (x ${fmt(w1)}..${fmt(r4(w1 + w2))}, y 0..${fmt(d2)}), sharing the wall at x = ${fmt(w1)}. Walls 0.2 m thick, 2.7 m high.`,
});
const RGB = { brick: [190, 80, 60], wood: [150, 100, 50], stone: [130, 130, 135], tiles: [60, 140, 190], concrete: [160, 160, 155], metal: [120, 125, 135], marble: [235, 235, 240], plaster: [225, 215, 195], slate: [70, 80, 90] };
const box = (name, w, d, h, ms, extra = [], note = "") => ({
  kind: "texbox" + (extra.length ? "+" : ""), name, w, d, h,
  setup: [{ cmd: "begin_group", name, as: name }, { cmd: "rect", from: [0, 0, 0], to: [w, d, 0], as: "f" }, { cmd: "pushpull", face: "@f", distance: h, as: "top" }, { cmd: "end_group" }, { cmd: "pick", at: [r4(w / 2), 0, r4(h / 2)], as: "front" }, { cmd: "pick", at: [w, r4(d / 2), r4(h / 2)], as: "side" }, ...ms.map((m) => ({ cmd: "texture", name: m, data: pngUrl(RGB[m]), width: 0.5, height: 0.5 })), ...extra],
  desc: `@${name} is a group named "${name}": a box ${fmt(w)} m (x) by ${fmt(d)} m (y) by ${fmt(h)} m tall, one corner at the origin. @top is its top face, @front its front (south, y = 0) face and @side its east (x = ${fmt(w)}) face. The model has these picture materials: ${ms.slice(0, -1).join(", ")} and ${ms.at(-1)}.${note ? " " + note : ""}`,
});
const inside = (x0, y0, x1, y1, t = 0.2) => [r4(x0 + t / 2), r4(y0 + t / 2), r4(x1 - t / 2), r4(y1 - t / 2)];
const rooms = (...exp) => ({ probes: [{ cmd: { cmd: "rooms" }, expect: exp }] });
const rin = (name, v, tol = 0.03) => ({ path: "rooms", find: { name }, get: "inside", op: "approx", value: v, tol });
const rarea = (name, v) => ({ path: "rooms", find: { name }, get: "area", op: "approx", value: r4(v), tol: 0.05 });
const mat = (name, where, all = true) => ({ name, where, all });
const TOP = (h) => ({ normal: [0, 0, 1], z: [h - 0.01, h + 0.01] }), FRONT = { normal: [0, -1, 0] }, EAST = { normal: [1, 0, 0] };
const tint = (c, s = 1) => [...c.map((x) => r4(1 - s * (1 - x))), 1];

// ---------------- rooms
E("build a 4 by 5 meter room called Study", null, [{ cmd: "room_rect", from: [0, 0, 0], to: [4, 5, 0], name: "Study" }], rooms({ path: "rooms", op: "len", value: 1 }, rin("Study", inside(0, 0, 4, 5))));
E("a room 15 feet by 12 feet", null, [{ cmd: "room_rect", from: [0, 0, 0], to: [4.572, 3.6576, 0] }], rooms({ path: "rooms", op: "len", value: 1 }, { path: "rooms.0.inside", op: "approx", value: inside(0, 0, 4.572, 3.6576), tol: 0.03 }));
E("add a 3.5 x 3 m room named Pantry with its corner at (10, 2)", null, [{ cmd: "room_rect", from: [10, 2, 0], to: [13.5, 5, 0], name: "Pantry" }], rooms(rin("Pantry", inside(10, 2, 13.5, 5))));
M("a room 6 m by 4 m, walls 15 cm thick and 3 m high", null, [{ cmd: "room_rect", from: [0, 0, 0], to: [6, 4, 0], thickness: 0.15, height: 3 }], { ...rooms({ path: "rooms.0.inside", op: "approx", value: inside(0, 0, 6, 4, 0.15), tol: 0.03 }), bbox: { size: [null, null, 3], tol: 0.06 } });
const kit = roomM("Kitchen", 5, 4);
M("put a 3 by 4 meter room called Dining to the east of the Kitchen, sharing a wall", kit, [{ cmd: "room_rect", from: [5, 0, 0], to: [8, 4, 0], name: "Dining" }], rooms({ path: "rooms", op: "len", value: 2 }, rin("Dining", inside(5, 0, 8, 4))));
const bed = roomM("Bedroom", r4(12 * FT), r4(10 * FT));
M("attach an 8 ft wide, 6 ft deep room named Closet on the north side of the Bedroom", bed, [{ cmd: "room_rect", from: [0, bed.d, 0], to: [r4(8 * FT), r4(bed.d + 6 * FT), 0], name: "Closet" }], rooms({ path: "rooms", op: "len", value: 2 }, rin("Closet", inside(0, bed.d, r4(8 * FT), r4(bed.d + 6 * FT)))));
const stu = roomM("Studio", 6, 3.5);
H("make the Studio bigger: a 2 m deep, 1.5 m wide bump-out on the east wall, 1 m up from the south wall, as part of the same room", stu, [{ cmd: "room_rect", from: [5.5, 1, 0], to: [8, 2.5, 0], mode: "combine" }], rooms({ path: "rooms", op: "len", value: 1 }, rarea("Studio", 24 - 23 * 0.1 + 0.04)));
const off = roomM("Office", 4, 3);
H("cut a 1.5 by 1 m notch out of the north-west corner of the Office", off, [{ cmd: "room_rect", from: [-1, 2, 0], to: [1.5, 4, 0], mode: "subtract" }], rooms({ path: "rooms", op: "len", value: 1 }, rarea("Office", 10.5 - 14 * 0.1 + 0.04)));
M("push the east wall out 1 m", kit, [{ cmd: "wall_pull", face: "@east_out", by: 1 }], rooms(rin("Kitchen", inside(0, 0, 6, 4))));
M("bring the north wall in by 50 cm", kit, [{ cmd: "wall_pull", face: "@north_out", by: -0.5 }], rooms(rin("Kitchen", inside(0, 0, 5, 3.5))));
M("move the west wall 3 feet further out", bed, [{ cmd: "wall_pull", face: "@west_out", by: r4(3 * FT) }], rooms(rin("Bedroom", inside(r4(-3 * FT), 0, bed.w, bed.d))));
E("what would move if I pulled the south wall?", kit, [{ cmd: "wall_info", face: "@south_out" }], { readonly: true });
M("would a 3 by 3 m room fit north of the Kitchen?", kit, [{ cmd: "room_preview", from: [0, 4, 0], to: [3, 7, 0] }], { readonly: true });
const dh = twoRooms("Den", 5, 4, "Hall", 2.5, 3);
E("which rooms are in the model?", dh, [{ cmd: "rooms" }], { readonly: true });
E("how big is the Hall?", dh, [{ cmd: "room_info", name: "Hall" }], { readonly: true });
H("a 5 by 4 m Bedroom with a 2 by 4 m Bath on its east side, sharing the wall", null, [{ cmd: "room_rect", from: [0, 0, 0], to: [5, 4, 0], name: "Bedroom" }, { cmd: "room_rect", from: [5, 0, 0], to: [7, 4, 0], name: "Bath" }], rooms({ path: "rooms", op: "len", value: 2 }, rin("Bedroom", inside(0, 0, 5, 4)), rin("Bath", inside(5, 0, 7, 4))));

// ---------------- picture materials
const shed = box("shed", 4, 3, 2.5, ["brick", "wood", "stone"]);
E("put the brick texture on the shed", shed, [{ cmd: "paint", ids: ["@shed"], material: "brick" }], { material: [mat("brick", {})] });
E("make the roof wood", shed, [{ cmd: "paint", ids: ["@top"], material: "wood" }], { material: [mat("wood", TOP(2.5))] });
E("stone for the front wall", shed, [{ cmd: "paint", ids: ["@front"], material: "stone" }], { material: [mat("stone", FRONT)] });
M("front wall brick, top stone", shed, [{ cmd: "paint", ids: ["@front"], material: "brick" }, { cmd: "paint", ids: ["@top"], material: "stone" }], { material: [mat("brick", FRONT), mat("stone", TOP(2.5))] });
const mixed = box("shed", 4, 3, 2.5, ["brick", "wood", "stone"], [{ cmd: "paint", ids: ["@shed"], material: "brick" }, { cmd: "paint", ids: ["@top"], material: "wood" }], "The shed is painted brick everywhere except its top, which is wood.");
H("turn all the brick into stone but keep the wood", mixed, [{ cmd: "paint", ids: ["@front"], material: "stone", scope: "all" }], { material: [mat("wood", TOP(2.5)), { name: "brick", none: true }, { name: "stone", min: 5 }] });
M("carry the stone around the corner from the front to the east wall in one piece", shed, [{ cmd: "paint", ids: ["@front", "@side"], material: "stone", through: true }], { material: [mat("stone", FRONT), mat("stone", EAST)] });
M("wrap the brick around the shed like a cylinder", shed, [{ cmd: "texture_project", entity: "@shed", mode: "cylinder", material: "brick" }], { material: [{ name: "brick", min: 6 }] });
M("project the wood onto the shed from above at twice the size", shed, [{ cmd: "texture_project", entity: "@shed", mode: "planar", material: "wood", axis: [0, 0, -1], scale: 2 }], { material: [{ name: "wood", min: 6 }] });
M("sphere-map the stone onto the front face", shed, [{ cmd: "texture_project", faces: ["@front"], mode: "sphere", material: "stone" }], { material: [mat("stone", FRONT)], probes: [{ cmd: { cmd: "texture_uv", faces: ["@front"] }, expect: [{ path: "uv", op: "all_nonnull" }] }] });
const proj = box("shed", 4, 3, 2.5, ["brick", "wood", "stone"], [{ cmd: "texture_project", entity: "@shed", mode: "box", material: "brick" }], "The shed wears brick with a box projection.");
E("take the projection off the shed", proj, [{ cmd: "texture_project", entity: "@shed", mode: "clear" }], { probes: [{ cmd: { cmd: "texture_uv", faces: ["@front", "@side", "@top"] }, expect: [{ path: "uv", op: "all_null" }] }] });
const wallBrick = box("shed", 4, 3, 2.5, ["brick", "wood", "stone"], [{ cmd: "paint", ids: ["@front"], material: "brick" }], "The front face wears brick.");
const fr = (extra) => ({ material: [mat("brick", FRONT)], probes: [{ cmd: { cmd: "texture_frame", face: "@front" }, before: true, expect: extra }] });
M("shift the brick on the front 10 cm to the right", wallBrick, [{ cmd: "texture_position", face: "@front", transform: { offset: [0.1, 0] } }], fr([{ path: "picture", op: "delta", value: [0.1, 0], tol: 0.005 }, { path: "own", op: "eq", value: true }]));
M("rotate the front brick by 45 degrees", wallBrick, [{ cmd: "texture_position", face: "@front", transform: { rotation: 45 } }], fr([{ path: "own", op: "eq", value: true }]));
M("make the brick on the front twice as big", wallBrick, [{ cmd: "texture_position", face: "@front", transform: { scale: 2 } }], fr([{ path: "own", op: "eq", value: true }]));
H("slide the front texture 5 cm left and 20 cm up", wallBrick, [{ cmd: "texture_position", face: "@front", transform: { offset: [-0.05, 0.2] } }], fr([{ path: "picture", op: "delta", value: [-0.05, 0.2], tol: 0.005 }, { path: "own", op: "eq", value: true }]));
const hand = box("shed", 4, 3, 2.5, ["brick", "wood", "stone"], [{ cmd: "paint", ids: ["@front"], material: "brick" }, { cmd: "texture_position", face: "@front", transform: { offset: [0.3, 0.1] } }], "The front face wears brick. The picture on the front face was moved by hand.");
E("reset the brick placement on the front", hand, [{ cmd: "texture_position", face: "@front", reset: true }], { material: [mat("brick", FRONT)], probes: [{ cmd: { cmd: "texture_frame", face: "@front" }, expect: [{ path: "own", op: "eq", value: false }] }] });
E("show me the texture coordinates of the front face", proj, [{ cmd: "texture_uv", faces: ["@front"] }], { readonly: true });

// ---------------- vertex paint
const cabin = box("cabin", 6, 4, 3, ["tiles", "concrete", "metal"]);
const BLUE = [0, 0, 1], ORANGE = [1, 0.5, 0], RED = [1, 0, 0];
E("tint the whole cabin blue using vertex colors", cabin, [{ cmd: "vertex_paint", entity: "@cabin", color: BLUE }], { probes: [{ cmd: { cmd: "vertex_colors", faces: ["@top", "@front", "@side"] }, expect: [{ path: "colors", op: "corners_eq", value: tint(BLUE), tol: 0.02 }] }] });
E("vertex paint the roof orange at half strength", cabin, [{ cmd: "vertex_paint", faces: ["@top"], color: ORANGE, strength: 0.5 }], { probes: [{ cmd: { cmd: "vertex_colors", faces: ["@top"] }, expect: [{ path: "colors", op: "corners_eq", value: tint(ORANGE, 0.5), tol: 0.02 }] }] });
H("brush a red vertex paint spot with a 40 cm brush at the top right corner of the front wall", cabin, [{ cmd: "vertex_paint", faces: ["@front"], color: RED, points: [[6, 0, 3]], radius: 0.4 }], { probes: [{ cmd: { cmd: "vertex_colors", faces: ["@front"] }, expect: [{ path: "colors", op: "tinted_min", value: 1 }] }] });
const washed = box("cabin", 6, 4, 3, ["tiles", "concrete", "metal"], [{ cmd: "vertex_paint", entity: "@cabin", color: [0, 0.6, 0] }], "The whole cabin has a green vertex color wash.");
E("remove the vertex paint from the cabin", washed, [{ cmd: "vertex_paint_clear", entity: "@cabin" }], { probes: [{ cmd: { cmd: "vertex_colors", faces: ["@top", "@front", "@side"] }, expect: [{ path: "colors", op: "all_null" }] }] });
E("what are the vertex colors on the front face?", washed, [{ cmd: "vertex_colors", faces: ["@front"] }], { readonly: true });

// ---------------- UV
const gar = box("garage", 7, 5, 3, ["marble", "plaster", "slate"]);
const UVOK = (nm) => ({ probes: [{ cmd: { cmd: "uv_info", entity: `@${nm}` }, expect: [{ path: "without", op: "len", value: 0 }, { path: "faces.*.uv", op: "within01" }] }] });
M("UV unwrap the garage", gar, [{ cmd: "uv_unwrap", entity: "@garage" }], UVOK("garage"));
M("unwrap the cabin by angle, cutting seams at every edge sharper than 50 degrees", cabin, [{ cmd: "uv_unwrap", entity: "@cabin", method: "angle", seams: "auto", angle: 50 }], UVOK("cabin"));
M("mark seams on the garage's edges sharper than 40°", gar, [{ cmd: "uv_seam", entity: "@garage", auto: 40 }], { probes: [{ cmd: { cmd: "uv_info", entity: "@garage" }, expect: [{ path: "seams", op: "len", value: 12 }] }] });
M("generate a lightmap UV set for the garage", gar, [{ cmd: "uv_lightmap", entity: "@garage" }], { probes: [{ cmd: { cmd: "uv_info", entity: "@garage", set: 2 }, expect: [{ path: "without", op: "len", value: 0 }, { path: "faces.*.uv", op: "within01" }] }] });
const lm = box("garage", 7, 5, 3, ["marble", "plaster", "slate"], [{ cmd: "uv_lightmap", entity: "@garage" }], "The garage has a lightmap UV set.");
E("drop the lightmap channel from the garage", lm, [{ cmd: "uv_lightmap", entity: "@garage", clear: true }], { probes: [{ cmd: { cmd: "uv_info", entity: "@garage", set: 2 }, expect: [{ path: "faces", op: "len", value: 0 }] }] });
const gu = box("garage", 7, 5, 3, ["marble", "plaster", "slate"], [{ cmd: "uv_unwrap", entity: "@garage" }], "The garage has been UV-unwrapped (it has UVs).");
H("move the front face's UVs 0.15 to the right in UV space", gu, [{ cmd: "uv_transform", faces: ["@front"], matrix: [1, 0, 0, 1, 0.15, 0] }], { probes: [{ cmd: { cmd: "uv_info", faces: ["@front"] }, before: true, expect: [{ path: "faces.*.uv", op: "delta", value: [0.15, 0], tol: 0.002 }] }] });
const gm = box("garage", 7, 5, 3, ["marble", "plaster", "slate"], [{ cmd: "uv_unwrap", entity: "@garage" }, { cmd: "uv_transform", faces: ["@front", "@side", "@top"], matrix: [1, 0, 0, 1, 1.5, 0.7] }], "The garage has been UV-unwrapped, then its UVs were moved off the 0..1 sheet by hand.");
E("pack the garage UVs again with a 0.03 margin", gm, [{ cmd: "uv_pack", entity: "@garage", margin: 0.03 }], UVOK("garage"));
E("does the garage have UVs yet?", gar, [{ cmd: "uv_info", entity: "@garage" }], { readonly: true });

// ---------------- texture painting
M("create a 512 px paint texture named sign on the front wall", shed, [{ cmd: "texture_paint_new", faces: ["@front"], size: 512, name: "sign", unwrap: true }], { material: [mat("sign", FRONT)], probes: [{ cmd: { cmd: "texture_paint_status", faces: ["@front"] }, expect: [{ path: "paintable", op: "eq", value: true }] }] });
M("make the whole cabin paintable with a 1024 texture called hull, gray base", cabin, [{ cmd: "texture_paint_new", entity: "@cabin", size: 1024, name: "hull", unwrap: true, base: [0.5, 0.5, 0.5] }], { material: [{ name: "hull", min: 6 }] });
const banner = box("shed", 4, 3, 2.5, ["brick", "wood", "stone"], [{ cmd: "texture_paint_new", faces: ["@front"], size: 64, name: "banner", unwrap: true }], "@front wears a 64 px paint texture named banner (already unwrapped).");
const px = (c, min) => ({ probes: [{ cmd: { cmd: "texture_pixels", material: "banner", x: 0, y: 0, w: 64, h: 64 }, expect: [{ path: "pixels", op: "pixels_min", value: { color: c.map((v) => Math.round(v * 255)), min, tol: 20 } }] }] });
H("fill the banner with green", banner, [{ cmd: "texture_paint_stroke", material: "banner", faces: ["@front"], fill: true, color: [0, 0.6, 0] }], px([0, 0.6, 0], 200));
H("with a 50 cm brush, paint red on the banner at the center of the front face", banner, [{ cmd: "texture_paint_stroke", material: "banner", faces: ["@front"], points: [[2, 0, 1.25]], radius: 0.5, color: [1, 0, 0] }], px([1, 0, 0], 4));
E("is the front face ready for texture painting?", shed, [{ cmd: "texture_paint_status", faces: ["@front"] }], { readonly: true });

// ---------------- combos
H("brick the whole garage, then tint its roof yellow with vertex paint", box("garage", 7, 5, 3, ["brick", "plaster", "slate"]), [{ cmd: "paint", ids: ["@garage"], material: "brick" }, { cmd: "vertex_paint", faces: ["@top"], color: [1, 0.9, 0] }], { material: [{ name: "brick", min: 6 }], probes: [{ cmd: { cmd: "vertex_colors", faces: ["@top"] }, expect: [{ path: "colors", op: "corners_eq", value: tint([1, 0.9, 0]), tol: 0.02 }] }] });
H("unwrap the cabin and set it up as a 128 pixel paint texture called skin", cabin, [{ cmd: "uv_unwrap", entity: "@cabin" }, { cmd: "texture_paint_new", entity: "@cabin", size: 128, name: "skin" }], { material: [{ name: "skin", min: 6 }], ...UVOK("cabin") });

writeFileSync(join(here, "new_cases.jsonl"), cases.map((c) => JSON.stringify(c)).join("\n") + "\n");
console.log(`${cases.length} new-feature cases -> eval/new_cases.jsonl`);
if (process.argv.includes("--validate")) {
  const { runCase } = await import("../lib/run_case.mjs");
  let bad = 0;
  for (const c of cases) { const r = await runCase(c, c.gold); if (!r.pass) { bad++; console.log("GOLD FAILS", c.id, c.request, r.errs); } }
  console.log(bad ? `${bad} gold failures` : `${cases.length}/${cases.length} gold solutions pass their checks`);
  // and the controls: a do-nothing answer must not pass the non-readonly cases
  let leaks = 0;
  for (const c of cases.filter((c) => !c.check.readonly)) { const r = await runCase(c, [{ cmd: "info" }]); if (r.pass) { leaks++; console.log("NOOP PASSES", c.id, c.request); } }
  console.log(leaks ? `${leaks} cases a no-op passes` : "no-op controls: 0 pass");
  process.exit(bad ? 1 : 0);
}
