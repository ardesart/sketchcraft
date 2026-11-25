// v5 templates for the SketchCraftAI minimodel: the rest of the Model tab (app/src/workspace.ts "model") and deeper UV and
// texturing. Same contract as templates_v4.mjs: each template samples parameters and returns {fx, request, commands, check};
// the check is computed from the INTENT (the request's numbers), and gen_data.mjs verifies every pair in the engine (through
// `sketchcraft mcp`, the untrusted-agent allowlist), runs the answer as ONE undo step and checks one undo restores the model
// and the document, and gates it with lib/heldout.mjs. State the face lists cannot show (guides, texts, axes, soft edges,
// curves, material settings) is read from the saved document by `doc` probes (lib/probe.mjs).
//
// Families (Model tab tool -> command):
//   m1 Arc, 2-point arc, 3-point arc, Pie            -> arc (+ line back through the centre for a pie)
//   m2 Follow Me                                     -> follow_me (points, around), polygon + follow_me
//   m3 Text, Tape Measure, Protractor, Axes          -> text, guide, clear_guides, resize, set_axes
//   m4 Eraser (soften), edge tools                   -> soften, divide, weld, explode_curve, bevel, reverse
//   m5 groups and solids                             -> explode, ungroup, intersect, solid, slice, flip, subdivide
//   m6 Paint Bucket materials                        -> material, texture (tile size), texture_pixels
//   u1 UV and texture painting chains                -> uv_seam + uv_unwrap, uv_pack, uv_transform (scale/rotate), texture_project
//                                                       on several faces, texture_position on other faces, paint strokes
//   x2 combos across families
//
// Conventions taught (read from the engine): an arc bows to the LEFT of start->end seen from its normal side (on the ground,
// normal up: from west to east, + bulges north); a half circle of radius R has bulge R; the Flip tool mirrors in place across
// the selection's middle; solid subtract: the FIRST group cuts the second and is used up; resize scales the whole model.
import { COLORS, fmt, metric, r4 } from "./templates.mjs";
import { fxBox, withNote, colorOf, HNAMES, UVOK, phraseMat } from "./templates_v4.mjs";

export const V5 = [];
const F = (family, name, weight, tier, fn) => V5.push({ name: `${family}_${name}`, family, tier, cat: "v5", weight, fn });
const FT = 0.3048;
const PI = Math.PI;
const docProbe = (...expect) => ({ doc: true, expect });
const infoProbe = (...expect) => ({ cmd: { cmd: "info" }, expect });
const pt = (r, lo = -6, hi = 10) => [r.step(lo, hi, 0.5), r.step(lo, hi, 0.5)];
const P2 = (r, [x, y]) => r.pick([`(${fmt(x)}, ${fmt(y)})`, `x ${fmt(x)}, y ${fmt(y)}`, `${fmt(x)}, ${fmt(y)}`, `point (${fmt(x)}, ${fmt(y)})`]);
const P3 = (r, [x, y, z]) => r.pick([`(${fmt(x)}, ${fmt(y)}, ${fmt(z)})`, `x ${fmt(x)}, y ${fmt(y)}, z ${fmt(z)}`, `point (${fmt(x)}, ${fmt(y)}, ${fmt(z)})`]);
/** a length in m or ft: {v: meters, t: text} */
function len(r, lo, hi, step = 0.5) {
  if (r.chance(0.25)) { const f = r.step(Math.max(1, Math.round(lo / FT)), Math.round(hi / FT), 1); return { v: r4(f * FT), t: r.pick([`${f} ft`, `${f} feet`, `${f}'`]) }; }
  const v = r.step(lo, hi, step);
  return { v, t: metric(r, v) };
}
function small(r, cmChoices = [5, 10, 15, 20, 25, 30, 40, 50]) {
  const c = r.pick(cmChoices);
  return { v: r4(c / 100), t: r.pick([`${c} cm`, `${c} centimeters`, `${fmt(c / 100)} m`, `${c * 10} mm`]) };
}

// ---------------------------------------------------------------- fixtures
/** a box group with its faces and the four top edges and one corner edge named */
function fxEdged(r, { name = r.pick(HNAMES) } = {}) { return edgedAt(name, r.step(2.5, 9, 0.5), r.step(2, 7, 0.5), r.step(2, 5, 0.5)); }
export function edgedAt(name, w, d, h) {
  const setup = [
    { cmd: "begin_group", name, as: name }, { cmd: "rect", from: [0, 0, 0], to: [w, d, 0], as: "f" }, { cmd: "pushpull", face: "@f", distance: h, as: "top" }, { cmd: "end_group" },
    { cmd: "pick", at: [r4(w / 2), 0, r4(h / 2)], as: "front" }, { cmd: "pick", at: [w, r4(d / 2), r4(h / 2)], as: "side" },
    { cmd: "edit", id: `@${name}` },
    { cmd: "line", points: [[0, 0, h], [w, 0, h]], as: "top_front" }, { cmd: "line", points: [[0, d, h], [w, d, h]], as: "top_back" },
    { cmd: "line", points: [[w, 0, h], [w, d, h]], as: "top_east" }, { cmd: "line", points: [[0, 0, h], [0, d, h]], as: "top_west" },
    { cmd: "line", points: [[w, 0, 0], [w, 0, h]], as: "corner" },
    { cmd: "close" },
  ];
  const desc = `@${name} is a group named "${name}": a box ${fmt(w)} m (x) by ${fmt(d)} m (y) by ${fmt(h)} m tall, one corner at the origin. @top is its top face, @front its front (south, y = 0) face and @side its east (x = ${fmt(w)}) face. Named edges: @top_front, @top_back, @top_east and @top_west are the four edges around its top (front = south, back = north), @corner is its vertical south-east corner edge.`;
  return { kind: "edged", name, w, d, h, setup, desc, trusted: true };
}
/** an L-shaped slab group: a leg along x (a long, t thick) and a leg along y (b long) at the west end */
function fxEll(r) { return ellAt(r.pick(["ell", "bench", "counter", "wall", "planter", "desk"]), r.step(3, 8, 0.5), r.step(2.5, 6, 0.5), r.pick([0.5, 0.6, 0.8, 1]), r.pick([0.5, 0.8, 1, 1.2, 2])); }
export function ellAt(name, a, b, t, h) {
  const pts = [[0, 0, 0], [a, 0, 0], [a, t, 0], [t, t, 0], [t, b, 0], [0, b, 0]];
  const setup = [{ cmd: "begin_group", name, as: name }, { cmd: "polygon", points: pts, as: "f" }, { cmd: "pushpull", face: "@f", distance: h, toward: [0, 0, 1] }, { cmd: "end_group" }];
  const desc = `@${name} is an L-shaped group named "${name}", ${fmt(h)} m tall: one leg runs east along y = 0 from x 0 to ${fmt(a)} (${fmt(t)} m deep), the other runs north along x = 0 from y 0 to ${fmt(b)} (${fmt(t)} m wide), so the corner of the L is at the south-west.`;
  return { kind: "ell", name, a, b, t, h, setup, desc, trusted: true };
}
/** two overlapping box groups */
function fxTwo(r) {
  const [n1, n2] = r.shuffle(["block", "box", "slab", "cube", "base", "tower", "wing", "post"]).slice(0, 2);
  const a = r.step(2, 5, 0.5), h1 = r.step(1.5, 4, 0.5);
  return twoAt(n1, n2, a, h1, r.step(1.5, 4, 0.5), r.step(1, h1, 0.5));
}
export function twoAt(n1, n2, a, h1, b, h2) {
  const ox = r4(a / 2), oy = r4(a / 2);
  const setup = [
    { cmd: "begin_group", name: n1, as: n1 }, { cmd: "rect", from: [0, 0, 0], to: [a, a, 0], as: "f" }, { cmd: "pushpull", face: "@f", distance: h1 }, { cmd: "end_group" },
    { cmd: "begin_group", name: n2, as: n2 }, { cmd: "rect", from: [ox, oy, 0], to: [r4(ox + b), r4(oy + b), 0], as: "g" }, { cmd: "pushpull", face: "@g", distance: h2 }, { cmd: "end_group" },
  ];
  const desc = `Two solid box groups that overlap: @${n1} ("${n1}") from x 0..${fmt(a)}, y 0..${fmt(a)}, ${fmt(h1)} m tall, and @${n2} ("${n2}") from x ${fmt(ox)}..${fmt(r4(ox + b))}, y ${fmt(oy)}..${fmt(r4(oy + b))}, ${fmt(h2)} m tall.`;
  return { kind: "two", n1, n2, a, h1, ox, oy, b, h2, setup, desc, trusted: true };
}
/** a component placed twice */
function fxComp(r) { return compAt(r.pick(["chair", "stool", "crate", "planter", "table", "locker", "pillar"]), r.pick([0.5, 0.6, 0.8, 1]), r.step(2, 5, 0.5)); }
export function compAt(c, s, dx) {
  const setup = [
    { cmd: "begin_group", name: c, as: "g" }, { cmd: "rect", from: [0, 0, 0], to: [s, s, 0], as: "f" }, { cmd: "pushpull", face: "@f", distance: s }, { cmd: "end_group" },
    { cmd: "make_component", ids: ["@g"], name: c, as: `${c}1` }, { cmd: "place", component: c, at: [dx, 0, 0], as: `${c}2` },
  ];
  const desc = `A component "${c}" (a ${fmt(s)} m cube) is placed twice: @${c}1 at the origin and @${c}2 at x = ${fmt(dx)}.`;
  return { kind: "comp", c, s, dx, setup, desc, trusted: true };
}

// ================================================================ m1: arcs
const NUP = [0, 0, 1];
// arcs on the ground along x or y: [start, end, bulge] with the bulge side named
F("m1", "arc2", 150, "medium", (r) => {
  const along = r.pick(["x", "y"]);
  const [x, y] = pt(r), L = len(r, 2, 10), B = { ...small(r, [20, 30, 40, 50, 60, 75, 100]) };
  if (B.v > L.v / 2) return null;
  const side = along === "x" ? r.pick(["north", "south"]) : r.pick(["east", "west"]);
  const start = [x, y, 0], end = along === "x" ? [r4(x + L.v), y, 0] : [x, r4(y + L.v), 0];
  // left of +x is +y (north); left of +y is -x (west)
  const bulge = (along === "x" ? side === "north" : side === "west") ? B.v : -B.v;
  const dirW = along === "x" ? "east" : "north";
  const req = r.pick([
    `draw an arc from ${P2(r, [x, y])} to ${P2(r, end)}, bulging ${B.t} to the ${side}`,
    `an arc ${L.t} long running ${dirW} from ${P2(r, [x, y])}, curving ${B.t} out to the ${side}`,
    `arc from ${P2(r, [x, y])} to ${P2(r, end)} with a ${B.t} bulge on the ${side} side`,
    `2-point arc: start ${P2(r, [x, y])}, end ${P2(r, end)}, bulge ${B.t} ${side}`,
  ]);
  const lo = [Math.min(start[0], end[0]), Math.min(start[1], end[1])], hi = [Math.max(start[0], end[0]), Math.max(start[1], end[1])];
  const k = along === "x" ? 1 : 0;
  if (bulge * (along === "x" ? 1 : -1) > 0) hi[k] = r4(hi[k] + B.v); else lo[k] = r4(lo[k] - B.v);
  return { request: req, commands: [{ cmd: "arc", start, end, bulge }], check: { bbox: { min: [lo[0], lo[1], 0], max: [hi[0], hi[1], 0], tol: 0.02 }, probes: [docProbe({ path: "curves", op: "eq", value: 1 })] } };
});

F("m1", "semi", 110, "medium", (r) => {
  const [cx, cy] = pt(r), R = len(r, 1, 6);
  const side = r.pick(["north", "south"]);
  const start = [r4(cx - R.v), cy, 0], end = [r4(cx + R.v), cy, 0], bulge = side === "north" ? R.v : -R.v;
  const rTxt = r.chance(0.3) ? `${R.t.replace(/^([\d.]+)/, (m) => fmt(2 * +m))} across` : `radius ${R.t}`;
  if (rTxt.includes("across") && !/^[\d.]+/.test(R.t)) return null;
  const req = r.pick([
    `a half circle of ${rTxt} centered at ${P2(r, [cx, cy])}, the curved side to the ${side}`,
    `draw a semicircle arc, ${rTxt}, center ${P2(r, [cx, cy])}, bowing ${side}`,
    `semicircular arc around ${P2(r, [cx, cy])} with ${rTxt}, opening to the ${side === "north" ? "south" : "north"}`,
  ]);
  const yb = side === "north" ? [cy, r4(cy + R.v)] : [r4(cy - R.v), cy];
  return { request: req, commands: [{ cmd: "arc", start, end, bulge }], check: { bbox: { min: [start[0], yb[0], 0], max: [end[0], yb[1], 0], tol: 0.02 }, probes: [docProbe({ path: "curves", op: "eq", value: 1 })] } };
});

// pie: a half disc or a quarter disc face (arc, then back through the center)
const segArea = (R, ang, n = 12) => 0.5 * n * R * R * Math.sin(ang / n);
F("m1", "pie", 120, "hard", (r) => {
  const [cx, cy] = pt(r), R = len(r, 1, 5);
  const quarter = r.chance(0.45);
  if (!quarter) {
    const side = r.pick(["north", "south"]);
    const start = [r4(cx - R.v), cy, 0], end = [r4(cx + R.v), cy, 0], bulge = side === "north" ? R.v : -R.v;
    const req = r.pick([`a half disc of radius ${R.t} centered at ${P2(r, [cx, cy])}, round side ${side}`, `pie: a semicircle face, radius ${R.t}, center ${P2(r, [cx, cy])}, curving ${side}`, `draw a half-round face ${R.t} in radius at ${P2(r, [cx, cy])}, facing ${side}`]);
    return { request: req, commands: [{ cmd: "arc", start, end, bulge }, { cmd: "line", points: [end, [cx, cy, 0], start] }], check: { has_face: [{ normal: NUP, normal_abs: true, area: r4(segArea(R.v, PI)) }], faces: { min: 1, max: 1 } } };
  }
  // quarter: from east of the center round to north (counter-clockwise), bowing away from the center (to the right)
  const q = r.pick(["north-east", "north-west", "south-west", "south-east"]);
  const ang = { "north-east": [0, 90], "north-west": [90, 180], "south-west": [180, 270], "south-east": [270, 360] }[q];
  const P = (a) => [r4(cx + R.v * Math.cos((a * PI) / 180)), r4(cy + R.v * Math.sin((a * PI) / 180)), 0];
  const start = P(ang[0]), end = P(ang[1]), bulge = -r4(R.v * (1 - Math.cos(PI / 4)));
  const req = r.pick([`a quarter circle pie, radius ${R.t}, centered at ${P2(r, [cx, cy])}, filling the ${q} quarter`, `draw a ${q} quarter-disc face of radius ${R.t} around ${P2(r, [cx, cy])}`, `pie slice: 90 degrees, ${R.t} radius, center ${P2(r, [cx, cy])}, in the ${q}`]);
  return { request: req, commands: [{ cmd: "arc", start, end, bulge }, { cmd: "line", points: [end, [cx, cy, 0], start] }], check: { has_face: [{ normal: NUP, normal_abs: true, area: r4(segArea(R.v, PI / 2)) }], faces: { min: 1, max: 1 } } };
});

// a vertical arch: an arc standing in the x-z plane (normal -y: seen from the front, left of west->east is up)
F("m1", "arch", 70, "hard", (r) => {
  const x = r.step(-4, 6, 0.5), y = r.step(-3, 6, 0.5), z = r.pick([0, 0, 1, 2, 2.1, 2.4]), W = len(r, 1, 4), up = r4(W.v / 2);
  const start = [x, y, z], end = [r4(x + W.v), y, z];
  const req = r.pick([`a round arch ${W.t} wide standing upright at ${P2(r, [x, y])}${z ? `, springing from ${metric(r, z)} up` : ""}, facing south`, `draw a vertical half-circle arc ${W.t} across in the plane y = ${fmt(y)}, from x ${fmt(x)}${z ? ` at height ${fmt(z)}` : ""}, curving up`, `an upright semicircular arch outline, span ${W.t}, starting at x ${fmt(x)}, y ${fmt(y)}${z ? `, z ${fmt(z)}` : ""}`]);
  return { request: req, commands: [{ cmd: "arc", start, end, bulge: up, normal: [0, -1, 0] }], check: { bbox: { min: [x, y, z], max: [end[0], y, r4(z + up)], tol: 0.02 } } };
});

// ================================================================ m2: Follow Me
F("m2", "path", 140, "medium", (r) => {
  const kind = r.pick(["curb", "rail", "gutter", "molding", "pipe", "kerb", "trim"]);
  const pw = r.pick([0.1, 0.15, 0.2, 0.3]), ph = r.pick([0.1, 0.15, 0.2, 0.25]);
  const L1 = r.step(2, 8, 0.5), L2 = r.step(2, 8, 0.5), turn = r.pick(["east", "west"]);
  const pipe = kind === "pipe";
  // the profile stands at the origin, square to the first leg (which runs north)
  const prof = pipe ? { cmd: "circle", center: [0, 0, r4(ph)], radius: r4(ph / 2), normal: [0, 1, 0], as: "profile" } : { cmd: "polygon", points: [[0, 0, 0], [pw, 0, 0], [pw, 0, ph], [0, 0, ph]], as: "profile" };
  const fx = { kind: "profile", setup: [prof], desc: `@profile is a ${pipe ? `round profile ${fmt(ph)} m across` : `${fmt(pw)} by ${fmt(ph)} m rectangular profile`} standing upright at the origin, facing north (y).`, trusted: true };
  const x2 = turn === "east" ? L2 : -L2;
  const req = r.pick([
    `sweep the profile into a ${kind}: ${fmt(L1)} m north, then ${fmt(L2)} m ${turn}`,
    `follow me the profile along a path from the origin to (0, ${fmt(L1)}) and then to (${fmt(x2)}, ${fmt(L1)})`,
    `extrude @profile along a path: north ${metric(r, L1)}, then ${turn} ${metric(r, L2)}`,
    `make a ${kind} by running the profile ${fmt(L1)} m up the y axis and turning ${turn} for ${fmt(L2)} m`,
  ]);
  const tol = r4((pipe ? ph : pw) + 0.03);
  return { fx, request: req, commands: [{ cmd: "follow_me", face: "@profile", points: [[0, 0, 0], [0, L1, 0], [x2, L1, 0]] }], check: { bbox: { size: [L2, L1, null], tol }, faces: { min: 6 } } };
});

F("m2", "around", 110, "medium", (r) => {
  const fx0 = fxEdged(r), { name: n, w, d, h } = fx0;
  const pw = r.pick([0.1, 0.15, 0.2, 0.3]), ph = r.pick([0.1, 0.2, 0.3]);
  const what = r.pick(["cornice", "crown molding", "parapet", "trim", "coping"]);
  const fx = withNote(fx0, `@trim is a ${fmt(pw)} by ${fmt(ph)} m profile standing on the top's south-west corner, sticking out ${fmt(pw)} m to the south.`, [{ cmd: "edit", id: `@${n}` }, { cmd: "polygon", points: [[0, -pw, h], [0, -pw, r4(h + ph)], [0, 0, r4(h + ph)], [0, 0, h]], as: "trim" }, { cmd: "close" }]);
  fx.kind = "edged+trim";
  const req = r.pick([`run the trim profile all the way around the top of the ${n} as a ${what}`, `follow me @trim around the top face to make a ${what}`, `sweep the profile around the edge of the roof to make a ${what}`, `put a ${what} around the ${n}'s top using the trim profile`]);
  return { fx, request: req, commands: [{ cmd: "follow_me", face: "@trim", around: "@top" }], check: { bbox: { size: [r4(w + 2 * pw), r4(d + 2 * pw), r4(h + ph)], tol: 0.03 } } };
});

F("m2", "draw", 90, "hard", (r) => {
  const pw = r.pick([0.1, 0.2, 0.3, 0.4]), ph = r.pick([0.1, 0.15, 0.2, 0.3]);
  const x0 = r.step(-3, 3, 0.5), y0 = r.step(-3, 3, 0.5), L1 = r.step(2, 8, 0.5), L2 = r.step(1.5, 6, 0.5);
  const what = r.pick(["curb", "low wall", "step", "rail", "edging", "border"]);
  const pts = [[x0, y0, 0], [r4(x0 + L1), y0, 0], [r4(x0 + L1), r4(y0 + L2), 0]];
  const prof = [[x0, r4(y0 - pw / 2), 0], [x0, r4(y0 + pw / 2), 0], [x0, r4(y0 + pw / 2), ph], [x0, r4(y0 - pw / 2), ph]];
  const req = r.pick([
    `make a ${what} ${small(r, [pw * 100]).t} wide and ${small(r, [ph * 100]).t} high that runs from ${P2(r, [x0, y0])} east to ${P2(r, pts[1])} and then north to ${P2(r, pts[2])}`,
    `a ${pw * 100} by ${ph * 100} cm ${what} along the path ${P2(r, [x0, y0])} -> ${P2(r, pts[1])} -> ${P2(r, pts[2])}`,
    `draw a ${pw * 100} cm wide, ${ph * 100} cm tall profile and follow it from ${P2(r, [x0, y0])} to ${P2(r, pts[1])} to ${P2(r, pts[2])}`,
  ]);
  return { request: req, commands: [{ cmd: "polygon", points: prof, as: "p" }, { cmd: "follow_me", face: "@p", points: pts }], check: { bbox: { size: [r4(L1 + pw / 2), r4(L2 + pw / 2), ph], tol: r4(pw / 2 + 0.03) }, faces: { min: 6 } } };
});

// ================================================================ m3: text, guides, axes, resize
const LABELS = ["Kitchen", "Main entrance", "North", "Phase 2", "Storage", "Garage", "Office", "Do not cut", "Bay 3", "Lobby", "Exit", "Workshop", "Unit A", "Deck", "Service door", "Roof access", "Shed", "Meter", "Pool", "Studio"];
F("m3", "text", 130, "easy", (r) => {
  const fx = fxEdged(r), { name: n, w, d, h } = fx;
  const T = r.pick(LABELS);
  const where = r.pick(["top", "front", "point", "above"]);
  const q = r.pick([`"${T}"`, `'${T}'`, `${T}`]);
  let at, leader = null, req;
  if (where === "top") { at = [r4(w / 2), r4(d / 2), h]; req = r.pick([`label the middle of the ${n}'s top ${q}`, `put a text ${q} at the center of the top face`, `write ${q} on the middle of the roof`]); }
  else if (where === "front") { at = [r4(w / 2), -1, r4(h / 2)]; leader = [r4(w / 2), 0, r4(h / 2)]; req = r.pick([`a label ${q} 1 m in front of the ${n}, with a leader to the middle of its front wall`, `add a callout ${q} one meter south of the front face, pointing at its center`, `text ${q} at (${fmt(at[0])}, -1, ${fmt(at[2])}) with a leader line to the center of the front wall`]); }
  else if (where === "above") { const up = r.pick([0.5, 1, 1.5, 2]); at = [r4(w / 2), r4(d / 2), r4(h + up)]; leader = r.chance(0.5) ? [r4(w / 2), r4(d / 2), h] : null; req = `put the text ${q} ${metric(r, up)} above the middle of the ${n}${leader ? ", with a leader down to the roof" : ""}`; }
  else { at = [r.step(-5, 10, 0.5), r.step(-5, 10, 0.5), 0]; req = r.pick([`add the text ${q} at ${P2(r, at)}`, `a text label ${q} on the ground at ${P2(r, at)}`, `write ${q} at ${P2(r, at)}`]); }
  const exp = [{ path: "texts", op: "len", value: 1 }, { path: "texts", find: { text: T }, get: "at", op: "approx", value: at, tol: 0.05 }];
  if (leader) exp.push({ path: "texts", find: { text: T }, get: "leader", op: "approx", value: leader, tol: 0.05 });
  return { fx, request: req, commands: [{ cmd: "text", at, text: T, ...(leader ? { leader } : {}) }], check: { probes: [docProbe(...exp)] } };
});

F("m3", "guide", 140, "easy", (r) => {
  const fx = r.chance(0.5) ? fxEdged(r) : null;
  const kind = r.pick(fx ? ["offset", "offset", "line", "point", "angle"] : ["line", "point", "angle"]);
  let p, dir = null, req;
  if (kind === "offset") {
    const { name: n, w, d } = fx, side = r.pick(["front", "back", "west", "east"]), o = small(r, [20, 30, 50, 60, 75, 90, 100, 120, 150, 200]);
    const inward = r.chance(0.6);
    if (side === "front") { p = [0, r4(inward ? o.v : -o.v), 0]; dir = [1, 0, 0]; }
    else if (side === "back") { p = [0, r4(inward ? d - o.v : d + o.v), 0]; dir = [1, 0, 0]; }
    else if (side === "west") { p = [r4(inward ? o.v : -o.v), 0, 0]; dir = [0, 1, 0]; }
    else { p = [r4(inward ? w - o.v : w + o.v), 0, 0]; dir = [0, 1, 0]; }
    req = r.pick([`a guide line ${o.t} ${inward ? "in from" : "outside"} the ${side} wall of the ${n}, parallel to it, on the ground`, `tape measure a guide ${o.t} ${inward ? "inside" : "out from"} the ${n}'s ${side} side`, `put a construction line parallel to the ${side} wall, ${o.t} ${inward ? "inward" : "outward"}`]);
  } else if (kind === "line") {
    const ax = r.pick(["x", "y", "z"]), q = [r.step(-5, 8, 0.5), r.step(-5, 8, 0.5), ax === "z" ? 0 : r.pick([0, 0, 0, 1, 2.5])];
    p = q; dir = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[ax];
    const W = { x: r.pick(["the x axis", "x", "east-west", "the red axis"]), y: r.pick(["the y axis", "y", "north-south", "the green axis"]), z: r.pick(["z", "vertical", "the blue axis", "straight up"]) }[ax];
    req = r.pick([`a guide line along ${W} through ${P3(r, q)}`, `add a construction guide running ${W} through ${P3(r, q)}`, `guide line through ${P3(r, q)}, direction ${W}`]);
  } else if (kind === "point") {
    p = [r.step(-5, 8, 0.5), r.step(-5, 8, 0.5), r.pick([0, 0, 1, 2, 3])];
    req = r.pick([`put a guide point at ${P3(r, p)}`, `mark a construction point at ${P3(r, p)}`, `add a guide point at ${P3(r, p)}`]);
  } else {
    const a = r.pick([15, 30, 45, 60, 120, 135]), q = [r.step(-4, 6, 0.5), r.step(-4, 6, 0.5), 0];
    p = q; dir = [r4(Math.cos((a * PI) / 180)), r4(Math.sin((a * PI) / 180)), 0];
    req = r.pick([`protractor: a guide through ${P2(r, q)} at ${a} degrees from the x axis`, `a construction line through ${P2(r, q)} angled ${a}° counter-clockwise from east`, `add a guide at ${a} degrees (from +x, counter-clockwise) through ${P2(r, q)}`]);
  }
  return { fx, request: req, commands: [{ cmd: "guide", point: p, ...(dir ? { direction: dir } : {}) }], check: { probes: [docProbe({ path: "guides", op: "len", value: 1 }, { path: "guides", op: "has_line", value: { p, dir } })] } };
});

F("m3", "clear", 40, "easy", (r) => {
  const fx0 = fxEdged(r), k = r.int(2, 4);
  const gs = Array.from({ length: k }, (_, i) => ({ cmd: "guide", point: [i, 0, 0], direction: [0, 1, 0] }));
  const fx = withNote(fx0, `There are ${k} construction guide lines in the model.`, gs);
  const req = r.pick(["delete all the guides", "clear the construction lines", "remove every guide line", "get rid of the guides", "erase all guides"]);
  return { fx, request: req, commands: [{ cmd: "clear_guides" }], check: { probes: [docProbe({ path: "guides", op: "len", value: 0 })] } };
});

F("m3", "axes", 100, "medium", (r) => {
  const fx0 = fxEdged(r), { name: n, w, d, h } = fx0;
  const opt = r.pick(["ne", "top", "angle", "reset", "corner"]);
  if (opt === "reset") {
    const fx = withNote(fx0, `The drawing axes were moved to the ${n}'s north-east corner.`, [{ cmd: "set_axes", origin: [w, d, 0], x: [-1, 0, 0], y: [0, -1, 0] }]);
    const req = r.pick(["reset the axes", "put the drawing axes back where they were", "reset the axes to the model's own", "undo the axes move: back to default axes"]);
    return { fx, request: req, commands: [{ cmd: "set_axes", reset: true }], check: { probes: [docProbe({ path: "axes", op: "null" })] } };
  }
  let o, x, y, req;
  if (opt === "ne") { o = [w, d, 0]; x = [-1, 0, 0]; y = [0, -1, 0]; req = r.pick([`move the axes to the ${n}'s north-east corner, red pointing west along the north wall`, `axes origin at (${fmt(w)}, ${fmt(d)}, 0), red going west, green going south`]); }
  else if (opt === "top") { o = [0, 0, h]; x = [1, 0, 0]; y = [0, 1, 0]; req = r.pick([`put the drawing axes on the top of the ${n}, at its south-west corner`, `set the axes origin to (0, 0, ${fmt(h)}), red east, green north`, `axes on the roof of the ${n}, same directions, at the corner over the origin`]); }
  else if (opt === "corner") { o = [w, 0, 0]; x = [0, 1, 0]; y = [-1, 0, 0]; req = r.pick([`axes at the south-east corner of the ${n}, red running north along the east wall`, `move the origin to (${fmt(w)}, 0, 0) with the red axis along +y`]); }
  else { const a = r.pick([15, 20, 30, 45, 60]), c = Math.cos((a * PI) / 180), s = Math.sin((a * PI) / 180); o = [r.step(-3, 6, 0.5), r.step(-3, 6, 0.5), 0]; x = [r4(c), r4(s), 0]; y = [r4(-s), r4(c), 0]; req = r.pick([`rotate the drawing axes ${a} degrees counter-clockwise and put the origin at ${P2(r, o)}`, `axes origin ${P2(r, o)}, red at ${a}° from east`, `align the axes to a ${a} degree angle, origin at ${P2(r, o)}`]); }
  return { fx: fx0, request: req, commands: [{ cmd: "set_axes", origin: o, x, y }], check: { probes: [docProbe({ path: "axes.0", op: "approx", value: o, tol: 0.01 }, { path: "axes.1", op: "approx", value: x, tol: 0.01 }, { path: "axes.2", op: "approx", value: y, tol: 0.01 })] } };
});

F("m3", "resize", 90, "medium", (r) => {
  const fx = fxEdged(r), { name: n, w, d, h } = fx;
  const dim = r.pick(["width", "depth", "height"]);
  const have = { width: w, depth: d, height: h }[dim];
  const ft = r.chance(0.3);
  let want = ft ? r.step(5, 40, 1) * FT : r.step(1, 15, 0.5);
  want = r4(want);
  if (Math.abs(want - have) < 0.2) return null;
  const f = r4(want / have);
  const wt = ft ? `${Math.round(want / FT)} ft` : metric(r, want);
  const req = r.pick([`the ${n} measures ${fmt(have)} m ${dim === "height" ? "tall" : dim === "width" ? "wide" : "deep"} but it should be ${wt}: resize the whole model`, `tape measure: the ${n}'s ${dim} is ${fmt(have)} m and should be ${wt}, scale everything to match`, `rescale the model so the ${n} is ${wt} ${dim === "height" ? "tall" : dim === "width" ? "wide" : "deep"}`]);
  return { fx, request: req, commands: [{ cmd: "resize", factor: f }], check: { bbox: { size: [r4(w * f), r4(d * f), r4(h * f)], tol: 0.03 } } };
});

// ================================================================ m4: edges
F("m4", "soften", 110, "easy", (r) => {
  const fx0 = fxEdged(r), { name: n } = fx0;
  const opt = r.pick(["top", "front", "hard", "coplanar"]);
  if (opt === "hard") {
    const fx = withNote(fx0, `The edges around the top face are softened.`, [{ cmd: "soften", ids: ["@top"] }]);
    const req = r.pick(["make the top edges hard again", "unsoften the edges of the top face", "show the edges around the roof again (unsoften)"]);
    return { fx, request: req, commands: [{ cmd: "soften", ids: ["@top"], soft: false }], check: { probes: [docProbe({ path: "soft", op: "eq", value: 0 })] } };
  }
  if (opt === "coplanar") {
    const w = r.step(3, 8, 0.5), d = r.step(2, 6, 0.5), cut = r4(r.step(1, w - 1, 0.5));
    const fx = { kind: "split", setup: [{ cmd: "rect", from: [0, 0, 0], to: [w, d, 0] }, { cmd: "line", points: [[cut, 0, 0], [cut, d, 0]] }], desc: `A flat ${fmt(w)} by ${fmt(d)} m rectangle on the ground, split in two by a line at x = ${fmt(cut)}.`, trusted: true };
    const req = r.pick(["soften every flat seam in the model", "hide all the coplanar edges", "soften the edges between faces that lie flat in one plane", "clean up: soften coplanar lines everywhere"]);
    return { fx, request: req, commands: [{ cmd: "soften", coplanar: true }], check: { probes: [docProbe({ path: "soft", op: "eq", value: 1 })] } };
  }
  const f = opt === "top" ? "@top" : "@front", wd = opt === "top" ? r.pick(["top face", "roof"]) : r.pick(["front face", "front wall"]);
  const req = r.pick([`soften the edges of the ${wd}`, `smooth out the lines around the ${wd} of the ${n}`, `hide the edges around the ${wd} (soften them)`, `eraser with ctrl: soften the ${wd}'s edges`]);
  return { fx: fx0, request: req, commands: [{ cmd: "soften", ids: [f] }], check: { probes: [docProbe({ path: "soft", op: "eq", value: 4 })] } };
});

const EDGES = { top_front: "top front edge", top_back: "top back edge", top_east: "top east edge", top_west: "top west edge", corner: "south-east corner edge" };
F("m4", "divide", 90, "easy", (r) => {
  const fx = fxEdged(r), e = r.pick(Object.keys(EDGES)), c = r.int(2, 12);
  const req = r.pick([`divide the ${EDGES[e]} into ${c} equal parts`, `split @${e} into ${c} segments`, `cut the ${EDGES[e]} of the ${fx.name} into ${c} even pieces`, `divide the ${EDGES[e]} ${c} times`.replace(/ \d+ times/, ` into ${c}`)]);
  return { fx, request: req, commands: [{ cmd: "divide", edge: `@${e}`, count: c }], check: { probes: [infoProbe({ path: "edges", op: "eq", value: 12 + c - 1 })] } };
});

F("m4", "weld", 70, "medium", (r) => {
  const n = r.int(3, 6), pts = [[0, 0, 0]];
  for (let i = 1; i <= n; i++) { const p = pts.at(-1); pts.push(i % 2 ? [r4(p[0] + r.step(1, 3, 0.5)), p[1], 0] : [p[0], r4(p[1] + r.step(1, 3, 0.5)), 0]); }
  const names = Array.from({ length: n }, (_, i) => `s${i + 1}`);
  const fx = { kind: "path", setup: names.map((s, i) => ({ cmd: "line", points: [pts[i], pts[i + 1]], as: s })), desc: `A zig-zag path of ${n} separate connected edges on the ground, @${names.join(", @")} in order, through ${pts.map((p) => `(${fmt(p[0])}, ${fmt(p[1])})`).join(", ")}.`, trusted: true };
  const req = r.pick(["weld the path into one curve", "join those edges into a single curve", `weld @s1 through @s${n} together`, "make the zig-zag one curve so it selects as one"]);
  return { fx, request: req, commands: [{ cmd: "weld", edges: names.map((s) => `@${s}`) }], check: { probes: [docProbe({ path: "curves", op: "eq", value: 1 })] } };
});

F("m4", "unweld", 50, "easy", (r) => {
  const [x, y] = pt(r), L = r.step(2, 8, 0.5), b = r4(Math.min(L / 2, r.step(0.5, 2, 0.5)));
  const circle = r.chance(0.35);
  const fx = circle
    ? { kind: "circlecurve", setup: [{ cmd: "circle", center: [x, y, 0], radius: r4(L / 2), as: "c" }, { cmd: "line", points: [[r4(x + L / 2), y, 0], [r4(x + L / 2), y, 0.0001]] }].slice(0, 1), desc: `A circle of radius ${fmt(r4(L / 2))} m on the ground at (${fmt(x)}, ${fmt(y)}); @c is its face.`, trusted: true }
    : { kind: "arccurve", setup: [{ cmd: "arc", start: [x, y, 0], end: [r4(x + L), y, 0], bulge: b, as: "arc" }], desc: `An arc from (${fmt(x)}, ${fmt(y)}) to (${fmt(r4(x + L))}, ${fmt(y)}), bulging ${fmt(b)} m north; @arc is one of its edges.`, trusted: true };
  if (circle) return null; // a circle's curve is its face's outline: explode_curve takes edges, keep to the arc
  const req = r.pick(["explode the arc into separate edges", "break the arc curve into its segments", "explode curve on the arc", "turn the arc back into loose edges"]);
  return { fx, request: req, commands: [{ cmd: "explode_curve", edges: ["@arc"] }], check: { probes: [docProbe({ path: "curves", op: "eq", value: 0 }, { path: "edges", op: "eq", value: 12 })] } };
});

F("m4", "bevel", 130, "medium", (r) => {
  const fx = fxEdged(r), { name: n } = fx;
  const k = r.pick([1, 1, 2, 4]);
  const es = k === 1 ? [r.pick(["top_front", "top_back", "top_east", "top_west", "corner"])] : k === 2 ? r.pick([["top_front", "top_back"], ["top_east", "top_west"]]) : ["top_front", "top_back", "top_east", "top_west"];
  const round = r.chance(0.45), seg = round ? r.pick([3, 4, 5, 6, 8]) : 1;
  const S = small(r, [5, 10, 15, 20, 25, 30]);
  const what = k === 1 ? `the ${EDGES[es[0]]}` : k === 2 ? (es[0] === "top_front" ? "the top front and back edges" : "the top east and west edges") : "all four top edges";
  const req = round
    ? r.pick([`round ${what} of the ${n} with a ${S.t} radius, ${seg} segments`, `fillet ${what}: ${S.t}, ${seg} segments`, `give ${what} a ${S.t} rounded bevel in ${seg} steps`])
    : r.pick([`chamfer ${what} of the ${n} by ${S.t}`, `bevel ${what} ${S.t}`, `put a ${S.t} flat bevel on ${what}`, `cut a ${S.t} chamfer along ${what}`]);
  return { fx, request: req, commands: [{ cmd: "bevel", edges: es.map((e) => `@${e}`), size: S.v, ...(round ? { segments: seg } : {}) }], check: { faces: { min: 6 + k * seg }, bbox: { size: [fx.w, fx.d, fx.h], tol: 0.02 } } };
});

F("m4", "reverse", 60, "easy", (r) => {
  const fx0 = fxEdged(r), { name: n, h } = fx0;
  if (r.chance(0.5)) {
    const req = r.pick(["reverse the top face", "flip the top face's normal", "the roof face is facing the wrong way, reverse it", "turn the top face inside out"]);
    return { fx: fx0, request: req, commands: [{ cmd: "reverse", ids: ["@top"] }], check: { has_face: [{ normal: [0, 0, -1], z: [h - 0.01, h + 0.01] }] } };
  }
  const fx = withNote(fx0, `Every face of the ${n} is reversed (it is inside out).`, [{ cmd: "reverse", ids: [`@${n}`] }]);
  const req = r.pick([`the ${n} is inside out, reverse all its faces`, `fix the ${n}: its faces point inward, flip them`, `reverse every face of the ${n}`]);
  return { fx, request: req, commands: [{ cmd: "reverse", ids: [`@${n}`] }], check: { has_face: [{ normal: [0, 0, 1], z: [h - 0.01, h + 0.01] }, { normal: [0, -1, 0] }, { normal: [0, 0, -1], z: [-0.01, 0.01] }] } };
});

// ================================================================ m5: groups and solids
F("m5", "explode", 60, "easy", (r) => {
  const fx = fxComp(r), which = r.pick(["1", "2"]);
  const req = r.pick([`explode the ${which === "1" ? "first" : "second"} ${fx.c}`, `turn @${fx.c}${which} back into plain geometry`, `explode the ${fx.c} ${which === "1" ? "at the origin" : `at x ${fmt(fx.dx)}`}`, `break the ${which === "1" ? "first" : "second"} ${fx.c} out of the component`]);
  return { fx, request: req, commands: [{ cmd: "explode", id: `@${fx.c}${which}` }], check: { instances: { n: 1 }, groups: { n: 1 } } };
});

F("m5", "ungroup", 60, "easy", (r) => {
  if (r.chance(0.5)) {
    const fx = fxEdged(r);
    const req = r.pick([`ungroup the ${fx.name}`, `dissolve the ${fx.name} group`, `explode the ${fx.name} group into loose faces`, `take the ${fx.name} out of its group`]);
    return { fx, request: req, commands: [{ cmd: "ungroup", id: `@${fx.name}` }], check: { groups: { n: 0 }, faces: { min: 6, max: 6 } } };
  }
  const fx = fxTwo(r);
  const which = r.pick([fx.n1, fx.n2]);
  const req = r.pick([`ungroup the ${which}`, `dissolve the ${which} group, keep the other`, `ungroup just the ${which}`]);
  return { fx, request: req, commands: [{ cmd: "ungroup", id: `@${which}` }], check: { groups: { n: 1 }, parts: [{ name: which === fx.n1 ? fx.n2 : fx.n1, size: which === fx.n1 ? [fx.b, fx.b, fx.h2] : [fx.a, fx.a, fx.h1], tol: 0.02 }] } };
});

F("m5", "intersect", 70, "medium", (r) => {
  const fx = fxTwo(r);
  const sel = r.chance(0.5);
  const req = sel ? r.pick([`intersect the ${fx.n1} and the ${fx.n2} with each other`, `intersect faces: the two boxes with each other only`, `draw the lines where the ${fx.n1} and ${fx.n2} cross, with each other`]) : r.pick([`intersect the ${fx.n1} with the model`, `intersect faces with model on the ${fx.n1}`, `cut lines into the ${fx.n1} wherever it meets the rest of the model`]);
  return { fx, request: req, commands: [{ cmd: "intersect", ids: sel ? [`@${fx.n1}`, `@${fx.n2}`] : [`@${fx.n1}`], ...(sel ? { with: "selection" } : {}) }], check: { probes: [infoProbe({ path: "edges", op: "min", value: 26 })], groups: { n: 2 } } };
});

F("m5", "solid", 160, "hard", (r) => {
  const fx = fxTwo(r), { n1, n2, a, h1, ox, oy, b, h2 } = fx;
  const op = r.pick(["union", "union", "subtract", "subtract", "intersect", "trim", "outer_shell", "split"]);
  const ux = r4(Math.max(a, ox + b)), cutter = r.pick([n1, n2]), other = cutter === n1 ? n2 : n1;
  let ids = [`@${n1}`, `@${n2}`], check, req;
  if (op === "union" || op === "outer_shell") {
    req = op === "union" ? r.pick([`join the ${n1} and the ${n2} into one solid`, `union the two boxes`, `solid union: ${n1} + ${n2}`, `merge the ${n1} and ${n2} into a single solid`]) : r.pick([`outer shell the ${n1} and the ${n2}`, `make one outer shell out of both boxes`]);
    check = { groups: { n: 1 }, bbox: { size: [ux, ux, Math.max(h1, h2)], tol: 0.02 } };
  } else if (op === "subtract") {
    ids = [`@${cutter}`, `@${other}`];
    req = r.pick([`subtract the ${cutter} from the ${other}`, `cut the ${cutter} out of the ${other}`, `use the ${cutter} to carve a notch out of the ${other} and remove the ${cutter}`, `solid subtract: ${other} minus ${cutter}`]);
    const keep = other === n1 ? { s: [a, a, h1], lo: [0, 0] } : { s: [b, b, h2], lo: [ox, oy] };
    check = { groups: { n: 1 }, bbox: { size: keep.s, tol: 0.02 }, faces: { min: 7 } };
  } else if (op === "trim") {
    ids = [`@${cutter}`, `@${other}`];
    req = r.pick([`trim the ${other} with the ${cutter}, keeping the ${cutter}`, `solid trim: the ${cutter} cuts the ${other} and stays`]);
    check = { groups: { n: 2 }, bbox: { size: [ux, ux, Math.max(h1, h2)], tol: 0.02 }, faces: { min: 13 } };
  } else if (op === "intersect") {
    const ix = r4(a - ox);
    req = r.pick([`keep only the part where the ${n1} and ${n2} overlap`, `solid intersect the two boxes`, `intersect the ${n1} and the ${n2} as solids, keep the shared volume`]);
    check = { groups: { n: 1 }, bbox: { size: [Math.min(ix, b), Math.min(ix, b), Math.min(h1, h2)], tol: 0.02 } };
  } else {
    req = r.pick([`split the ${n1} and ${n2} where they overlap`, `solid split the two boxes into their pieces`]);
    check = { groups: { min: 3 } };
  }
  return { fx, request: req, commands: [{ cmd: "solid", op, ids }], check };
});

F("m5", "slice", 90, "medium", (r) => {
  const fx = fxEdged(r), { name: n, w, d, h } = fx;
  const ax = r.pick(["x", "y", "z"]);
  const at = ax === "x" ? r4(r.step(0.5, w - 0.5, 0.5)) : ax === "y" ? r4(r.step(0.5, d - 0.5, 0.5)) : r4(r.step(0.5, h - 0.5, 0.5));
  const origin = ax === "x" ? [at, 0, 0] : ax === "y" ? [0, at, 0] : [0, 0, at], normal = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[ax];
  const half = Math.abs(at - (ax === "x" ? w : ax === "y" ? d : h) / 2) < 1e-6;
  const req = ax === "z"
    ? r.pick([`slice the ${n} horizontally at ${metric(r, at)} high`, `cut the ${n} in two at height ${fmt(at)}`, `split the ${n} with a level cut ${metric(r, at)} up`])
    : r.pick([`slice the ${n} ${half ? "in half" : "in two"} at ${ax} = ${fmt(at)}`, `cut the ${n} into two pieces along the plane ${ax} = ${fmt(at)}`, `${half ? `cut the ${n} down the middle` : `split the ${n} at ${ax} ${fmt(at)}`}${half ? (ax === "x" ? " east-west" : " north-south") : ""}`.replace("east-west", "(across x)").replace("north-south", "(across y)")]);
  const sz = [w, d, h], ix = { x: 0, y: 1, z: 2 }[ax];
  const p1 = [...sz], p2 = [...sz]; p1[ix] = at; p2[ix] = r4(sz[ix] - at);
  return { fx, request: req, commands: [{ cmd: "slice", id: `@${n}`, origin, normal }], check: { groups: { n: 2 }, parts: [{ size: p1, tol: 0.02 }, { size: p2, tol: 0.02 }] } };
});

F("m5", "flip", 90, "medium", (r) => {
  const fx = fxEll(r), { name: n, a, b, t, h } = fx;
  const ax = r.pick(["x", "y"]);
  const req = ax === "x"
    ? r.pick([`flip the ${n} along x`, `mirror the ${n} east to west in place`, `flip along the red axis: the ${n}`, `flip the ${n} so its short leg is at the east end`])
    : r.pick([`flip the ${n} along y`, `mirror the ${n} north to south in place`, `flip along the green axis: the ${n}`, `flip the ${n} so its long leg runs along the north side`]);
  // after flip x the north leg sits at x a-t..a: its north end face; after flip y the east leg sits at y b-t..b: its east end face
  const hf = ax === "x" ? { normal: [0, 1, 0], area: r4(t * h), x: [a - t - 0.01, a + 0.01], y: [b - 0.01, b + 0.01] } : { normal: [1, 0, 0], area: r4(t * h), x: [a - 0.01, a + 0.01], y: [b - t - 0.01, b + 0.01] };
  return { fx, request: req, commands: [{ cmd: "flip", ids: [`@${n}`], axis: ax }], check: { has_face: [hf], bbox: { size: [a, b, h], tol: 0.02 } } };
});

F("m5", "subdivide", 70, "medium", (r) => {
  const fx = fxEdged(r), { name: n } = fx;
  const L = r.pick([null, 1, 1, 2, 3]), sharp = r.chance(0.25);
  const lt = L ? r.pick([` ${L} level${L > 1 ? "s" : ""}`, `, ${L} subdivision level${L > 1 ? "s" : ""}`, ` at level ${L}`]) : "";
  const req = r.pick([`smooth the ${n} into a subdivision surface${lt}`, `subdivide the ${n}${lt}${sharp ? ", keeping the sharp edges" : ""}`, `make the ${n} a smooth SubD shape${lt}${sharp ? " but keep its hard edges creased" : ""}`, `round off the ${n} with subdivision${lt}`]);
  const lv = L ?? 2;
  return { fx, request: req, commands: [{ cmd: "subdivide", id: `@${n}`, ...(L ? { levels: L } : {}), ...(sharp && !req.startsWith("smooth") && !req.startsWith("round") ? { keep_sharp: true } : {}) }], check: { faces: { min: Math.round(48 * 4 ** (lv - 1) * 0.9) } } };
});

// ================================================================ m6: materials
const MATDEFS = [
  ["steel", [0.6, 0.6, 0.65], { metalness: 1, roughness: 0.3 }, ["brushed steel", "steel", "metal"]],
  ["chrome", [0.9, 0.9, 0.9], { metalness: 1, roughness: 0.05 }, ["chrome", "mirror metal"]],
  ["glass", [0.8, 0.9, 1], { glass: true }, ["glass", "clear glass", "glazing"]],
  ["lacquer", [0.8, 0.05, 0.05], { roughness: 0.1 }, ["glossy red lacquer", "shiny red paint"]],
  ["lamp", [1, 0.95, 0.8], { emission: 1 }, ["glowing lamp", "light that glows", "emissive warm white"]],
  ["rubber", [0.1, 0.1, 0.1], { roughness: 0.9 }, ["matte black rubber", "rough black"]],
  ["gold", [1, 0.8, 0.3], { metalness: 1, roughness: 0.2 }, ["gold", "polished gold"]],
  ["concrete2", [0.6, 0.6, 0.58], { roughness: 0.95 }, ["rough gray concrete", "matte concrete"]],
  ["copper", [0.85, 0.5, 0.3], { metalness: 1, roughness: 0.35 }, ["copper", "brushed copper"]],
];
const propTxt = (r, p) => [p.metalness != null && r.pick([`metalness ${p.metalness}`, "fully metallic"]), p.roughness != null && `roughness ${p.roughness}`, p.glass && "glass", p.emission != null && `emission ${p.emission}`].filter(Boolean).join(", ");
const matExp = (name, color, p) => [{ path: `materials.${name}.color`, op: "approx", value: color, tol: 0.02 }, ...Object.entries(p).map(([k, v]) => (typeof v === "boolean" ? { path: `materials.${name}.${k}`, op: "eq", value: v } : { path: `materials.${name}.${k}`, op: "approx", value: v, tol: 0.01 }))];
F("m6", "material", 120, "easy", (r) => {
  const [name0, color, p, words] = r.pick(MATDEFS), name = name0 === "concrete2" ? "concrete" : name0;
  const ct = `[${color.join(", ")}]`;
  const req = r.pick([`make a material called ${name}: color ${ct}, ${propTxt(r, p)}`, `create a ${r.pick(words)} material named ${name} (rgb ${ct}, ${propTxt(r, p)})`, `new material ${name}, ${propTxt(r, p)}, color ${ct}`]);
  return { request: req, commands: [{ cmd: "material", name, color, ...p }], check: { probes: [docProbe(...matExp(name, color, p))] } };
});

F("m6", "matpaint", 120, "medium", (r) => {
  const fx = fxEdged(r), { name: n, h } = fx;
  const [name0, color, p, words] = r.pick(MATDEFS), name = name0 === "concrete2" ? "concrete" : name0;
  const target = r.pick(["all", "top", "front"]);
  const tw = target === "all" ? `the ${n}` : target === "top" ? "the top" : "the front wall";
  const ct = `[${color.join(", ")}]`;
  const req = r.pick([`make a ${r.pick(words)} material called ${name} (color ${ct}, ${propTxt(r, p)}) and paint ${tw} with it`, `paint ${tw} with a new material ${name}: ${ct}, ${propTxt(r, p)}`, `${tw}: a ${name} material, rgb ${ct}, ${propTxt(r, p)}`]);
  const ids = target === "all" ? [`@${n}`] : target === "top" ? ["@top"] : ["@front"];
  const where = target === "all" ? {} : target === "top" ? { normal: [0, 0, 1], z: [h - 0.01, h + 0.01] } : { normal: [0, -1, 0] };
  return { fx, request: req, commands: [{ cmd: "material", name, color, ...p }, { cmd: "paint", ids, material: name }], check: { material: [{ name, where, all: true, ...(target === "all" ? { min: 6 } : {}) }], probes: [docProbe(...matExp(name, color, p))] } };
});

F("m6", "edit", 70, "easy", (r) => {
  const fx0 = fxEdged(r), { name: n } = fx0;
  const [name0, color, p] = r.pick(MATDEFS.filter(([m]) => m !== "glass")), name = name0 === "concrete2" ? "concrete" : name0;
  const fx = withNote(fx0, `The model has a material "${name}" (color [${color.join(", ")}]) and the ${n} is painted with it.`, [{ cmd: "material", name, color, ...p }, { cmd: "paint", ids: [`@${n}`], material: name }]);
  const what = r.pick(["roughness", "metalness", "emission"]), v = r.pick([0, 0.2, 0.5, 0.8, 1]);
  if (p[what] === v) return null;
  const req = r.pick([`set the ${name}'s ${what} to ${v}`, `change the ${what} of the ${name} material to ${v}`, `make the ${name} ${what} ${v}`]);
  return { fx, request: req, commands: [{ cmd: "material", name, color, [what]: v }], check: { probes: [docProbe({ path: `materials.${name}.${what}`, op: "approx", value: v, tol: 0.01 }, { path: `materials.${name}.color`, op: "approx", value: color, tol: 0.02 })] } };
});

F("m6", "tile", 100, "medium", (r) => {
  const fx0 = fxBox(r, { nmat: r.int(2, 3) });
  const m = r.pick(fx0.ms);
  const fx = withNote(fx0, `Each picture material's tile is 0.5 by 0.5 m. The front face wears ${m}.`, [{ cmd: "paint", ids: ["@front"], material: m }]);
  const opt = r.pick(["wh", "wh", "times", "square"]);
  let wv, hv, req;
  if (opt === "wh") { wv = r.pick([0.25, 0.3, 1, 1.2, 2]); hv = r.pick([0.2, 0.25, 0.5, 1, 1.5]); req = r.pick([`make the ${m} tiles ${metric(r, wv)} wide and ${metric(r, hv)} tall`, `set the ${m} picture to repeat every ${fmt(wv)} by ${fmt(hv)} m`, `change the ${m} tile size to ${fmt(wv)} x ${fmt(hv)} m`]); }
  else if (opt === "times") { const k = r.pick([2, 3, 4]); wv = hv = r4(0.5 * k); req = r.pick([`make the ${m} pattern ${k} times bigger`, `scale the ${m} texture up ${k}x (its tiles are 0.5 m now)`, `the ${m} looks too small, make each tile ${k} times larger`]); }
  else { wv = hv = r.pick([0.2, 0.25, 1, 1.5, 2]); req = r.pick([`${m} tiles should be ${metric(r, wv)} square`, `set the ${m} picture size to ${fmt(wv)} m by ${fmt(wv)} m`]); }
  return { fx, request: req, commands: [{ cmd: "texture", name: m, width: wv, height: hv }], check: { material: [{ name: m, where: { normal: [0, -1, 0] }, all: true }], probes: [docProbe({ path: `materials.${m}.tile`, op: "approx", value: [wv, hv], tol: 0.001 }), { cmd: { cmd: "texture_frame", face: "@front" }, expect: [{ path: "tile", op: "approx", value: [wv, hv], tol: 0.001 }] }] } };
});

F("m6", "pixels", 40, "easy", (r) => {
  const fx0 = fxBox(r, { nmat: 2 }), pname = r.pick(["mural", "decal", "logo", "sign", "graffiti"]);
  const fx = withNote(fx0, `@front wears a 64 px paint texture named ${pname}.`, [{ cmd: "texture_paint_new", faces: ["@front"], size: 64, name: pname, unwrap: true }]);
  const Q = r.pick([[`what color is the top-left pixel of the ${pname}?`, { material: pname }], [`show me an 8 by 8 block of the ${pname}'s pixels from the corner`, { material: pname, x: 0, y: 0, w: 8, h: 8 }], [`read the ${pname} pixels at x 16, y 16, a 4 by 4 patch`, { material: pname, x: 16, y: 16, w: 4, h: 4 }], [`what's painted on the ${pname} so far? sample the first row`, { material: pname, x: 0, y: 0, w: 64, h: 1 }]]);
  return { fx, request: Q[0], commands: [{ cmd: "texture_pixels", ...Q[1] }], check: { readonly: true } };
});

// ================================================================ u1: UV and texture-painting chains
F("u1", "seam_unwrap", 110, "hard", (r) => {
  const fx = fxBox(r, { nmat: 2 }), n = fx.name, a = r.pick([20, 30, 45, 60, 75]);
  const req = r.pick([`mark seams on every edge of the ${n} sharper than ${a} degrees, then unwrap it along those seams`, `seam the ${n} at ${a}° and UV unwrap it using the marked seams`, `cut UV seams at the hard edges (over ${a} degrees) and unwrap the ${n} on them`]);
  return { fx, request: req, commands: [{ cmd: "uv_seam", entity: `@${n}`, auto: a }, { cmd: "uv_unwrap", entity: `@${n}`, seams: "marked" }], check: { probes: [...UVOK(n), { cmd: { cmd: "uv_info", entity: `@${n}` }, expect: [{ path: "seams", op: "len", value: 12 }] }] } };
});

F("u1", "unwrap_pack", 80, "medium", (r) => {
  const fx = fxBox(r, { nmat: 2 }), n = fx.name, m = r.pick([0.01, 0.02, 0.03, 0.04, 0.05]);
  const lm = r.chance(0.4);
  const req = lm ? r.pick([`unwrap the ${n}, then make its lightmap UVs with a ${m} margin`, `UV unwrap the ${n} and add a lightmap channel, margin ${m}`]) : r.pick([`unwrap the ${n} and repack the islands with a ${m} margin`, `UV unwrap the ${n}, then pack it, ${m} between islands`, `give the ${n} UVs and pack them tight with margin ${m}`]);
  const cmds = [{ cmd: "uv_unwrap", entity: `@${n}` }, lm ? { cmd: "uv_lightmap", entity: `@${n}`, margin: m } : { cmd: "uv_pack", entity: `@${n}`, margin: m }];
  const probes = [...UVOK(n), ...(lm ? [{ cmd: { cmd: "uv_info", entity: `@${n}`, set: 2 }, expect: [{ path: "without", op: "len", value: 0 }, { path: "faces.*.uv", op: "within01" }] }] : [])];
  return { fx, request: req, commands: cmds, check: { probes } };
});

F("u1", "uv_affine", 120, "hard", (r) => {
  const fx0 = fxBox(r, { nmat: 2 }), n = fx0.name;
  const fx = withNote(fx0, `The ${n} has been UV-unwrapped (it has UVs).`, [{ cmd: "uv_unwrap", entity: `@${n}` }]);
  const face = r.pick([["@front", "front face"], ["@top", "top face"], ["@side", "east face"]]);
  const opt = r.pick(["scale", "scale", "rotate", "flipu", "scalemove"]);
  let mtx, req;
  if (opt === "scale") { const s = r.pick([0.25, 0.5, 0.75, 1.5, 2]); mtx = [s, 0, 0, s, 0, 0]; req = r.pick([`scale the ${face[1]}'s UVs by ${s}`, `make the UVs of the ${face[1]} ${s} times the size`, `shrink or grow the ${face[1]} UVs to ${s}x around the UV origin`]); }
  else if (opt === "rotate") { const a = r.pick([90, 180, 270, -90]); const c = r4(Math.cos((a * PI) / 180)), s = r4(Math.sin((a * PI) / 180)); mtx = [c, s, -s, c, 0, 0]; req = r.pick([`rotate the ${face[1]}'s UVs ${Math.abs(a)} degrees${a < 0 ? " clockwise" : ""}`, `turn the UVs of the ${face[1]} by ${a}° about the UV origin`]); }
  else if (opt === "flipu") { mtx = [-1, 0, 0, 1, 1, 0]; req = r.pick([`mirror the ${face[1]}'s UVs left to right (u -> 1 - u)`, `flip the UVs of the ${face[1]} horizontally inside the 0..1 square`]); }
  else { const s = r.pick([0.5, 2]), du = r.pick([0.1, 0.2, 0.25]); mtx = [s, 0, 0, s, du, 0]; req = r.pick([`scale the ${face[1]} UVs by ${s} and then move them ${du} right`, `UVs of the ${face[1]}: ${s}x size, shifted ${du} in u`]); }
  return { fx, request: req, commands: [{ cmd: "uv_transform", faces: [face[0]], matrix: mtx }], check: { probes: [{ cmd: { cmd: "uv_info", faces: [face[0]] }, before: true, expect: [{ path: "faces.*.uv", op: "affine", value: mtx, tol: 0.003 }] }] } };
});

F("u1", "project_multi", 110, "medium", (r) => {
  const fx = fxBox(r), n = fx.name, m = r.pick(fx.ms);
  const faces = r.pick([[["@front", "@side"], "the front and east walls", [[0, -1, 0], [1, 0, 0]]], [["@top", "@front"], "the top and the front", [[0, 0, 1], [0, -1, 0]]], [["@side", "@top"], "the east wall and the roof", [[1, 0, 0], [0, 0, 1]]]]);
  const mode = r.pick(["box", "box", "planar", "cylinder"]);
  const sc = r.chance(0.3) ? r.pick([0.5, 2, 3]) : null;
  const MW = { box: "box projection", planar: "a planar projection", cylinder: "a cylinder projection" }[mode];
  const req = r.pick([`project ${m} onto ${faces[1]} of the ${n} with ${MW}${sc ? `, scale ${sc}` : ""}`, `use ${MW} to put ${m} on ${faces[1]}${sc ? ` at ${sc}x` : ""}`, `${m} on ${faces[1]}, ${MW}${sc ? `, scaled ${sc}` : ""}`]);
  const hz = fx.h;
  const where = (nv) => (nv[2] === 1 ? { normal: nv, z: [hz - 0.01, hz + 0.01] } : { normal: nv });
  return { fx, request: req, commands: [{ cmd: "texture_project", faces: faces[0], mode, material: m, ...(sc ? { scale: sc } : {}) }], check: { material: faces[2].map((nv) => ({ name: m, where: where(nv), all: true })), probes: [{ cmd: { cmd: "texture_uv", faces: faces[0] }, expect: [{ path: "uv", op: "all_nonnull" }] }] } };
});

F("u1", "position_other", 90, "medium", (r) => {
  const fx0 = fxBox(r), m = r.pick(fx0.ms);
  const face = r.pick([["@side", "east wall", { normal: [1, 0, 0] }], ["@top", "top", { normal: [0, 0, 1], z: [fx0.h - 0.01, fx0.h + 0.01] }]]);
  const fx = withNote(fx0, `The ${face[1]} wears ${m}.`, [{ cmd: "paint", ids: [face[0]], material: m }]);
  const opt = r.pick(["scale2", "offset", "rotate"]);
  let tr, req, exp = [{ path: "own", op: "eq", value: true }];
  if (opt === "scale2") { const sx = r.pick([0.5, 2, 3]), sy = r.pick([0.5, 1, 2]); if (sx === sy) return null; tr = { scale: [sx, sy] }; req = r.pick([`stretch the ${m} on the ${face[1]} ${sx}x across and ${sy}x up`, `scale the ${face[1]} texture by ${sx} horizontally and ${sy} vertically`]); }
  else if (opt === "offset") { const du = r.pick([0.1, 0.2, -0.1, 0.25]), dv = r.pick([0, 0.1, -0.2]); tr = { offset: [du, dv] }; req = r.pick([`slide the ${m} on the ${face[1]} by ${fmt(du)} m across and ${fmt(dv)} m up`, `offset the ${face[1]}'s texture [${fmt(du)}, ${fmt(dv)}] m`]); exp.push({ path: "picture", op: "delta", value: [du, dv], tol: 0.005 }); }
  else { const a = r.pick([30, 45, 90]); tr = { rotation: a }; req = r.pick([`rotate the ${m} on the ${face[1]} ${a} degrees`, `turn the picture on the ${face[1]} by ${a}°`]); }
  return { fx, request: req, commands: [{ cmd: "texture_position", face: face[0], transform: tr }], check: { material: [{ name: m, where: face[2], all: true }], probes: [{ cmd: { cmd: "texture_frame", face: face[0] }, before: true, expect: exp }] } };
});

const pix = (pname, col, min, size = 64) => ({ cmd: { cmd: "texture_pixels", material: pname, x: 0, y: 0, w: size, h: size }, expect: [{ path: "pixels", op: "pixels_min", value: { color: col.map((c) => Math.round(c * 255)), min, tol: 20 } }] });
F("u1", "paint_chain", 110, "hard", (r) => {
  const fx = fxBox(r, { nmat: 2 }), n = fx.name, pname = r.pick(["mural", "graffiti", "decal", "paintjob", "logo", "sign", "skin"]);
  const { k, rgb } = colorOf(r), col = rgb.slice(0, 3);
  const size = 64;
  const whole = r.chance(0.35);
  const tw = whole ? `the ${n}` : "the front wall";
  const sel = whole ? { entity: `@${n}` } : { faces: ["@front"] };
  const req = r.pick([`set up a ${size} px paint texture called ${pname} on ${tw} and fill it ${k}`, `make ${tw} paintable (${size} pixel texture, ${pname}) and paint it all ${k}`, `new ${size}px paint texture ${pname} on ${tw}, then flood it with ${k}`]);
  return { fx, request: req, commands: [{ cmd: "texture_paint_new", ...sel, size, name: pname, unwrap: true }, { cmd: "texture_paint_stroke", material: pname, ...sel, fill: true, color: col }], check: { material: [{ name: pname, ...(whole ? { min: 6 } : { where: { normal: [0, -1, 0] }, all: true }) }], probes: [pix(pname, col, 600)] } };
});

F("u1", "stroke_opts", 110, "hard", (r) => {
  const pname = r.pick(["mural", "graffiti", "decal", "paintjob", "scribble", "logo"]);
  const fx0 = fxBox(r, { nmat: 2 });
  const fx = withNote(fx0, `@front wears a 64 px paint texture named ${pname} (already unwrapped, white).`, [{ cmd: "texture_paint_new", faces: ["@front"], size: 64, name: pname, unwrap: true }]);
  const { k, rgb } = colorOf(r), col = rgb.slice(0, 3);
  const opt = r.pick(["uv", "uv", "soft", "line"]);
  const changed = { cmd: { cmd: "texture_pixels", material: pname, x: 0, y: 0, w: 64, h: 64 }, before: true, expect: [{ path: "hash", op: "changed" }] };
  if (opt === "uv") {
    const a = [r.pick([0.1, 0.2, 0.3]), r.pick([0.1, 0.2, 0.5])], b = [r.pick([0.6, 0.7, 0.9]), r.pick([0.5, 0.8, 0.9])], rad = r.pick([0.03, 0.05, 0.08, 0.1]);
    const req = r.pick([`paint a ${k} stroke on the ${pname} in UV space from (${a.join(", ")}) to (${b.join(", ")}), brush radius ${rad} of the texture`, `draw a ${k} line across the ${pname}'s UVs, (${a.join(",")}) to (${b.join(",")}), radius ${rad}`]);
    return { fx, request: req, commands: [{ cmd: "texture_paint_stroke", material: pname, faces: ["@front"], uv_points: [a, b], uv_radius: rad, color: col }], check: { probes: [changed, pix(pname, col, 4)] } };
  }
  const pt0 = [r4(fx0.w / 2), 0, r4(fx0.h / 2)];
  if (opt === "soft") {
    const hard = r.pick([0, 0.2, 0.3, 0.5]), op = r.pick([0.25, 0.5, 0.75]), rad = r.pick([0.3, 0.4, 0.5, 0.6]);
    const req = r.pick([`a soft ${k} dab in the middle of the ${pname}: ${rad * 100} cm brush, hardness ${hard}, ${op * 100}% opacity`, `with a ${rad * 100} cm, ${hard} hardness brush at ${op * 100} percent opacity, paint ${k} at the center of the front wall's ${pname}`]);
    return { fx, request: req, commands: [{ cmd: "texture_paint_stroke", material: pname, faces: ["@front"], points: [pt0], radius: rad, color: col, hardness: hard, opacity: op }], check: { probes: [changed] } };
  }
  const p1 = [r4(fx0.w * 0.2), 0, r4(fx0.h * 0.5)], p2 = [r4(fx0.w * 0.8), 0, r4(fx0.h * 0.5)], rad = r.pick([0.2, 0.3, 0.4]);
  const req = r.pick([`paint a ${k} stripe across the front wall's ${pname} from ${P3(r, p1)} to ${P3(r, p2)}, ${rad * 100} cm brush`, `one ${k} brush stroke on the ${pname}: ${P3(r, p1)} to ${P3(r, p2)}, radius ${rad * 100} cm`]);
  return { fx, request: req, commands: [{ cmd: "texture_paint_stroke", material: pname, faces: ["@front"], points: [p1, p2], radius: rad, color: col }], check: { probes: [changed, pix(pname, col, 8)] } };
});

F("u1", "erase", 50, "medium", (r) => {
  const pname = r.pick(["mural", "graffiti", "decal", "logo"]);
  const fx0 = fxBox(r, { nmat: 2 }), { k, rgb } = colorOf(r), col = rgb.slice(0, 3);
  const fx = withNote(fx0, `@front wears a 64 px paint texture named ${pname}, filled ${k}.`, [{ cmd: "texture_paint_new", faces: ["@front"], size: 64, name: pname, unwrap: true }, { cmd: "texture_paint_stroke", material: pname, faces: ["@front"], fill: true, color: col }]);
  const req = r.pick([`erase all the paint on the ${pname}`, `wipe the ${pname} clean with the eraser`, `rub out the ${k} on the ${pname} everywhere`]);
  return { fx, request: req, commands: [{ cmd: "texture_paint_stroke", material: pname, faces: ["@front"], fill: true, erase: true }], check: { probes: [{ cmd: { cmd: "texture_pixels", material: pname, x: 0, y: 0, w: 64, h: 64 }, before: true, expect: [{ path: "hash", op: "changed" }] }] } };
});

// ================================================================ x2: combos
F("x2", "combo", 80, "hard", (r) => {
  const opt = r.pick(["guide_text", "mat_soften", "slice_paint", "arc_guide"]);
  if (opt === "guide_text") {
    const fx = fxEdged(r), { name: n, w, d, h } = fx, T = r.pick(LABELS), o = r.pick([0.5, 1, 1.5]);
    const req = `put a guide line ${metric(r, o)} in front of the ${n}, parallel to its front wall, and label the top "${T}"`;
    return { fx, request: req, commands: [{ cmd: "guide", point: [0, -o, 0], direction: [1, 0, 0] }, { cmd: "text", at: [r4(w / 2), r4(d / 2), h], text: T }], check: { probes: [docProbe({ path: "guides", op: "has_line", value: { p: [0, -o, 0], dir: [1, 0, 0] } }, { path: "texts", find: { text: T }, get: "at", op: "approx", value: [r4(w / 2), r4(d / 2), h], tol: 0.05 })] } };
  }
  if (opt === "mat_soften") {
    const fx = fxEdged(r), { name: n } = fx, [name, color, p] = r.pick(MATDEFS.slice(0, 2));
    const req = `make a ${name} material (color [${color.join(", ")}], ${propTxt(r, p)}), paint the ${n} with it and soften the edges around its top`;
    return { fx, request: req, commands: [{ cmd: "material", name, color, ...p }, { cmd: "paint", ids: [`@${n}`], material: name }, { cmd: "soften", ids: ["@top"] }], check: { material: [{ name, min: 6 }], probes: [docProbe({ path: "soft", op: "eq", value: 4 }, ...matExp(name, color, p))] } };
  }
  if (opt === "slice_paint") {
    const fx = fxEdged(r), { name: n, w, d, h } = fx, { k, rgb } = colorOf(r);
    if (COLORS[k] == null) return null;
    const req = `paint the ${n} ${k}, then cut it in half at x = ${fmt(w / 2)}`;
    return { fx, request: req, commands: [{ cmd: "paint", ids: [`@${n}`], color: rgb.slice(0, 3) }, { cmd: "slice", id: `@${n}`, origin: [r4(w / 2), 0, 0], normal: [1, 0, 0] }], check: { groups: { n: 2 }, painted: [{ color: COLORS[k][1], min: 10 }], parts: [{ size: [r4(w / 2), d, h], tol: 0.02 }] } };
  }
  const R = r.step(1, 4, 0.5), [cx, cy] = pt(r);
  const req = `draw a half circle arc of radius ${fmt(R)} m centered at (${fmt(cx)}, ${fmt(cy)}), bowing north, and put a guide point at its center`;
  return { request: req, commands: [{ cmd: "arc", start: [r4(cx - R), cy, 0], end: [r4(cx + R), cy, 0], bulge: R }, { cmd: "guide", point: [cx, cy, 0] }], check: { bbox: { min: [r4(cx - R), cy, 0], max: [r4(cx + R), r4(cy + R), 0], tol: 0.02 }, probes: [docProbe({ path: "guides", op: "has_line", value: { p: [cx, cy, 0], dir: null } })] } };
});
