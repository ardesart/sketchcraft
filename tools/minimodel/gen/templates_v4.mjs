// v4 templates for the SketchCraftAI minimodel: the parts of SketchCraft that v3 never saw (the 0.3.9 commands).
// Same contract as gen/templates.mjs and templates_v3.mjs: each template samples parameters and returns
// {fx, request, commands, check}; the check is computed from the INTENT (the request's numbers), and gen_data.mjs
// verifies every pair in the engine (through `sketchcraft mcp`, the untrusted-agent allowlist) and against lib/heldout.mjs.
// Checks that info/parts/faces cannot see use `probes` (lib/probe.mjs): read-only engine commands run AFTER the answer
// (rooms, uv_info, vertex_colors, texture_frame, texture_pixels...), so the result is graded, never the command text.
//
// Families:
//   r1 rooms (Room mode): room_rect new / next to / combine / subtract, room_preview, rooms, wall_pull, wall_info
//   t1 texturing: paint with a picture material (scope, through), texture_project, texture_position
//   t2 vertex paint: vertex_paint (fill, brush stroke, strength), vertex_paint_clear, vertex_colors
//   t3 UV: uv_unwrap, uv_seam, uv_pack, uv_lightmap, uv_transform, uv_info, texture_uv
//   t4 texture painting: texture_paint_new, texture_paint_stroke, texture_paint_status
//
// Conventions taught (read from the engine, not from the eval sentences):
//   a room is dragged out between two corners ON THE WALL CENTERLINES (a 6 by 4 room = from [0,0,0] to [6,4,0]); the inside
//   is a wall thickness smaller; a room next to another one starts ON the neighbour's centerline (so the wall is shared);
//   mode "combine" takes a box that overlaps the room (the union becomes the room), "subtract" a box cut out of it;
//   wall_pull goes along the face's OUTWARD normal: positive = out, negative = in.
//   picture materials are already in the model (listed in the state); the model names them, it never writes image data.
import { COLORS, fmt, metric, r4 } from "./templates.mjs";
import { pngUrl } from "../lib/png.mjs";

export const V4 = [];
const F = (family, name, weight, tier, fn) => V4.push({ name: `${family}_${name}`, family, tier, cat: "v4", weight, fn });
const FT = 0.3048;

// ---------------------------------------------------------------- units
const unitOf = (r) => (r.chance(0.35) ? "ft" : "m");
/** a length in `unit` (value v in that unit) -> {v: meters, t: text} */
function L(r, unit, v) {
  if (unit === "ft") return { v: r4(v * FT), t: r.pick([`${fmt(v)} ft`, `${fmt(v)} feet`, `${fmt(v)}'`, `${fmt(v)} ${v === 1 ? "foot" : "feet"}`, `${fmt(v)} ft`]) };
  return { v: r4(v), t: metric(r, v) };
}
const dimStep = (unit) => (unit === "ft" ? 1 : 0.5);
const dimRange = (unit, lo, hi) => (unit === "ft" ? [Math.round(lo / FT), Math.round(hi / FT)] : [lo, hi]);
/** a room dimension in `unit`: [value in unit, meters, text] */
function dimTxt(r, unit, lo, hi) {
  const [a, b] = dimRange(unit, lo, hi);
  const v = r.step(a, b, dimStep(unit));
  const l = L(r, unit, v);
  return { u: v, v: l.v, t: l.t };
}
// "12 by 14 ft" / "12 ft by 14 ft" / "3.5 by 4 m"
function bySize(r, unit, A, B) {
  if (unit === "ft") return r.pick([`${fmt(A.u)} by ${fmt(B.u)} ft`, `${fmt(A.u)} x ${fmt(B.u)} feet`, `${fmt(A.u)}' by ${fmt(B.u)}'`, `${A.t} by ${B.t}`, `${fmt(A.u)} by ${fmt(B.u)} feet`]);
  return r.pick([`${fmt(A.u)} by ${fmt(B.u)} m`, `${fmt(A.u)} x ${fmt(B.u)} meters`, `${A.t} by ${B.t}`, `${fmt(A.u)} by ${fmt(B.u)} metres`, `${fmt(A.u)}m x ${fmt(B.u)}m`]);
}
const ROOMNAMES = ["Kitchen", "Bedroom", "Office", "Living Room", "Garage", "Studio", "Den", "Great Room", "Bath", "Pantry", "Workshop", "Nursery", "Laundry", "Gym", "Library", "Dining Room", "Mudroom", "Sunroom", "Study", "Hallway"];
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const SIDES = { east: [1, 0], west: [-1, 0], north: [0, 1], south: [0, -1] };

// ---------------------------------------------------------------- fixtures
/** one room made in Room mode, with its four outer wall faces named */
function fxRoomM(r, { name = r.pick(ROOMNAMES), second = false } = {}) {
  const unit = unitOf(r);
  const W = dimTxt(r, unit, 3, 9), D = dimTxt(r, unit, 2.5, 7);
  const w = W.v, d = D.v;
  const setup = [
    { cmd: "room_rect", from: [0, 0, 0], to: [w, d, 0], name },
    { cmd: "pick", at: [r4(w / 2), r4(d + 0.1), 1], as: "north_out" }, { cmd: "pick", at: [r4(w + 0.1), r4(d / 2), 1], as: "east_out" },
    { cmd: "pick", at: [r4(w / 2), -0.1, 1], as: "south_out" }, { cmd: "pick", at: [-0.1, r4(d / 2), 1], as: "west_out" },
  ];
  const desc = `A room named "${name}" built in Room mode: wall centerlines x 0..${fmt(w)} m, y 0..${fmt(d)} m, walls 0.2 m thick and 2.7 m high (a group; the inside is ${fmt(r4(w - 0.2))} by ${fmt(r4(d - 0.2))} m). @north_out, @south_out, @east_out and @west_out are the outer faces of its four walls (each faces away from the room, so pulling it by a positive amount moves that wall outward).`;
  return { kind: "roomm", name, w, d, unit, W, D, setup, desc, trusted: true };
}
/** two rooms side by side sharing the wall at x = w1 */
function fxTwoRooms(r) {
  const [n1, n2] = r.shuffle(ROOMNAMES).slice(0, 2);
  const w1 = r.step(3, 8, 0.5), d1 = r.step(3, 6, 0.5), w2 = r.step(2, 5, 0.5), d2 = r.step(2, d1, 0.5);
  const setup = [{ cmd: "room_rect", from: [0, 0, 0], to: [w1, d1, 0], name: n1 }, { cmd: "room_rect", from: [w1, 0, 0], to: [r4(w1 + w2), d2, 0], name: n2 }];
  const desc = `Two rooms built in Room mode: "${n1}" (wall centerlines x 0..${fmt(w1)}, y 0..${fmt(d1)}) and "${n2}" (x ${fmt(w1)}..${fmt(r4(w1 + w2))}, y 0..${fmt(d2)}), sharing the wall at x = ${fmt(w1)}. Walls 0.2 m thick, 2.7 m high.`;
  return { kind: "tworooms", n1, n2, w1, d1, w2, d2, setup, desc, trusted: true };
}

export const MATS = { brick: [190, 80, 60], wood: [150, 100, 50], stone: [130, 130, 135], tiles: [60, 140, 190], concrete: [160, 160, 155], marble: [235, 235, 240], plaster: [225, 215, 195], metal: [120, 125, 135], grass: [70, 150, 60], carpet: [120, 40, 60], slate: [70, 80, 90], sand: [220, 200, 150] };
export const MATNAMES = Object.keys(MATS);
export const HNAMES = ["house", "house", "shed", "cabin", "hut", "garage", "studio", "barn", "kiosk", "annex", "office", "cottage", "tower", "bunker"];
/** a box group with named faces and some picture materials in the model */
export function fxBox(r, { extra = [], mats = null, nmat = r.int(2, 4) } = {}) {
  const name = r.pick(HNAMES);
  const w = r.step(2.5, 10, 0.5), d = r.step(2, 8, 0.5), h = r.step(2, 5, 0.5);
  const ms = mats || r.shuffle(MATNAMES).slice(0, nmat);
  const setup = [
    { cmd: "begin_group", name, as: name }, { cmd: "rect", from: [0, 0, 0], to: [w, d, 0], as: "f" }, { cmd: "pushpull", face: "@f", distance: h, as: "top" }, { cmd: "end_group" },
    { cmd: "pick", at: [r4(w / 2), 0, r4(h / 2)], as: "front" }, { cmd: "pick", at: [w, r4(d / 2), r4(h / 2)], as: "side" },
    ...ms.map((m) => ({ cmd: "texture", name: m, data: pngUrl(MATS[m]), width: 0.5, height: 0.5 })),
    ...extra,
  ];
  const mlist = ms.length === 1 ? ms[0] : ms.slice(0, -1).join(", ") + " and " + ms.at(-1);
  const desc = `@${name} is a group named "${name}": a box ${fmt(w)} m (x) by ${fmt(d)} m (y) by ${fmt(h)} m tall, one corner at the origin. @top is its top face, @front its front (south, y = 0) face and @side its east (x = ${fmt(w)}) face. The model has these picture materials: ${mlist}.`;
  return { kind: "texbox", name, w, d, h, ms, setup, desc, trusted: true };
}
export const withNote = (fx, note, extraSetup = []) => ({ ...fx, kind: fx.kind + "+", setup: [...fx.setup, ...extraSetup], desc: fx.desc + " " + note });
export const colorOf = (r) => { const k = r.pick(["red", "blue", "green", "yellow", "orange", "purple", "pink", "brown", "dark green", "light blue", "dark red"]); return { k, rgb: COLORS[k][0] }; };

// ================================================================ r1: rooms
const insideOf = (x0, y0, x1, y1, t = 0.2) => [r4(x0 + t / 2), r4(y0 + t / 2), r4(x1 - t / 2), r4(y1 - t / 2)];
const roomRect = (from, to, name, extra = {}) => ({ cmd: "room_rect", from, to, ...(name ? { name } : {}), ...extra });
F("r1", "new", 170, "easy", (r) => {
  const unit = unitOf(r), W = dimTxt(r, unit, 2.5, 9), D = dimTxt(r, unit, 2.5, 8);
  const named = r.chance(0.55), name = named ? r.pick(ROOMNAMES) : null;
  const at = r.chance(0.3);
  const x = at ? r.step(-6, 12, 1) : 0, y = at ? r.step(-6, 12, 1) : 0;
  const size = bySize(r, unit, W, D);
  const nm = named ? r.pick([` called the ${name}`, ` named ${name}`, ` for the ${name}`, `, the ${name}`]) : "";
  const wh = r.chance(0.2);
  const t = wh && r.chance(0.5) ? r4(r.pick([0.1, 0.15, 0.25, 0.3])) : null, hgt = wh ? r.pick([2.4, 2.5, 3, 3.5]) : null;
  const ex = wh ? (t && hgt ? ` with ${metric(r, t)} thick walls, ${metric(r, hgt)} high` : hgt ? `, walls ${metric(r, hgt)} high` : "") : "";
  const pos = at ? r.pick([` with its corner at x ${fmt(x)}, y ${fmt(y)}`, ` starting at (${fmt(x)}, ${fmt(y)})`, ` from x ${fmt(x)}, y ${fmt(y)}`]) : "";
  const req = r.pick([`make a ${size} room${nm}${pos}${ex}`, `draw a room ${size}${nm}${pos}${ex}`, `room mode: a ${size} room${nm}${pos}${ex}`, `add a ${size} room${nm}${pos}${ex}`, `I need a ${size} room${nm}${pos}${ex}`, `lay out a room, ${W.t} wide and ${D.t} deep${nm}${pos}${ex}`, `a room ${size}${nm}${pos}${ex}`]);
  const extra = {}; if (t) extra.thickness = t; if (hgt && wh) extra.height = hgt;
  const w = W.v, d = D.v;
  const ins = insideOf(x, y, r4(x + w), r4(y + d), t || 0.2);
  const exp = [{ path: "rooms", op: "len", value: 1 }, ...(named ? [{ path: "rooms", find: { name }, get: "inside", op: "approx", value: ins, tol: 0.03 }] : [{ path: "rooms.0.inside", op: "approx", value: ins, tol: 0.03 }]), ...(t ? [{ path: "rooms.0.thickness", op: "approx", value: t }] : [])];
  return { request: req, commands: [roomRect([x, y, 0], [r4(x + w), r4(y + d), 0], name, extra)], check: { probes: [{ cmd: { cmd: "rooms" }, expect: exp }], ...(hgt && wh ? { bbox: { size: [null, null, hgt], tol: 0.06 } } : {}) } };
});

F("r1", "next", 150, "medium", (r) => {
  const fx = fxRoomM(r);
  const side = r.pick(Object.keys(SIDES));
  const n2 = r.pick(ROOMNAMES.filter((n) => n !== fx.name));
  const unit = fx.unit;
  const A = dimTxt(r, unit, 2, 6); // extent away from the room
  const alongMax = side === "east" || side === "west" ? fx.d : fx.w;
  const [lo, hi] = dimRange(unit, 2, Math.min(alongMax, 6));
  let Bv = r.step(Math.min(lo, hi), hi, dimStep(unit)); const B = { u: Bv, ...L(r, unit, Bv) };
  let from, to;
  if (side === "east") { from = [fx.w, 0]; to = [r4(fx.w + A.v), B.v]; }
  else if (side === "west") { from = [r4(-A.v), 0]; to = [0, B.v]; }
  else if (side === "north") { from = [0, fx.d]; to = [B.v, r4(fx.d + A.v)]; }
  else { from = [0, r4(-A.v)]; to = [B.v, 0]; }
  const size = side === "east" || side === "west" ? bySize(r, unit, A, B) : bySize(r, unit, B, A);
  const SW = { east: "on the east side", west: "on the west side", north: "to the north", south: "to the south" }[side];
  const req = r.pick([
    `add a ${size} room named ${n2} ${SW} of the ${fx.name}, sharing a wall`, `put a ${size} ${n2} next to the ${fx.name}, ${SW}`, `next to the ${fx.name}, ${SW}, draw a ${size} room called ${n2}`,
    `${n2}: ${size}, built against the ${side} wall of the ${fx.name} and lined up with its ${side === "east" || side === "west" ? "south" : "west"} side`, `a new room ${SW} of the ${fx.name}, ${size}, named ${n2}, sharing the wall`,
  ]);
  return { fx, request: req, commands: [roomRect([...from, 0], [...to, 0], n2)], check: { probes: [{ cmd: { cmd: "rooms" }, expect: [{ path: "rooms", op: "len", value: 2 }, { path: "rooms", find: { name: n2 }, get: "inside", op: "approx", value: insideOf(Math.min(from[0], to[0]), Math.min(from[1], to[1]), Math.max(from[0], to[0]), Math.max(from[1], to[1])), tol: 0.03 }] }] } };
});

// inside area of an orthogonal outline from its centerline area A and perimeter P (inside = A - P t/2 + t^2)
const insideArea = (A, P, t = 0.2) => A - (P * t) / 2 + t * t;
F("r1", "combine", 90, "hard", (r) => {
  const fx = fxRoomM(r);
  const side = r.pick(["east", "west", "north", "south"]);
  const horiz = side === "east" || side === "west";
  const along = horiz ? fx.d : fx.w;
  const unit = fx.unit;
  const E = dimTxt(r, unit, 1.5, 4);
  const [lo, hi] = dimRange(unit, 1.5, Math.max(1.6, along - 1));
  const spanV = r.step(Math.min(lo, hi), Math.max(Math.min(lo, hi), Math.min(hi, 4)), dimStep(unit));
  const S = { u: spanV, ...L(r, unit, spanV) };
  if (S.v > along - 1.2) return null;
  const startV = r4(Math.max(0.5, Math.floor((along - S.v) / 2 / 0.25) * 0.25));
  const s0 = startV, s1 = r4(s0 + S.v);
  let from, to;
  if (side === "east") { from = [fx.w, s0]; to = [r4(fx.w + E.v), s1]; }
  else if (side === "west") { from = [r4(-E.v), s0]; to = [0, s1]; }
  else if (side === "north") { from = [s0, fx.d]; to = [s1, r4(fx.d + E.v)]; }
  else { from = [s0, r4(-E.v)]; to = [s1, 0]; }
  // the box must overlap the room, so it starts a little inside it
  const ov = 0.5;
  if (side === "east") from[0] = r4(fx.w - ov); else if (side === "west") to[0] = ov; else if (side === "north") from[1] = r4(fx.d - ov); else to[1] = ov;
  const A = fx.w * fx.d + E.v * S.v, P = 2 * (fx.w + fx.d) + 2 * E.v;
  const req = r.pick([
    `extend the ${fx.name} with a bump-out on the ${side} side, ${E.t} deep and ${S.t} wide, ${fmt(s0)} m along that wall from the ${horiz ? "south" : "west"} corner, as part of the same room`,
    `make the ${fx.name} bigger: add an alcove ${E.t} out from the ${side} wall and ${S.t} wide, starting ${fmt(s0)} m from the ${horiz ? "south" : "west"} end, merged into the room`,
    `combine a ${E.t} by ${S.t} box into the ${fx.name} on its ${side} side, ${fmt(s0)} m from the ${horiz ? "south" : "west"} end, so it is one room`,
  ]);
  return { fx, request: req, commands: [roomRect([...from, 0], [...to, 0], null, { mode: "combine" })], check: { probes: [{ cmd: { cmd: "rooms" }, expect: [{ path: "rooms", op: "len", value: 1 }, { path: "rooms", find: { name: fx.name }, get: "area", op: "approx", value: r4(insideArea(A, P)), tol: 0.05 }] }] } };
});

F("r1", "subtract", 70, "hard", (r) => {
  const fx = fxRoomM(r);
  const unit = fx.unit;
  const a = dimTxt(r, unit, 1.5, Math.min(fx.w - 1.5, 4)), b = dimTxt(r, unit, 1.5, Math.min(fx.d - 1.5, 4));
  if (a.v >= fx.w - 1 || b.v >= fx.d - 1) return null;
  const corner = r.pick(["north-east", "north-west", "south-east", "south-west"]);
  const nx = corner.endsWith("east"), ny = corner.startsWith("north");
  const x0 = nx ? r4(fx.w - a.v) : 0, x1 = nx ? fx.w : a.v, y0 = ny ? r4(fx.d - b.v) : 0, y1 = ny ? fx.d : b.v;
  // reach a little past the corner so the cut clears the walls
  const bx0 = nx ? x0 : -1, bx1 = nx ? fx.w + 1 : x1, by0 = ny ? y0 : -1, by1 = ny ? fx.d + 1 : y1;
  const A = fx.w * fx.d - a.v * b.v, P = 2 * (fx.w + fx.d);
  const req = r.pick([
    `cut a ${bySize(r, unit, a, b)} notch out of the ${corner} corner of the ${fx.name}`, `carve the ${corner} corner out of the ${fx.name}: ${a.t} along x, ${b.t} along y`,
    `take a ${a.t} by ${b.t} bite out of the ${fx.name}'s ${corner} corner so it is L-shaped`, `subtract a ${bySize(r, unit, a, b)} box from the ${corner} corner of the ${fx.name}`,
  ]);
  return { fx, request: req, commands: [roomRect([bx0, by0, 0], [bx1, by1, 0], null, { mode: "subtract" })], check: { probes: [{ cmd: { cmd: "rooms" }, expect: [{ path: "rooms", op: "len", value: 1 }, { path: "rooms", find: { name: fx.name }, get: "area", op: "approx", value: r4(insideArea(A, P)), tol: 0.05 }] }] } };
});

F("r1", "two", 60, "hard", (r) => {
  const unit = unitOf(r);
  const [n1, n2] = r.shuffle(ROOMNAMES).slice(0, 2);
  const W1 = dimTxt(r, unit, 3, 7), D1 = dimTxt(r, unit, 3, 6), W2 = dimTxt(r, unit, 2, 5);
  const [lo, hi] = dimRange(unit, 2, D1.v);
  const D2v = r.step(Math.min(lo, hi), hi, dimStep(unit)); const D2 = { u: D2v, ...L(r, unit, D2v) };
  const req = r.pick([`a ${bySize(r, unit, W1, D1)} ${n1} with a ${bySize(r, unit, W2, D2)} ${n2} on its east side, sharing a wall`, `two rooms side by side: ${n1} ${bySize(r, unit, W1, D1)} and, east of it, ${n2} ${bySize(r, unit, W2, D2)}`, `${n1} is ${bySize(r, unit, W1, D1)}; add ${n2}, ${bySize(r, unit, W2, D2)}, against its east wall`]);
  const x1 = W1.v;
  return { request: req, commands: [roomRect([0, 0, 0], [W1.v, D1.v, 0], n1), roomRect([x1, 0, 0], [r4(x1 + W2.v), D2.v, 0], n2)], check: { probes: [{ cmd: { cmd: "rooms" }, expect: [{ path: "rooms", op: "len", value: 2 }, { path: "rooms", find: { name: n1 }, get: "inside", op: "approx", value: insideOf(0, 0, W1.v, D1.v), tol: 0.03 }, { path: "rooms", find: { name: n2 }, get: "inside", op: "approx", value: insideOf(x1, 0, r4(x1 + W2.v), D2.v), tol: 0.03 }] }] } };
});

F("r1", "pull", 190, "medium", (r) => {
  const fx = fxRoomM(r);
  const side = r.pick(Object.keys(SIDES));
  const horiz = side === "east" || side === "west";
  const dim = horiz ? fx.w : fx.d;
  const inward = r.chance(0.35);
  const unit = fx.unit;
  const [lo, hi] = dimRange(unit, 0.5, inward ? Math.max(0.6, dim - 1.5) : 4);
  const amt = r.step(Math.min(lo, hi), Math.max(Math.min(lo, hi), unit === "ft" ? Math.min(hi, 12) : Math.min(hi, 4)), dimStep(unit) / (unit === "ft" ? 1 : 1));
  const A = { u: amt, ...L(r, unit, amt) };
  if (inward && A.v > dim - 1.5) return null;
  const by = inward ? -A.v : A.v;
  const k = { east: [0, 0, A.v * (inward ? -1 : 1), 0], west: [A.v * (inward ? 1 : -1), 0, 0, 0], north: [0, 0, 0, A.v * (inward ? -1 : 1)], south: [0, A.v * (inward ? 1 : -1), 0, 0] }[side];
  // after: centerline rect [x0,y0,x1,y1]
  const rect = [r4(k[0]), r4(k[1]), r4(fx.w + k[2]), r4(fx.d + k[3])];
  const inside = [r4(rect[0] + 0.1), r4(rect[1] + 0.1), r4(rect[2] - 0.1), r4(rect[3] - 0.1)];
  const nm = r.pick(["", ` of the ${fx.name}`, ` of the ${fx.name}`]);
  const req = inward
    ? r.pick([`pull the ${side} wall${nm} in by ${A.t}`, `bring the ${side} wall${nm} ${A.t} closer in`, `move the ${side} wall${nm} inward ${A.t}`, `shrink the ${fx.name} by ${A.t} by pulling its ${side} wall in`, `push the ${side} wall${nm} back ${A.t} into the room`])
    : r.pick([`push the ${side} wall${nm} out ${A.t}`, `pull the ${side} wall${nm} outward by ${A.t}`, `move the ${side} wall${nm} ${A.t} further out`, `make the ${fx.name} ${A.t} ${horiz ? "wider" : "deeper"} by pulling the ${side} wall out`, `drag the ${side} wall${nm} out by ${A.t}`, `extend the ${side} wall${nm} ${A.t} outward`]);
  return { fx, request: req, commands: [{ cmd: "wall_pull", face: `@${side}_out`, by }], check: { probes: [{ cmd: { cmd: "rooms" }, expect: [{ path: "rooms", op: "len", value: 1 }, { path: "rooms", find: { name: fx.name }, get: "inside", op: "approx", value: inside, tol: 0.03 }] }] } };
});

F("r1", "wallinfo", 30, "easy", (r) => {
  const fx = fxRoomM(r);
  const side = r.pick(Object.keys(SIDES));
  const req = r.pick([`what would move if I pulled the ${side} wall?`, `preview pulling the ${side} wall of the ${fx.name}`, `what does the ${side} wall drag along with it?`, `if I push the ${side} wall out, what else moves?`, `show me what the ${side} wall move would affect`]);
  return { fx, request: req, commands: [{ cmd: "wall_info", face: `@${side}_out` }], check: { readonly: true } };
});

F("r1", "preview", 50, "medium", (r) => {
  const fx = fxRoomM(r);
  const unit = fx.unit, A = dimTxt(r, unit, 2, 5), B = dimTxt(r, unit, 2, 5);
  const side = r.pick(["east", "north"]);
  const from = side === "east" ? [fx.w, 0] : [0, fx.d], to = side === "east" ? [r4(fx.w + A.v), B.v] : [B.v, r4(fx.d + A.v)];
  const size = side === "east" ? bySize(r, unit, A, B) : bySize(r, unit, B, A);
  const req = r.pick([`would a ${size} room fit ${side === "east" ? "east" : "north"} of the ${fx.name}?`, `can I add a ${size} room on the ${side} side of the ${fx.name}? just check, don't build it`, `preview a ${size} room against the ${side} wall of the ${fx.name}`, `what would happen if I dragged out a ${size} room next to the ${fx.name} on the ${side}?`]);
  return { fx, request: req, commands: [{ cmd: "room_preview", from: [...from, 0], to: [...to, 0] }], check: { readonly: true } };
});

F("r1", "list", 45, "easy", (r) => {
  const fx = fxTwoRooms(r);
  const Q = [
    ["list the rooms", [{ cmd: "rooms" }]], ["how many rooms are there?", [{ cmd: "rooms" }]], ["which rooms do I have and how big are they?", [{ cmd: "rooms" }]], ["what are the areas of the rooms?", [{ cmd: "rooms" }]],
    [`how big is the ${fx.n2}?`, [{ cmd: "room_info", name: fx.n2 }]], [`what's the area of the ${fx.n1}?`, [{ cmd: "room_info", name: fx.n1 }]], [`square footage of the ${fx.n1}`, [{ cmd: "room_info", name: fx.n1 }]], ["show me every room", [{ cmd: "rooms" }]],
  ];
  const [q, c] = r.pick(Q);
  return { fx, request: q, commands: c, check: { readonly: true } };
});

// ================================================================ t1: picture materials
export const phraseMat = (r, m) => r.pick([m, m, `the ${m} texture`, `the ${m} material`, `${m} texture`]);
F("t1", "paint", 190, "easy", (r) => {
  const fx = fxBox(r);
  const m = r.pick(fx.ms), pm = phraseMat(r, m);
  const target = r.pick(["all", "all", "top", "front", "side"]);
  const n = fx.name;
  let ids, where, req;
  if (target === "all") { ids = [`@${n}`]; where = {}; req = r.pick([`put ${pm} on the ${n}`, `texture the ${n} with ${pm}`, `cover the whole ${n} in ${m}`, `use ${pm} for the ${n}`, `paint the ${n} with ${pm}`, `apply ${pm} to the ${n}`]); }
  else if (target === "top") { ids = ["@top"]; where = { normal: [0, 0, 1], z: [fx.h - 0.01, fx.h + 0.01] }; req = r.pick([`put ${pm} on the top`, `texture the roof of the ${n} with ${pm}`, `apply ${pm} to the top face`, `the top of the ${n} should be ${m}`]); }
  else if (target === "front") { ids = ["@front"]; where = { normal: [0, -1, 0] }; req = r.pick([`cover the front wall in ${pm}`, `put ${pm} on the front of the ${n}`, `texture the front face with ${pm}`, `make the front ${m}`]); }
  else { ids = ["@side"]; where = { normal: [1, 0, 0] }; req = r.pick([`put ${pm} on the east wall`, `texture the east side of the ${n} with ${pm}`, `apply ${pm} to the east face`, `make the east wall ${m}`]); }
  return { fx, request: req, commands: [{ cmd: "paint", ids, material: m }], check: { material: [{ name: m, where, all: true }] } };
});

F("t1", "two", 70, "medium", (r) => {
  const fx = fxBox(r, { nmat: r.int(3, 4) });
  const [m1, m2] = r.shuffle(fx.ms).slice(0, 2);
  const req = r.pick([`${m1} on the front, ${m2} on the top`, `texture the front with ${m1} and the top with ${m2}`, `front wall ${m1}, roof ${m2}`, `use ${m2} for the top and ${m1} for the front face`]);
  return { fx, request: req, commands: [{ cmd: "paint", ids: ["@front"], material: m1 }, { cmd: "paint", ids: ["@top"], material: m2 }], check: { material: [{ name: m1, where: { normal: [0, -1, 0] }, all: true }, { name: m2, where: { normal: [0, 0, 1], z: [fx.h - 0.01, fx.h + 0.01] }, all: true }] } };
});

F("t1", "swap", 90, "hard", (r) => {
  const fx0 = fxBox(r, { nmat: 3 });
  const [mA, mB, mC] = fx0.ms;
  const n = fx0.name;
  const fx = withNote(fx0, `The ${n} is painted ${mA} everywhere except its top, which is ${mB}.`, [{ cmd: "paint", ids: [`@${n}`], material: mA }, { cmd: "paint", ids: ["@top"], material: mB }]);
  const scope = r.pick(["all", "connected", "object", "all"]);
  const req = r.pick([`change every ${mA} face of the ${n} to ${mC}`, `swap the ${mA} for ${mC} everywhere on the ${n}`, `replace all the ${mA} with ${mC}`, `repaint the ${mA} faces ${mC}, leave the ${mB}`, `anything that is ${mA} on the ${n} should become ${mC}`]);
  return { fx, request: req, commands: [{ cmd: "paint", ids: ["@front"], material: mC, scope }], check: { material: [{ name: mB, where: { normal: [0, 0, 1], z: [fx.h - 0.01, fx.h + 0.01] }, all: true }, { name: mA, none: true }, { name: mC, min: 5 }] } };
});

F("t1", "through", 70, "medium", (r) => {
  const fx = fxBox(r);
  const m = r.pick(fx.ms);
  const req = r.pick([`lay the ${m} across the front and east walls as one continuous sheet`, `wrap ${m} around the corner from the front to the east side without a seam`, `texture the front and the east wall with ${m}, continuous across the corner`, `one sheet of ${m} over the front and side faces, no break at the corner`]);
  return { fx, request: req, commands: [{ cmd: "paint", ids: ["@front", "@side"], material: m, through: true }], check: { material: [{ name: m, where: { normal: [0, -1, 0] }, all: true }, { name: m, where: { normal: [1, 0, 0] }, all: true }] } };
});

const AXES = { "from the front": [0, 1, 0], "from above": [0, 0, -1], "from the east": [-1, 0, 0], "from the west": [1, 0, 0], "from the back": [0, -1, 0] };
F("t1", "project", 190, "medium", (r) => {
  const fx = fxBox(r);
  const m = r.pick(fx.ms), n = fx.name;
  const mode = r.pick(["planar", "box", "cylinder", "sphere"]);
  const scaleOn = r.chance(0.35), rotOn = r.chance(0.25);
  const scale = scaleOn ? r.pick([0.5, 1.5, 2, 3, 0.25]) : null, rot = rotOn ? r.pick([15, 30, 45, 90]) : null;
  const wholeGroup = r.chance(0.55);
  const [axTxt, axis] = mode === "planar" && r.chance(0.6) ? r.pick(Object.entries(AXES)) : [null, null];
  const MW = { planar: ["projected flat", "planar projection", "a planar projection"], box: ["box mapped", "box projection", "a box projection"], cylinder: ["wrapped around like a cylinder", "cylindrical projection", "a cylinder projection"], sphere: ["mapped like a sphere", "spherical projection", "a sphere projection"] }[mode];
  const sTxt = scaleOn ? r.pick([`, scaled ${scale}x`, ` at ${scale} times the size`, `, scale ${scale}`]) : "", rTxt = rotOn ? r.pick([`, rotated ${rot} degrees`, ` turned ${rot}°`]) : "";
  const aTxt = axTxt ? ` ${axTxt}` : "";
  const target = wholeGroup ? `the ${n}` : r.pick(["the front wall", "the front face"]);
  const req = r.pick([`project ${m} onto ${target} with ${MW[1]}${aTxt}${sTxt}${rTxt}`, `use ${MW[2]} of ${m} on ${target}${aTxt}${sTxt}${rTxt}`, `map the ${m} picture onto ${target}, ${MW[0]}${aTxt}${sTxt}${rTxt}`, `${m} on ${target} as ${MW[2]}${aTxt}${sTxt}${rTxt}`]);
  const cmd = { cmd: "texture_project", ...(wholeGroup ? { entity: `@${n}` } : { faces: ["@front"] }), mode, material: m, ...(axis ? { axis } : {}), ...(scaleOn ? { scale } : {}), ...(rotOn ? { rotation: rot } : {}) };
  return { fx, request: req, commands: [cmd], check: wholeGroup ? { material: [{ name: m, min: 6 }] } : { material: [{ name: m, where: { normal: [0, -1, 0] }, all: true }] , probes: [{ cmd: { cmd: "texture_uv", faces: ["@front"] }, expect: [{ path: "uv", op: "all_nonnull" }] }] } };
});

F("t1", "unproject", 35, "easy", (r) => {
  const fx0 = fxBox(r);
  const m = r.pick(fx0.ms), n = fx0.name;
  const fx = withNote(fx0, `The ${n} wears ${m} with a box projection.`, [{ cmd: "texture_project", entity: `@${n}`, mode: "box", material: m }]);
  const req = r.pick([`remove the projection from the ${n}`, `clear the texture mapping on the ${n}`, `turn the projection off on the ${n}`, `go back to the material's own placement on the ${n}`]);
  return { fx, request: req, commands: [{ cmd: "texture_project", entity: `@${n}`, mode: "clear" }], check: { probes: [{ cmd: { cmd: "texture_uv", faces: ["@front", "@side", "@top"] }, expect: [{ path: "uv", op: "all_null" }] }] } };
});

const PIC = (r, unit) => (unit === "in" ? r.int(1, 12) : unit === "cm" ? r.pick([2, 5, 10, 15, 20, 25, 30, 40, 50]) : r.pick([0.1, 0.2, 0.25, 0.3, 0.5, 1]));
F("t1", "position", 190, "medium", (r) => {
  const fx0 = fxBox(r);
  const m = r.pick(fx0.ms), n = fx0.name;
  const fx = withNote(fx0, `The front face wears ${m}.`, [{ cmd: "paint", ids: ["@front"], material: m }]);
  const mode = r.pick(["offset", "offset", "offset", "rotate", "scale", "reset", "skew", "both"]);
  const unit = r.pick(["cm", "cm", "m", "in"]);
  const dirs = { right: [1, 0], left: [-1, 0], up: [0, 1], down: [0, -1] };
  const mk = () => { const [dn, dv] = r.pick(Object.entries(dirs)); const a = PIC(r, unit); const meters = unit === "in" ? a * 0.0254 : unit === "cm" ? a / 100 : a; const txt = unit === "in" ? `${a} ${a === 1 ? "inch" : "inches"}` : unit === "cm" ? `${a} cm` : `${fmt(a)} ${r.pick(["m", "meters"])}`; return { dn, dv, m: r4(meters), txt }; };
  let tr = null, req, probes = [], reset = false;
  const pre = { cmd: { cmd: "texture_frame", face: "@front" }, before: true };
  if (mode === "offset" || mode === "both") {
    const a = mk(); const hv = Math.abs(a.dv[0]) > 0; // horizontal or vertical
    let b = null; if (mode === "both") { do b = mk(); while ((Math.abs(b.dv[0]) > 0) === hv); }
    const du = a.dv[0] * a.m + (b ? b.dv[0] * b.m : 0), dvv = a.dv[1] * a.m + (b ? b.dv[1] * b.m : 0);
    tr = { offset: [r4(du), r4(dvv)] };
    req = b ? r.pick([`slide the ${m} on the front ${a.txt} ${a.dn} and ${b.txt} ${b.dn}`, `shift the front texture ${a.txt} to the ${a.dn === "up" || a.dn === "down" ? a.dn : a.dn} and ${b.txt} ${b.dn}`]) : r.pick([`move the ${m} on the front face ${a.txt} to the ${a.dn === "up" || a.dn === "down" ? a.dn : a.dn}`, `shift the front texture ${a.txt} ${a.dn}`, `nudge the ${m} ${a.txt} ${a.dn} on the front wall`, `slide the picture on the front ${a.dn} by ${a.txt}`]);
    req = req.replace("to the up", "up").replace("to the down", "down");
    probes = [{ ...pre, expect: [{ path: "picture", op: "delta", value: [r4(du), r4(dvv)], tol: 0.005 }, { path: "own", op: "eq", value: true }] }];
  } else if (mode === "rotate") { const a = r.pick([15, 30, 45, 90, 180, -45, -90]); tr = { rotation: a }; req = r.pick([`rotate the ${m} on the front face ${Math.abs(a)} degrees${a < 0 ? " the other way" : ""}`, `turn the front texture by ${a} degrees`, `spin the ${m} ${Math.abs(a)}° on the front wall${a < 0 ? " clockwise" : ""}`]); probes = [{ ...pre, expect: [{ path: "own", op: "eq", value: true }] }]; }
  else if (mode === "scale") { const s = r.pick([0.5, 2, 3, 1.5, 0.25]); tr = { scale: s }; req = r.pick([`scale the ${m} on the front face by ${s}`, `make the front texture ${s} times as big`, `resize the picture on the front wall to ${s}x`]); probes = [{ ...pre, expect: [{ path: "own", op: "eq", value: true }] }]; }
  else if (mode === "skew") { const s = r.pick([10, 15, 20, 30]); tr = { skew: s }; req = r.pick([`skew the ${m} on the front face by ${s} degrees`, `shear the front texture ${s}°`]); probes = [{ ...pre, expect: [{ path: "own", op: "eq", value: true }] }]; }
  else { reset = true; req = r.pick([`reset the ${m} on the front face`, `put the front texture back to its default placement`, `undo the positioning of the ${m} on the front, reset it`]); probes = [{ cmd: { cmd: "texture_frame", face: "@front" }, expect: [{ path: "own", op: "eq", value: false }] }]; }
  let fx2 = fx;
  if (reset) fx2 = withNote(fx, `The picture on the front face was moved by hand.`, [{ cmd: "texture_position", face: "@front", transform: { offset: [0.3, 0.1] } }]);
  return { fx: fx2, request: req, commands: [{ cmd: "texture_position", face: "@front", ...(reset ? { reset: true } : { transform: tr }) }], check: { material: [{ name: m, where: { normal: [0, -1, 0] }, all: true }], probes } };
});

F("t1", "question", 30, "easy", (r) => {
  const fx0 = fxBox(r);
  const m = r.pick(fx0.ms);
  const fx = withNote(fx0, `The front face wears ${m} with a box projection.`, [{ cmd: "texture_project", faces: ["@front"], mode: "box", material: m }]);
  const Q = [["what are the texture coordinates of the front face?", [{ cmd: "texture_uv", faces: ["@front"] }]], ["show me the UVs on the front wall", [{ cmd: "texture_uv", faces: ["@front"] }]], ["where are the corners of the picture on the front face?", [{ cmd: "texture_frame", face: "@front" }]], ["how big is one tile of the picture on the front?", [{ cmd: "texture_frame", face: "@front" }]]];
  const [q, c] = r.pick(Q);
  return { fx, request: q, commands: c, check: { readonly: true } };
});

// ================================================================ t2: vertex paint
export const tint = (rgb, s) => [...rgb.map((c) => r4(1 - s * (1 - c))), 1];
F("t2", "fill", 150, "easy", (r) => {
  const fx = fxBox(r, { nmat: 2 });
  const n = fx.name, { k, rgb } = colorOf(r);
  const target = r.pick(["all", "top", "front", "side"]);
  const strength = r.chance(0.3) ? r.pick([0.25, 0.5, 0.75]) : null;
  const sTxt = strength ? r.pick([` at ${strength * 100}% strength`, `, ${strength * 100} percent`, ` with strength ${strength}`]) : "";
  let sel, req;
  if (target === "all") { sel = { entity: `@${n}` }; req = r.pick([`vertex paint the whole ${n} ${k}${sTxt}`, `tint the ${n} ${k} with vertex colors${sTxt}`, `fill the ${n} with ${k} vertex color${sTxt}`, `give the ${n} a ${k} vertex color wash${sTxt}`]); }
  else if (target === "top") { sel = { faces: ["@top"] }; req = r.pick([`vertex paint the top ${k}${sTxt}`, `tint the roof of the ${n} ${k} using vertex colors${sTxt}`, `vertex color the top face ${k}${sTxt}`]); }
  else if (target === "front") { sel = { faces: ["@front"] }; req = r.pick([`vertex paint the front wall ${k}${sTxt}`, `tint the front face ${k} with vertex paint${sTxt}`, `fill the front face with ${k} vertex color${sTxt}`]); }
  else { sel = { faces: ["@side"] }; req = r.pick([`vertex paint the east wall ${k}${sTxt}`, `tint the east face ${k} with vertex paint${sTxt}`, `vertex color the east side ${k}${sTxt}`]); }
  const col = rgb.slice(0, 3);
  const cmd = { cmd: "vertex_paint", ...sel, color: col, ...(strength ? { strength } : {}) };
  const probeFaces = sel.entity ? ["@top", "@front", "@side"] : sel.faces;
  return { fx, request: req, commands: [cmd], check: { probes: [{ cmd: { cmd: "vertex_colors", faces: probeFaces }, expect: [{ path: "colors", op: "corners_eq", value: tint(col, strength ?? 1), tol: 0.02 }] }] } };
});

F("t2", "brush", 120, "hard", (r) => {
  const fx = fxBox(r, { nmat: 2 });
  const n = fx.name, { k, rgb } = colorOf(r);
  const rad = r.pick([0.2, 0.3, 0.5, 0.75, 1]);
  const radT = rad >= 1 ? "1 m" : rad < 1 ? `${rad * 100} cm` : `${rad} m`;
  const onTop = r.chance(0.6);
  const cx = r.pick([0, fx.w]), cy = r.pick([0, fx.d]);
  const pt = onTop ? [cx, cy, fx.h] : [cx, 0, fx.h];
  const where = onTop ? `the ${cy === 0 ? "south" : "north"}-${cx === 0 ? "west" : "east"} corner of the top` : `the top ${cx === 0 ? "left" : "right"} corner of the front wall`;
  const fall = r.pick([null, null, "linear", "hard", "smooth"]);
  const fTxt = fall ? r.pick([`, ${fall} falloff`, ` with a ${fall} edge`]) : "";
  const req = r.pick([`brush a ${k} vertex paint spot at ${where}, radius ${radT}${fTxt}`, `paint a ${radT} ${k} dab with vertex color at ${where}${fTxt}`, `vertex paint ${k} around ${where} with a ${radT} brush${fTxt}`, `one vertex paint stroke in ${k} at point (${fmt(pt[0])}, ${fmt(pt[1])}, ${fmt(pt[2])}), radius ${radT}${fTxt}`]);
  const faces = onTop ? ["@top"] : ["@front"];
  const cmd = { cmd: "vertex_paint", faces, color: rgb.slice(0, 3), points: [pt], radius: rad, ...(fall ? { falloff: fall } : {}) };
  return { fx, request: req, commands: [cmd], check: { probes: [{ cmd: { cmd: "vertex_colors", faces }, expect: [{ path: "colors", op: "tinted_min", value: 1 }] }] } };
});

F("t2", "clear", 45, "easy", (r) => {
  const fx0 = fxBox(r, { nmat: 2 });
  const n = fx0.name, { k, rgb } = colorOf(r);
  const fx = withNote(fx0, `The whole ${n} has a ${k} vertex color wash.`, [{ cmd: "vertex_paint", entity: `@${n}`, color: rgb.slice(0, 3) }]);
  const target = r.pick(["all", "top"]);
  const sel = target === "all" ? { entity: `@${n}` } : { faces: ["@top"] };
  const req = target === "all" ? r.pick([`remove all the vertex colors from the ${n}`, `clear the vertex paint on the ${n}`, `wipe the vertex color wash off the ${n}`, `strip the vertex colors`]) : r.pick([`clear the vertex paint from the top`, `take the vertex colors off the roof`, `remove vertex paint from the top face`]);
  return { fx, request: req, commands: [{ cmd: "vertex_paint_clear", ...sel }], check: { probes: [{ cmd: { cmd: "vertex_colors", faces: target === "all" ? ["@top", "@front", "@side"] : ["@top"] }, expect: [{ path: "colors", op: "all_null" }] }] } };
});

F("t2", "erase", 25, "medium", (r) => {
  const fx0 = fxBox(r, { nmat: 2 });
  const { k, rgb } = colorOf(r);
  const fx = withNote(fx0, `The front face has a ${k} vertex color wash.`, [{ cmd: "vertex_paint", faces: ["@front"], color: rgb.slice(0, 3) }]);
  const req = r.pick([`erase the vertex paint on the front face with the eraser brush`, `brush the ${k} vertex color off the front wall back to white`, `use the vertex paint eraser on the whole front face`]);
  return { fx, request: req, commands: [{ cmd: "vertex_paint", faces: ["@front"], color: rgb.slice(0, 3), erase: true }], check: { probes: [{ cmd: { cmd: "vertex_colors", faces: ["@front"] }, expect: [{ path: "colors", op: "all_null" }] }] } };
});

F("t2", "question", 25, "easy", (r) => {
  const fx0 = fxBox(r, { nmat: 2 });
  const { k, rgb } = colorOf(r);
  const fx = withNote(fx0, `The top face has a ${k} vertex color wash.`, [{ cmd: "vertex_paint", faces: ["@top"], color: rgb.slice(0, 3) }]);
  const Q = r.pick([["what vertex colors does the top face have?", ["@top"]], ["show me the vertex paint on the roof", ["@top"]], ["is the front face vertex painted?", ["@front"]], ["what are the vertex colors on the east wall?", ["@side"]]]);
  return { fx, request: Q[0], commands: [{ cmd: "vertex_colors", faces: Q[1] }], check: { readonly: true } };
});

// ================================================================ t3: UV
export const unwrapped = (fx0, extraSeams = null) => withNote(fx0, `The ${fx0.name} has been UV-unwrapped (it has UVs).`, [{ cmd: "uv_unwrap", entity: `@${fx0.name}` }]);
export const UVOK = (n) => [{ cmd: { cmd: "uv_info", entity: `@${n}` }, expect: [{ path: "without", op: "len", value: 0 }, { path: "faces.*.uv", op: "within01" }] }];
F("t3", "unwrap", 140, "medium", (r) => {
  const fx = fxBox(r, { nmat: 2 }), n = fx.name;
  const method = r.pick([null, null, "conformal", "angle", "planar_islands"]), auto = r.chance(0.2) ? r.pick([30, 45, 60]) : null, margin = r.chance(0.2) ? r.pick([0.01, 0.02, 0.05]) : null;
  const mTxt = method === "conformal" ? " with the conformal method" : method === "angle" ? " using the angle based method" : method === "planar_islands" ? " into planar islands" : "";
  const aTxt = auto ? `, cutting seams at every edge sharper than ${auto} degrees` : "", gTxt = margin ? `, ${margin} margin between islands` : "";
  const req = r.pick([`unwrap the ${n}${mTxt}${aTxt}${gTxt}`, `UV unwrap the ${n}${mTxt}${aTxt}${gTxt}`, `give the ${n} UVs${mTxt}${aTxt}${gTxt}`, `lay out the UVs for the ${n}${mTxt}${aTxt}${gTxt}`]);
  const cmd = { cmd: "uv_unwrap", entity: `@${n}`, ...(method ? { method } : {}), ...(auto ? { seams: "auto", angle: auto } : {}), ...(margin ? { margin } : {}) };
  return { fx, request: req, commands: [cmd], check: { probes: UVOK(n) } };
});

F("t3", "seam", 80, "medium", (r) => {
  const fx0 = fxBox(r, { nmat: 2 }), n = fx0.name;
  if (r.chance(0.7)) {
    const a = r.pick([20, 30, 45, 60, 75, 80]);
    const req = r.pick([`mark UV seams on every edge of the ${n} sharper than ${a} degrees`, `put seams on the hard edges of the ${n}, anything past ${a}°`, `auto seam the ${n} at ${a} degrees`, `seam all edges of the ${n} that turn more than ${a} degrees`]);
    return { fx: fx0, request: req, commands: [{ cmd: "uv_seam", entity: `@${n}`, auto: a }], check: { probes: [{ cmd: { cmd: "uv_info", entity: `@${n}` }, expect: [{ path: "seams", op: "len", value: 12 }] }] } };
  }
  const fx = withNote(fx0, `The ${n} has UV seams on all its edges.`, [{ cmd: "uv_seam", entity: `@${n}`, auto: 45 }]);
  const req = r.pick([`clear all the UV seams on the ${n}`, `remove the seams from the ${n}`, `unmark every UV seam on the ${n}`]);
  return { fx, request: req, commands: [{ cmd: "uv_seam", entity: `@${n}`, auto: 1, on: false }], check: { probes: [{ cmd: { cmd: "uv_info", entity: `@${n}` }, expect: [{ path: "seams", op: "len", value: 0 }] }] } };
});

F("t3", "pack", 40, "easy", (r) => {
  const fx0 = fxBox(r, { nmat: 2 }), n = fx0.name;
  // the UVs have been pushed out of the 0..1 sheet by hand, so only a repack brings them back
  const fx = withNote(fx0, `The ${n} has been UV-unwrapped, then its UVs were moved off the 0..1 sheet by hand.`, [{ cmd: "uv_unwrap", entity: `@${n}` }, { cmd: "uv_transform", faces: ["@front", "@side", "@top"], matrix: [1, 0, 0, 1, 1.5, 0.7] }]);
  const margin = r.chance(0.5) ? r.pick([0.01, 0.02, 0.05]) : null;
  const req = r.pick([`repack the UV islands of the ${n}${margin ? ` with a ${margin} margin` : ""}`, `pack the UVs of the ${n} as big as they fit${margin ? `, margin ${margin}` : ""}`, `re-pack the ${n}'s UV layout${margin ? ` leaving ${margin} between islands` : ""}`]);
  return { fx, request: req, commands: [{ cmd: "uv_pack", entity: `@${n}`, ...(margin ? { margin } : {}) }], check: { probes: UVOK(n) } };
});

F("t3", "lightmap", 70, "medium", (r) => {
  const fx0 = fxBox(r, { nmat: 2 }), n = fx0.name;
  if (r.chance(0.7)) {
    const margin = r.chance(0.3) ? r.pick([0.02, 0.03, 0.05]) : null;
    const req = r.pick([`make a lightmap UV set for the ${n}${margin ? ` with a ${margin} margin` : ""}`, `generate lightmap UVs for the ${n}${margin ? `, ${margin} margin` : ""}`, `add the second UV channel for baked lighting on the ${n}`, `unwrap the ${n} for a lightmap`]);
    return { fx: fx0, request: req, commands: [{ cmd: "uv_lightmap", entity: `@${n}`, ...(margin ? { margin } : {}) }], check: { probes: [{ cmd: { cmd: "uv_info", entity: `@${n}`, set: 2 }, expect: [{ path: "without", op: "len", value: 0 }, { path: "faces.*.uv", op: "within01" }] }] } };
  }
  const fx = withNote(fx0, `The ${n} has a lightmap UV set.`, [{ cmd: "uv_lightmap", entity: `@${n}` }]);
  const req = r.pick([`remove the lightmap UVs from the ${n}`, `clear the lightmap channel on the ${n}`, `delete the second UV set of the ${n}`]);
  return { fx, request: req, commands: [{ cmd: "uv_lightmap", entity: `@${n}`, clear: true }], check: { probes: [{ cmd: { cmd: "uv_info", entity: `@${n}`, set: 2 }, expect: [{ path: "faces", op: "len", value: 0 }] }] } };
});

F("t3", "shift", 70, "hard", (r) => {
  const fx = unwrapped(fxBox(r, { nmat: 2 })), n = fx.name;
  const du = r.pick([0, 0.05, 0.1, -0.05, -0.1, 0.02]), dv = r.pick([0, 0.05, 0.1, -0.05, 0.03]);
  if (!du && !dv) return null;
  const parts = [du && `${Math.abs(du)} ${du > 0 ? "right" : "left"}`, dv && `${Math.abs(dv)} ${dv > 0 ? "up" : "down"}`].filter(Boolean).join(" and ");
  const req = r.pick([`move the UVs of the front face ${parts}`, `shift the front face's UVs ${parts} in UV space`, `nudge the front wall UVs ${parts}`]);
  return { fx, request: req, commands: [{ cmd: "uv_transform", faces: ["@front"], matrix: [1, 0, 0, 1, du, dv] }], check: { probes: [{ cmd: { cmd: "uv_info", faces: ["@front"] }, before: true, expect: [{ path: "faces.*.uv", op: "delta", value: [du, dv], tol: 0.002 }] }] } };
});

F("t3", "question", 40, "easy", (r) => {
  const fx = r.chance(0.5) ? unwrapped(fxBox(r, { nmat: 2 })) : fxBox(r, { nmat: 2 }), n = fx.name;
  const Q = r.pick([[`does the ${n} have UVs?`, [{ cmd: "uv_info", entity: `@${n}` }]], [`show me the UV layout of the ${n}`, [{ cmd: "uv_info", entity: `@${n}` }]], [`which faces of the ${n} have no UVs?`, [{ cmd: "uv_info", entity: `@${n}` }]], [`are there seams on the ${n}?`, [{ cmd: "uv_info", entity: `@${n}` }]], [`what are the UVs of the front face?`, [{ cmd: "uv_info", faces: ["@front"] }]]]);
  return { fx, request: Q[0], commands: Q[1], check: { readonly: true } };
});

// ================================================================ t4: texture painting
F("t4", "new", 110, "medium", (r) => {
  const fx = fxBox(r, { nmat: 2 }), n = fx.name;
  const size = r.pick([64, 128, 256, 512, 1024, 2048]);
  const pname = r.pick(["mural", "graffiti", "decal", "paintjob", "scribble", "logo", "weathering", "sign"]);
  const whole = r.chance(0.45), base = r.chance(0.25) ? colorOf(r) : null;
  const target = whole ? `the ${n}` : r.pick(["the front wall", "the front face"]);
  const bTxt = base ? r.pick([` on a ${base.k} base`, `, starting ${base.k}`]) : "";
  const req = r.pick([`set up a ${size} pixel paint texture called ${pname} on ${target}${bTxt}`, `make a ${size}x${size} paintable texture named ${pname} for ${target}${bTxt}`, `I want to paint on ${target}: create a ${size} px texture, ${pname}${bTxt}`, `give ${target} a ${size} pixel ${pname} paint texture${bTxt}, unwrap it if needed`]);
  const cmd = { cmd: "texture_paint_new", ...(whole ? { entity: `@${n}` } : { faces: ["@front"] }), size, name: pname, unwrap: true, ...(base ? { base: base.rgb.slice(0, 3) } : {}) };
  return { fx, request: req, commands: [cmd], check: { material: [{ name: pname, ...(whole ? { min: 6 } : { where: { normal: [0, -1, 0] }, all: true }) }], probes: [{ cmd: { cmd: "texture_paint_status", ...(whole ? { entity: `@${n}` } : { faces: ["@front"] }) }, expect: [{ path: "paintable", op: "eq", value: true }] }] } };
});

F("t4", "stroke", 130, "hard", (r) => {
  const pname = r.pick(["mural", "graffiti", "decal", "paintjob", "scribble", "logo"]);
  const fx0 = fxBox(r, { nmat: 2 }), n = fx0.name;
  const fx = withNote(fx0, `@front wears a 64 px paint texture named ${pname} (already unwrapped).`, [{ cmd: "texture_paint_new", faces: ["@front"], size: 64, name: pname, unwrap: true }]);
  const { k, rgb } = colorOf(r);
  const col = rgb.slice(0, 3);
  const probe = (min) => [{ cmd: { cmd: "texture_pixels", material: pname, x: 0, y: 0, w: 64, h: 64 }, expect: [{ path: "pixels", op: "pixels_min", value: { color: col.map((c) => Math.round(c * 255)), min, tol: 20 } }] }];
  if (r.chance(0.5)) {
    const req = r.pick([`fill the ${pname} with ${k}`, `paint the whole ${pname} texture ${k}`, `flood the ${pname} ${k}`, `cover the front face's ${pname} in ${k} paint`]);
    return { fx, request: req, commands: [{ cmd: "texture_paint_stroke", material: pname, faces: ["@front"], fill: true, color: col }], check: { probes: probe(200) } };
  }
  const rad = r.pick([0.3, 0.4, 0.5, 0.6]);
  const pt = [r4(fx0.w / 2), 0, r4(fx0.h / 2)];
  const radT = `${rad * 100} cm`;
  const req = r.pick([`dab ${k} on the ${pname} at (${fmt(pt[0])}, ${fmt(pt[1])}, ${fmt(pt[2])}), radius ${radT}`, `paint a ${radT} ${k} spot in the middle of the front wall's ${pname}`, `with a ${radT} brush, paint ${k} on the ${pname} at the center of the front face`]);
  return { fx, request: req, commands: [{ cmd: "texture_paint_stroke", material: pname, faces: ["@front"], points: [pt], radius: rad, color: col }], check: { probes: probe(4) } };
});

F("t4", "status", 30, "easy", (r) => {
  const fx = fxBox(r, { nmat: 2 }), n = fx.name;
  const Q = r.pick([[`can I paint on the ${n}?`, { entity: `@${n}` }], [`are the faces of the ${n} ready for texture painting?`, { entity: `@${n}` }], [`is the front face paintable?`, { faces: ["@front"] }], [`do the UVs on the front wall overlap?`, { faces: ["@front"] }]]);
  return { fx, request: Q[0], commands: [{ cmd: "texture_paint_status", ...Q[1] }], check: { readonly: true } };
});

// ================================================================ combos (several features in one request)
F("x1", "combo", 70, "hard", (r) => {
  const fx = fxBox(r, { nmat: 3 }), n = fx.name;
  const [m1, m2] = r.shuffle(fx.ms).slice(0, 2);
  const { k, rgb } = colorOf(r);
  const req = r.pick([`texture the ${n} with ${m1}, then tint its top ${k} with vertex paint`, `${m1} on the whole ${n}, ${m2} on the front, and a ${k} vertex tint on the roof`, `unwrap the ${n} and make it a 256 pixel paint texture called skin`]);
  if (req.startsWith("unwrap")) return { fx, request: req, commands: [{ cmd: "uv_unwrap", entity: `@${n}` }, { cmd: "texture_paint_new", entity: `@${n}`, size: 256, name: "skin" }], check: { material: [{ name: "skin", min: 6 }], probes: UVOK(n) } };
  const three = req.startsWith(m1 + " on");
  const cmds = [{ cmd: "paint", ids: [`@${n}`], material: m1 }, ...(three ? [{ cmd: "paint", ids: ["@front"], material: m2 }] : []), { cmd: "vertex_paint", faces: ["@top"], color: rgb.slice(0, 3) }];
  return { fx, request: req, commands: cmds, check: { material: [{ name: m1, min: three ? 4 : 6 }, ...(three ? [{ name: m2, where: { normal: [0, -1, 0] }, all: true }] : [])], probes: [{ cmd: { cmd: "vertex_colors", faces: ["@top"] }, expect: [{ path: "colors", op: "corners_eq", value: tint(rgb.slice(0, 3), 1), tol: 0.02 }] }] } };
});
