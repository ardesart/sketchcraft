// Generates eval/v5_cases.jsonl: the v5 "Model tab + UV/texture" eval category (arcs and pies, Follow Me, text, guides,
// axes, resize, soften, divide, weld, explode curve, bevel, reverse, explode, ungroup, intersect, solid tools, slice, flip,
// subdivide, materials, picture tile size, texture pixels, and deeper UV / texture painting chains). A separate set, so the
// core, plan and v4 "new" numbers stay comparable. Same shape as the other sets: {id, tier, cat, request, fixture, state,
// setup, gold, check}; `gold` only proves the check can be satisfied. Never used as training data (lib/heldout.mjs reads
// this file too, and gen_data.mjs refuses its starting states).
//   node tools/minimodel/eval/build_v5_cases.mjs [--validate]
//   node tools/minimodel/run_eval.mjs --model MODEL --mode free --prompt short --set v5
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pngUrl } from "../lib/png.mjs";
import { compAt, edgedAt, ellAt, twoAt } from "../gen/templates_v5.mjs";
const here = dirname(fileURLToPath(import.meta.url));
const r4 = (v) => +(+v).toFixed(4), fmt = (v) => String(+(+v).toFixed(3)), FT = 0.3048, PI = Math.PI;
const cases = [];
let n = 0;
const add = (tier, request, fx, gold, check) => cases.push({ id: `v${String(++n).padStart(3, "0")}`, tier, cat: "v5", request, fixture: fx?.kind || null, state: fx?.desc || "empty model", setup: fx?.setup || [], gold, check });
const E = (...a) => add("easy", ...a), M = (...a) => add("medium", ...a), H = (...a) => add("hard", ...a);
const doc = (...expect) => ({ doc: true, expect });
const info = (...expect) => ({ cmd: { cmd: "info" }, expect });
const note = (fx, text, extra) => ({ ...fx, kind: fx.kind + "+", setup: [...fx.setup, ...extra], desc: fx.desc + " " + text });

// texture box, same wording as the training fixture (gen/templates_v4.mjs fxBox)
const RGB = { brick: [190, 80, 60], wood: [150, 100, 50], stone: [130, 130, 135], tiles: [60, 140, 190], concrete: [160, 160, 155], metal: [120, 125, 135], marble: [235, 235, 240], plaster: [225, 215, 195], slate: [70, 80, 90] };
const box = (name, w, d, h, ms) => ({
  kind: "texbox", name, w, d, h,
  setup: [{ cmd: "begin_group", name, as: name }, { cmd: "rect", from: [0, 0, 0], to: [w, d, 0], as: "f" }, { cmd: "pushpull", face: "@f", distance: h, as: "top" }, { cmd: "end_group" }, { cmd: "pick", at: [r4(w / 2), 0, r4(h / 2)], as: "front" }, { cmd: "pick", at: [w, r4(d / 2), r4(h / 2)], as: "side" }, ...ms.map((m) => ({ cmd: "texture", name: m, data: pngUrl(RGB[m]), width: 0.5, height: 0.5 }))],
  desc: `@${name} is a group named "${name}": a box ${fmt(w)} m (x) by ${fmt(d)} m (y) by ${fmt(h)} m tall, one corner at the origin. @top is its top face, @front its front (south, y = 0) face and @side its east (x = ${fmt(w)}) face. The model has these picture materials: ${ms.slice(0, -1).join(", ")} and ${ms.at(-1)}.`,
});
const UVOK = (nm) => ({ cmd: { cmd: "uv_info", entity: `@${nm}` }, expect: [{ path: "without", op: "len", value: 0 }, { path: "faces.*.uv", op: "within01" }] });
const segArea = (R, ang, k = 12) => 0.5 * k * R * R * Math.sin(ang / k);

// ---------------- m1 arcs
E("draw an arc that starts at the origin, ends at (6, 0) and bows 1.5 m toward +y", null, [{ cmd: "arc", start: [0, 0, 0], end: [6, 0, 0], bulge: 1.5 }], { bbox: { min: [0, 0, 0], max: [6, 1.5, 0], tol: 0.02 }, probes: [doc({ path: "curves", op: "eq", value: 1 })] });
M("an arc from (3, 2) north to (3, 7), pushed out 80 cm on its east side", null, [{ cmd: "arc", start: [3, 2, 0], end: [3, 7, 0], bulge: -0.8 }], { bbox: { min: [3, 2, 0], max: [3.8, 7, 0], tol: 0.02 } });
M("semicircle with a 2.5 m radius around (1, 1), round part facing south", null, [{ cmd: "arc", start: [-1.5, 1, 0], end: [3.5, 1, 0], bulge: -2.5 }], { bbox: { min: [-1.5, -1.5, 0], max: [3.5, 1, 0], tol: 0.02 } });
H("make a half-disc shaped face: 3 m radius, center at (0, 4), the round edge to the north", null, [{ cmd: "arc", start: [-3, 4, 0], end: [3, 4, 0], bulge: 3 }, { cmd: "line", points: [[3, 4, 0], [0, 4, 0], [-3, 4, 0]] }], { has_face: [{ normal: [0, 0, 1], normal_abs: true, area: r4(segArea(3, PI)) }], faces: { min: 1, max: 1 } });
H("a 90 degree pie piece of radius 4 m whose point is at (2, 2), covering the north-east quadrant", null, [{ cmd: "arc", start: [6, 2, 0], end: [2, 6, 0], bulge: -r4(4 * (1 - Math.cos(PI / 4))) }, { cmd: "line", points: [[2, 6, 0], [2, 2, 0], [6, 2, 0]] }], { has_face: [{ normal: [0, 0, 1], normal_abs: true, area: r4(segArea(4, PI / 2)) }], faces: { min: 1, max: 1 } });
H("a standing half-round arch outline 3 m across on the line y = 0, from x = 1, its base 2 m above the ground", null, [{ cmd: "arc", start: [1, 0, 2], end: [4, 0, 2], bulge: 1.5, normal: [0, -1, 0] }], { bbox: { min: [1, 0, 2], max: [4, 0, 3.5], tol: 0.02 } });

// ---------------- m2 Follow Me
const prof = { kind: "profile", setup: [{ cmd: "polygon", points: [[0, 0, 0], [0.25, 0, 0], [0.25, 0, 0.15], [0, 0, 0.15]], as: "profile" }], desc: "@profile is a 0.25 by 0.15 m rectangular profile standing upright at the origin, facing north (y)." };
M("run @profile 6 m up the y axis, then 3 m toward -x, as a garden edging", prof, [{ cmd: "follow_me", face: "@profile", points: [[0, 0, 0], [0, 6, 0], [-3, 6, 0]] }], { bbox: { size: [3, 6, 0.15], tol: 0.28 }, faces: { min: 6 } });
const ed1 = edgedAt("pavilion", 6, 4, 3);
const trim = note(ed1, "@trim is a 0.2 by 0.25 m profile standing on the top's south-west corner, sticking out 0.2 m to the south.", [{ cmd: "edit", id: "@pavilion" }, { cmd: "polygon", points: [[0, -0.2, 3], [0, -0.2, 3.25], [0, 0, 3.25], [0, 0, 3]], as: "trim" }, { cmd: "close" }]);
M("wrap the trim around the roof edge of the pavilion", trim, [{ cmd: "follow_me", face: "@trim", around: "@top" }], { bbox: { size: [6.4, 4.4, 3.25], tol: 0.03 } });
H("build a 20 cm wide, 30 cm high wall that follows the path from (1, 1) east to (5, 1) then north to (5, 4)", null, [{ cmd: "polygon", points: [[1, 0.9, 0], [1, 1.1, 0], [1, 1.1, 0.3], [1, 0.9, 0.3]], as: "p" }, { cmd: "follow_me", face: "@p", points: [[1, 1, 0], [5, 1, 0], [5, 4, 0]] }], { bbox: { size: [4.1, 3.1, 0.3], tol: 0.13 }, faces: { min: 6 } });

// ---------------- m3 text, guides, axes, resize
const ed2 = edgedAt("depot", 8, 5, 4);
E('stick a "Loading bay" label right in the middle of the depot roof', ed2, [{ cmd: "text", at: [4, 2.5, 4], text: "Loading bay" }], { probes: [doc({ path: "texts", op: "len", value: 1 }, { path: "texts", find: { text: "Loading bay" }, get: "at", op: "approx", value: [4, 2.5, 4], tol: 0.05 })] });
M('a callout "Fire door" 2 m south of the depot with its arrow touching the middle of the front wall', ed2, [{ cmd: "text", at: [4, -2, 2], text: "Fire door", leader: [4, 0, 2] }], { probes: [doc({ path: "texts", find: { text: "Fire door" }, get: "leader", op: "approx", value: [4, 0, 2], tol: 0.05 })] });
E("drop a construction point at (2, 3, 1.5)", null, [{ cmd: "guide", point: [2, 3, 1.5] }], { probes: [doc({ path: "guides", op: "has_line", value: { p: [2, 3, 1.5], dir: null } })] });
E("a guide running north-south through x = 4", null, [{ cmd: "guide", point: [4, 0, 0], direction: [0, 1, 0] }], { probes: [doc({ path: "guides", op: "len", value: 1 }, { path: "guides", op: "has_line", value: { p: [4, 0, 0], dir: [0, 1, 0] } })] });
M("measure 1.8 m in from the depot's back wall and leave a guide line there", ed2, [{ cmd: "guide", point: [0, 3.2, 0], direction: [1, 0, 0] }], { probes: [doc({ path: "guides", op: "has_line", value: { p: [0, 3.2, 0], dir: [1, 0, 0] } })] });
M("with the protractor, lay a guide through the origin at 40° off the x axis", null, [{ cmd: "guide", point: [0, 0, 0], direction: [r4(Math.cos((40 * PI) / 180)), r4(Math.sin((40 * PI) / 180)), 0] }], { probes: [doc({ path: "guides", op: "has_line", value: { p: [0, 0, 0], dir: [Math.cos((40 * PI) / 180), Math.sin((40 * PI) / 180), 0] } })] });
const gds = note(ed2, "There are 3 construction guide lines in the model.", [0, 1, 2].map((i) => ({ cmd: "guide", point: [i, 0, 0], direction: [0, 1, 0] })));
E("wipe out the construction guides", gds, [{ cmd: "clear_guides" }], { probes: [doc({ path: "guides", op: "len", value: 0 })] });
M("set the drawing axes at the depot's north-west corner with red running east", ed2, [{ cmd: "set_axes", origin: [0, 5, 0], x: [1, 0, 0], y: [0, 1, 0] }], { probes: [doc({ path: "axes.0", op: "approx", value: [0, 5, 0], tol: 0.01 }, { path: "axes.1", op: "approx", value: [1, 0, 0], tol: 0.01 })] });
H("swing the axes 25 degrees counter-clockwise about the point (2, 2)", null, [{ cmd: "set_axes", origin: [2, 2, 0], x: [r4(Math.cos((25 * PI) / 180)), r4(Math.sin((25 * PI) / 180)), 0], y: [r4(-Math.sin((25 * PI) / 180)), r4(Math.cos((25 * PI) / 180)), 0] }], { probes: [doc({ path: "axes.0", op: "approx", value: [2, 2, 0], tol: 0.01 }, { path: "axes.1", op: "approx", value: [r4(Math.cos((25 * PI) / 180)), r4(Math.sin((25 * PI) / 180)), 0], tol: 0.01 })] });
const ax = note(ed2, "The drawing axes were moved to the depot's north-east corner.", [{ cmd: "set_axes", origin: [8, 5, 0], x: [-1, 0, 0], y: [0, -1, 0] }]);
E("bring the axes back to normal", ax, [{ cmd: "set_axes", reset: true }], { probes: [doc({ path: "axes", op: "null" })] });
M("the depot came in at 8 m wide but the real building is 12 m wide; resize everything", ed2, [{ cmd: "resize", factor: 1.5 }], { bbox: { size: [12, 7.5, 6], tol: 0.03 } });
M("the depot is 4 m tall and it should be 10 feet tall, scale the model to fit", ed2, [{ cmd: "resize", factor: r4((10 * FT) / 4) }], { bbox: { size: [r4(8 * (10 * FT) / 4), r4(5 * (10 * FT) / 4), r4(10 * FT)], tol: 0.03 } });

// ---------------- m4 edges
E("soften the four edges around the depot's front face", ed2, [{ cmd: "soften", ids: ["@front"] }], { probes: [doc({ path: "soft", op: "eq", value: 4 })] });
const sft = note(ed2, "The edges around the top face are softened.", [{ cmd: "soften", ids: ["@top"] }]);
E("harden the edges around the top again", sft, [{ cmd: "soften", ids: ["@top"], soft: false }], { probes: [doc({ path: "soft", op: "eq", value: 0 })] });
const split = { kind: "split", setup: [{ cmd: "rect", from: [0, 0, 0], to: [6, 3, 0] }, { cmd: "line", points: [[2.5, 0, 0], [2.5, 3, 0]] }], desc: "A flat 6 by 3 m rectangle on the ground, split in two by a line at x = 2.5." };
M("hide the line between the two flat faces, and any other coplanar seam", split, [{ cmd: "soften", coplanar: true }], { probes: [doc({ path: "soft", op: "eq", value: 1 })] });
E("chop the depot's south-east corner edge into 6 equal lengths", ed2, [{ cmd: "divide", edge: "@corner", count: 6 }], { probes: [info({ path: "edges", op: "eq", value: 17 })] });
const zig = { kind: "path", setup: [{ cmd: "line", points: [[0, 0, 0], [2, 0, 0]], as: "s1" }, { cmd: "line", points: [[2, 0, 0], [2, 2, 0]], as: "s2" }, { cmd: "line", points: [[2, 2, 0], [4, 2, 0]], as: "s3" }, { cmd: "line", points: [[4, 2, 0], [4, 4, 0]], as: "s4" }], desc: "A zig-zag path of 4 separate connected edges on the ground, @s1, @s2, @s3, @s4 in order, through (0, 0), (2, 0), (2, 2), (4, 2), (4, 4)." };
M("turn the four path edges into one welded curve", zig, [{ cmd: "weld", edges: ["@s1", "@s2", "@s3", "@s4"] }], { probes: [doc({ path: "curves", op: "eq", value: 1 })] });
const arcF = { kind: "arccurve", setup: [{ cmd: "arc", start: [1, 1, 0], end: [7, 1, 0], bulge: 1.5, as: "arc" }], desc: "An arc from (1, 1) to (7, 1), bulging 1.5 m north; @arc is one of its edges." };
E("split the arc up so each segment is its own edge", arcF, [{ cmd: "explode_curve", edges: ["@arc"] }], { probes: [doc({ path: "curves", op: "eq", value: 0 })] });
M("take 12 cm off the depot's top east edge with a flat chamfer", ed2, [{ cmd: "bevel", edges: ["@top_east"], size: 0.12 }], { faces: { min: 7 }, bbox: { size: [8, 5, 4], tol: 0.02 } });
H("round over the top front and top back edges of the depot, 20 cm radius in 5 steps", ed2, [{ cmd: "bevel", edges: ["@top_front", "@top_back"], size: 0.2, segments: 5 }], { faces: { min: 16 }, bbox: { size: [8, 5, 4], tol: 0.02 } });
E("the depot's roof face points down; turn it the right way", note(ed2, "The top face is reversed.", [{ cmd: "reverse", ids: ["@top"] }]), [{ cmd: "reverse", ids: ["@top"] }], { has_face: [{ normal: [0, 0, 1], z: [3.99, 4.01] }] });

// ---------------- m5 groups and solids
const cmp = compAt("bench", 0.8, 3);
E("make the bench at x 3 plain geometry again", cmp, [{ cmd: "explode", id: "@bench2" }], { instances: { n: 1 }, groups: { n: 1 } });
E("dissolve the depot group", ed2, [{ cmd: "ungroup", id: "@depot" }], { groups: { n: 0 }, faces: { min: 6, max: 6 } });
const two = twoAt("block", "post", 4, 3, 3, 2);
M("draw intersection lines between the block and the post", two, [{ cmd: "intersect", ids: ["@block", "@post"], with: "selection" }], { probes: [info({ path: "edges", op: "min", value: 26 })], groups: { n: 2 } });
M("fuse the block and the post into a single solid", two, [{ cmd: "solid", op: "union", ids: ["@block", "@post"] }], { groups: { n: 1 }, bbox: { size: [5, 5, 3], tol: 0.02 } });
H("carve the post out of the block, the post goes away", two, [{ cmd: "solid", op: "subtract", ids: ["@post", "@block"] }], { groups: { n: 1 }, bbox: { size: [4, 4, 3], tol: 0.02 }, faces: { min: 7 } });
H("leave just the volume the block and post share", two, [{ cmd: "solid", op: "intersect", ids: ["@block", "@post"] }], { groups: { n: 1 }, bbox: { size: [2, 2, 2], tol: 0.02 } });
H("trim the block with the post but keep the post", two, [{ cmd: "solid", op: "trim", ids: ["@post", "@block"] }], { groups: { n: 2 }, faces: { min: 13 } });
M("split the depot into two pieces with a cut 3 m from its west end", ed2, [{ cmd: "slice", id: "@depot", origin: [3, 0, 0], normal: [1, 0, 0] }], { groups: { n: 2 }, parts: [{ size: [3, 5, 4], tol: 0.02 }, { size: [5, 5, 4], tol: 0.02 }] });
M("cut the top 1.5 m off the depot as a separate piece", ed2, [{ cmd: "slice", id: "@depot", origin: [0, 0, 2.5], normal: [0, 0, 1] }], { groups: { n: 2 }, parts: [{ size: [8, 5, 1.5], tol: 0.02 }, { size: [8, 5, 2.5], tol: 0.02 }] });
const ell = ellAt("counter", 5, 3, 0.6, 0.9);
M("mirror the counter left-right where it stands", ell, [{ cmd: "flip", ids: ["@counter"], axis: "x" }], { has_face: [{ normal: [0, 1, 0], area: r4(0.6 * 0.9), x: [4.39, 5.01], y: [2.99, 3.01] }], bbox: { size: [5, 3, 0.9], tol: 0.02 } });
M("flip the counter front-to-back in place", ell, [{ cmd: "flip", ids: ["@counter"], axis: "y" }], { has_face: [{ normal: [1, 0, 0], area: r4(0.6 * 0.9), x: [4.99, 5.01], y: [2.39, 3.01] }] });
M("turn the depot into a smooth subdivision blob with 1 level", ed2, [{ cmd: "subdivide", id: "@depot", levels: 1 }], { faces: { min: 43 } });

// ---------------- m6 materials
E("create a material named brass, color [0.8, 0.65, 0.3], fully metallic with roughness 0.25", null, [{ cmd: "material", name: "brass", color: [0.8, 0.65, 0.3], metalness: 1, roughness: 0.25 }], { probes: [doc({ path: "materials.brass.metalness", op: "approx", value: 1, tol: 0.01 }, { path: "materials.brass.roughness", op: "approx", value: 0.25, tol: 0.01 })] });
M("give the depot a frosted glass look: a glass material called frosted, color [0.9, 0.95, 1], on the whole thing", ed2, [{ cmd: "material", name: "frosted", color: [0.9, 0.95, 1], glass: true }, { cmd: "paint", ids: ["@depot"], material: "frosted" }], { material: [{ name: "frosted", min: 6 }], probes: [doc({ path: "materials.frosted.glass", op: "eq", value: true })] });
M("the depot roof should glow: new material neon, color [0.2, 1, 0.4], emission 2, on the top face", ed2, [{ cmd: "material", name: "neon", color: [0.2, 1, 0.4], emission: 2 }, { cmd: "paint", ids: ["@top"], material: "neon" }], { material: [{ name: "neon", where: { normal: [0, 0, 1], z: [3.99, 4.01] }, all: true }], probes: [doc({ path: "materials.neon.emission", op: "approx", value: 2, tol: 0.01 })] });
const stl = note(ed2, 'The model has a material "steel" (color [0.6, 0.6, 0.65]) and the depot is painted with it.', [{ cmd: "material", name: "steel", color: [0.6, 0.6, 0.65], metalness: 1, roughness: 0.3 }, { cmd: "paint", ids: ["@depot"], material: "steel" }]);
E("make the steel matte: roughness 0.9", stl, [{ cmd: "material", name: "steel", color: [0.6, 0.6, 0.65], roughness: 0.9 }], { probes: [doc({ path: "materials.steel.roughness", op: "approx", value: 0.9, tol: 0.01 })] });
const tb = box("kiosk", 5, 3, 3, ["brick", "wood", "stone"]);
const tbf = note(tb, "Each picture material's tile is 0.5 by 0.5 m. The front face wears wood.", [{ cmd: "paint", ids: ["@front"], material: "wood" }]);
M("each wood board picture should cover 1.5 m by 0.3 m", tbf, [{ cmd: "texture", name: "wood", width: 1.5, height: 0.3 }], { probes: [doc({ path: "materials.wood.tile", op: "approx", value: [1.5, 0.3], tol: 0.001 })] });
M("the wood pattern is too fine, make it five times bigger", tbf, [{ cmd: "texture", name: "wood", width: 2.5, height: 2.5 }], { probes: [doc({ path: "materials.wood.tile", op: "approx", value: [2.5, 2.5], tol: 0.001 })] });
const mur = note(tb, "@front wears a 64 px paint texture named poster.", [{ cmd: "texture_paint_new", faces: ["@front"], size: 64, name: "poster", unwrap: true }]);
E("tell me the colors of the 2 by 2 pixels at the top-left of the poster", mur, [{ cmd: "texture_pixels", material: "poster", x: 0, y: 0, w: 2, h: 2 }], { readonly: true });

// ---------------- u1 UV and texture chains
const kb = box("booth", 4, 4, 2.5, ["tiles", "marble", "slate"]);
H("put seams on the booth wherever faces meet at more than 35 degrees and then unwrap it on those seams", kb, [{ cmd: "uv_seam", entity: "@booth", auto: 35 }, { cmd: "uv_unwrap", entity: "@booth", seams: "marked" }], { probes: [UVOK("booth"), { cmd: { cmd: "uv_info", entity: "@booth" }, expect: [{ path: "seams", op: "len", value: 12 }] }] });
M("unwrap the booth, then lay out its lightmap channel leaving 0.06 between islands", kb, [{ cmd: "uv_unwrap", entity: "@booth" }, { cmd: "uv_lightmap", entity: "@booth", margin: 0.06 }], { probes: [UVOK("booth"), { cmd: { cmd: "uv_info", entity: "@booth", set: 2 }, expect: [{ path: "without", op: "len", value: 0 }] }] });
const kbu = note(kb, "The booth has been UV-unwrapped (it has UVs).", [{ cmd: "uv_unwrap", entity: "@booth" }]);
H("make the top face's UVs a third of their size", kbu, [{ cmd: "uv_transform", faces: ["@top"], matrix: [r4(1 / 3), 0, 0, r4(1 / 3), 0, 0] }], { probes: [{ cmd: { cmd: "uv_info", faces: ["@top"] }, before: true, expect: [{ path: "faces.*.uv", op: "affine", value: [1 / 3, 0, 0, 1 / 3, 0, 0], tol: 0.003 }] }] });
H("spin the UVs on the east face a quarter turn counter-clockwise", kbu, [{ cmd: "uv_transform", faces: ["@side"], matrix: [0, 1, -1, 0, 0, 0] }], { probes: [{ cmd: { cmd: "uv_info", faces: ["@side"] }, before: true, expect: [{ path: "faces.*.uv", op: "affine", value: [0, 1, -1, 0, 0, 0], tol: 0.003 }] }] });
M("box-map the slate onto the booth's front and its top, at twice the size", kb, [{ cmd: "texture_project", faces: ["@front", "@top"], mode: "box", material: "slate", scale: 2 }], { material: [{ name: "slate", where: { normal: [0, -1, 0] }, all: true }, { name: "slate", where: { normal: [0, 0, 1], z: [2.49, 2.51] }, all: true }] });
const kbs = note(kb, "The east wall wears tiles.", [{ cmd: "paint", ids: ["@side"], material: "tiles" }]);
M("stretch the tiles on the east wall to 3x wide but keep their height", kbs, [{ cmd: "texture_position", face: "@side", transform: { scale: [3, 1] } }], { probes: [{ cmd: { cmd: "texture_frame", face: "@side" }, expect: [{ path: "own", op: "eq", value: true }] }] });
H("give the booth's front a 64 px paint texture named chalk and cover it in light blue", kb, [{ cmd: "texture_paint_new", faces: ["@front"], size: 64, name: "chalk", unwrap: true }, { cmd: "texture_paint_stroke", material: "chalk", faces: ["@front"], fill: true, color: [0.5, 0.75, 1] }], { material: [{ name: "chalk", where: { normal: [0, -1, 0] }, all: true }], probes: [{ cmd: { cmd: "texture_pixels", material: "chalk", x: 0, y: 0, w: 64, h: 64 }, expect: [{ path: "pixels", op: "pixels_min", value: { color: [128, 191, 255], min: 600, tol: 20 } }] }] });
const pst = note(kb, "@front wears a 64 px paint texture named poster (already unwrapped, white).", [{ cmd: "texture_paint_new", faces: ["@front"], size: 64, name: "poster", unwrap: true }]);
H("on the poster, brush a red line in texture coordinates from (0.15, 0.5) to (0.85, 0.5), radius 0.06", pst, [{ cmd: "texture_paint_stroke", material: "poster", faces: ["@front"], uv_points: [[0.15, 0.5], [0.85, 0.5]], uv_radius: 0.06, color: [1, 0, 0] }], { probes: [{ cmd: { cmd: "texture_pixels", material: "poster", x: 0, y: 0, w: 64, h: 64 }, before: true, expect: [{ path: "hash", op: "changed" }, { path: "pixels", op: "pixels_min", value: { color: [255, 0, 0], min: 4, tol: 20 } }] }] });
H("dab green on the middle of the poster: 50 cm brush, hardness 0.1, 30% opacity", pst, [{ cmd: "texture_paint_stroke", material: "poster", faces: ["@front"], points: [[2, 0, 1.25]], radius: 0.5, color: [0, 0.6, 0], hardness: 0.1, opacity: 0.3 }], { probes: [{ cmd: { cmd: "texture_pixels", material: "poster", x: 0, y: 0, w: 64, h: 64 }, before: true, expect: [{ path: "hash", op: "changed" }] }] });
const pstf = note(kb, "@front wears a 64 px paint texture named poster, filled yellow.", [{ cmd: "texture_paint_new", faces: ["@front"], size: 64, name: "poster", unwrap: true }, { cmd: "texture_paint_stroke", material: "poster", faces: ["@front"], fill: true, color: [1, 0.9, 0] }]);
M("clear every bit of paint off the poster", pstf, [{ cmd: "texture_paint_stroke", material: "poster", faces: ["@front"], fill: true, erase: true }], { probes: [{ cmd: { cmd: "texture_pixels", material: "poster", x: 0, y: 0, w: 64, h: 64 }, before: true, expect: [{ path: "hash", op: "changed" }] }] });

// ---------------- combos
H('drop a guide 2 m south of the depot along its front, and write "Gate" in the middle of its roof', ed2, [{ cmd: "guide", point: [0, -2, 0], direction: [1, 0, 0] }, { cmd: "text", at: [4, 2.5, 4], text: "Gate" }], { probes: [doc({ path: "guides", op: "has_line", value: { p: [0, -2, 0], dir: [1, 0, 0] } }, { path: "texts", find: { text: "Gate" }, get: "at", op: "approx", value: [4, 2.5, 4], tol: 0.05 })] });
H("a chrome material (color [0.9, 0.9, 0.9], metalness 1, roughness 0.05) on the depot, and soften the roof edges", ed2, [{ cmd: "material", name: "chrome", color: [0.9, 0.9, 0.9], metalness: 1, roughness: 0.05 }, { cmd: "paint", ids: ["@depot"], material: "chrome" }, { cmd: "soften", ids: ["@top"] }], { material: [{ name: "chrome", min: 6 }], probes: [doc({ path: "soft", op: "eq", value: 4 }, { path: "materials.chrome.metalness", op: "approx", value: 1, tol: 0.01 })] });

writeFileSync(join(here, "v5_cases.jsonl"), cases.map((c) => JSON.stringify(c)).join("\n") + "\n");
console.log(`${cases.length} v5 cases -> eval/v5_cases.jsonl`);
if (process.argv.includes("--validate")) {
  const { runCase } = await import("../lib/run_case.mjs");
  let bad = 0;
  for (const c of cases) { const r = await runCase(c, c.gold); if (!r.pass) { bad++; console.log("GOLD FAILS", c.id, c.request, r.errs); } }
  console.log(bad ? `${bad} gold failures` : `${cases.length}/${cases.length} gold solutions pass their checks`);
  let leaks = 0;
  for (const c of cases.filter((c) => !c.check.readonly)) { const r = await runCase(c, [{ cmd: "info" }]); if (r.pass) { leaks++; console.log("NOOP PASSES", c.id, c.request); } }
  console.log(leaks ? `${leaks} cases a no-op passes` : "no-op controls: 0 pass");
  process.exit(bad ? 1 : 0);
}
