// Generates eval/cases.jsonl and eval/fixtures/*.jsonl. Run: node tools/minimodel/eval/build_cases.mjs
// Each case: {id, tier, request, fixture, gold:[commands], check:{...}}.
// `gold` is a reference solution used ONLY to validate the check (validate_eval.mjs runs it through the
// engine and the check must pass). The grader never compares the model's commands to it.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cases = [];
let n = 0;
const add = (tier, request, o) => cases.push({ id: `${o.cat ? "a" : tier[0]}${String(++n).padStart(3, "0")}`, tier, ...(o.cat ? { cat: o.cat } : {}), request, fixture: o.fx || null, gold: o.gold, check: o.check });
// accessibility category: also graded easy/medium/hard, reported separately
const A = (tier, r, o) => add(tier, r, { ...o, cat: "a11y" });
const E = (r, o) => add("easy", r, o), M = (r, o) => add("medium", r, o), H = (r, o) => add("hard", r, o);

// ---------- fixtures: starting models (named ids usable as "@name") ----------
const fixtures = {
  house: {
    desc: "@house is a group named \"house\": a box 4 m (x) by 3 m (y) by 2.4 m tall, one corner at the origin (x 0..4, y 0..3, z 0..2.4). @top is its top face. The house is the selected group.",
    commands: [
      { cmd: "begin_group", name: "house", as: "house" },
      { cmd: "rect", from: [0, 0, 0], to: [4, 3, 0], as: "f" },
      { cmd: "pushpull", face: "@f", distance: 2.4, as: "top" },
      { cmd: "end_group" },
    ],
  },
  room: {
    desc: "@room is a group named \"Wall\": a closed room, walls 0.2 m thick and 2.4 m high, centerline 6 m (x) by 4 m (y) from the origin (outer size 6.2 x 4.2).",
    commands: [{ cmd: "wall", points: [[0, 0, 0], [6, 0, 0], [6, 4, 0], [0, 4, 0]], closed: true, height: 2.4, as: "room" }],
  },
  pair: {
    desc: "@a is a group named \"a\": a 1 m cube at the origin (x 0..1). @b is a group named \"b\": a 1 m cube at x 3..4. Both start at y 0..1, z 0..1.",
    commands: [
      { cmd: "begin_group", name: "a", as: "a" }, { cmd: "rect", from: [0, 0, 0], to: [1, 1, 0], as: "fa" }, { cmd: "pushpull", face: "@fa", distance: 1 }, { cmd: "end_group" },
      { cmd: "begin_group", name: "b", as: "b" }, { cmd: "rect", from: [3, 0, 0], to: [4, 1, 0], as: "fb" }, { cmd: "pushpull", face: "@fb", distance: 1 }, { cmd: "end_group" },
    ],
  },
  lot: {
    desc: "@lot is a flat rectangular face on the ground, 10 m (x) by 8 m (y), corner at the origin.",
    commands: [{ cmd: "rect", from: [0, 0, 0], to: [10, 8, 0], as: "lot" }],
  },
  block: {
    desc: "A loose (ungrouped) box 4 m (x) by 3 m (y) by 2.4 m tall, corner at the origin. @top is its top face. Its front face (facing -y) is the one at y = 0.",
    commands: [{ cmd: "rect", from: [0, 0, 0], to: [4, 3, 0], as: "f" }, { cmd: "pushpull", face: "@f", distance: 2.4, as: "top" }],
  },
  facade: {
    desc: "@facade is a flat vertical face in the plane y = 0, 6 m wide (x 0..6) and 3 m tall (z 0..3): the front of a building.",
    commands: [{ cmd: "rect", from: [0, 0, 0], to: [6, 0, 3], as: "facade" }],
  },
  tower: {
    desc: "@tower is a group named \"tower\": a box 2 m by 2 m and 6 m tall at the origin (x 0..2, y 0..2, z 0..6). @top is its top face.",
    commands: [
      { cmd: "begin_group", name: "tower", as: "tower" }, { cmd: "rect", from: [0, 0, 0], to: [2, 2, 0], as: "f" }, { cmd: "pushpull", face: "@f", distance: 6, as: "top" }, { cmd: "end_group" },
    ],
  },
  moved: {
    desc: "@house is a group named \"house\", a 4 m (x) by 3 m (y) by 2.4 m box. The last thing done was: move the house 5 m east (it now sits at x 5..9, y 0..3, z 0..2.4). Undo takes back that move.",
    commands: [
      { cmd: "begin_group", name: "house", as: "house" }, { cmd: "rect", from: [0, 0, 0], to: [4, 3, 0], as: "f" }, { cmd: "pushpull", face: "@f", distance: 2.4 }, { cmd: "end_group" },
      { cmd: "move", ids: ["@house"], by: [5, 0, 0] },
    ],
  },
  wide: {
    desc: "@house is a group named \"house\", a box 4 m wide (x) by 3 m (y) by 2.4 m tall, corner at the origin. The last request was \"a house 4 meters wide\".",
    commands: [
      { cmd: "begin_group", name: "house", as: "house" }, { cmd: "rect", from: [0, 0, 0], to: [4, 3, 0], as: "f" }, { cmd: "pushpull", face: "@f", distance: 2.4 }, { cmd: "end_group" },
    ],
  },
  roomdoor: {
    desc: "@room is a closed room (group \"Wall\"), walls 0.2 m thick and 2.4 m high, centerline 6 m (x) by 4 m (y) from the origin. @door is a group named \"door\": a flat door panel 1 m wide, 2.1 m tall, 0.1 m thick on the south wall at x 2.5..3.5, y -0.05..0.05. South is -y, north is +y, west is -x, east is +x.",
    commands: [
      { cmd: "wall", points: [[0, 0, 0], [6, 0, 0], [6, 4, 0], [0, 4, 0]], closed: true, height: 2.4, as: "room" },
      { cmd: "begin_group", name: "door", as: "door" }, { cmd: "rect", from: [2.5, -0.05, 0], to: [3.5, 0.05, 0], as: "df" }, { cmd: "pushpull", face: "@df", distance: 2.1 }, { cmd: "end_group" },
    ],
  },
  northwall: {
    desc: "@nwall is the north wall of a room as one flat vertical face in the plane y = 4, from x 0 (west end, the left end) to x 6 (east end) and z 0..2.4. South is -y, north is +y, west is -x, east is +x.",
    commands: [{ cmd: "rect", from: [0, 4, 0], to: [6, 4, 2.4], as: "nwall" }],
  },
  post: {
    desc: "@post is a group named \"Column\": a 0.3 m square column 3 m tall standing at the origin (centered on x 0, y 0).",
    commands: [{ cmd: "column", at: [0, 0, 0], size: 0.3, height: 3, as: "post" }],
  },
};

// ---------- gold builders ----------
const boxCmds = (W, D, H, o = [0, 0, 0], name) => [
  ...(name ? [{ cmd: "begin_group", name, as: name }] : []),
  { cmd: "rect", from: o, to: [o[0] + W, o[1] + D, o[2]], as: "bf" },
  { cmd: "pushpull", face: "@bf", distance: H, as: "bt" },
  ...(name ? [{ cmd: "end_group" }] : []),
];
const sz = (W, D, H, tol = 0.05) => ({ bbox: { size: [W, D, H], xy_any: true, tol } });
const r3 = (v) => +v.toFixed(3);
const FT = 0.3048, IN = 0.0254;

// =====================  EASY  =====================
// boxes in plain words and in other units
[[4, 3, 2.4, "a 4 by 3 meter box 2.4 m tall"], [2, 5, 1, "make a box 2 m wide, 5 m long and 1 m high"], [3, 3, 3, "a cube 3 m on each side"], [6, 4, 3, "a 6 x 4 x 3 box"],
 [0.5, 0.5, 0.5, "a 50 cm cube"], [0.2, 0.3, 0.05, "a 200 mm by 300 mm by 50 mm block"], [0.5, 0.5, 4, "a tall thin pillar 0.5 m square and 4 m tall"],
 [10, 10, 0.2, "a slab 10 m by 10 m and 20 cm thick"], [1.2, 0.6, 0.75, "a box 1.2 m by 0.6 m, 0.75 m high"], [8, 2, 2.5, "a long wall-like block 8 meters long, 2 meters deep and 2.5 meters high"]]
  .forEach(([w, d, h, req]) => E(req, { gold: boxCmds(w, d, h), check: sz(w, d, h) }));
E("a 10 foot by 12 foot slab 4 inches thick", { gold: boxCmds(r3(10 * FT), r3(12 * FT), r3(4 * IN)), check: sz(10 * FT, 12 * FT, 4 * IN, 0.03) });
E("a box 6 ft wide, 3 ft deep and 4 ft tall", { gold: boxCmds(r3(6 * FT), r3(3 * FT), r3(4 * FT)), check: sz(6 * FT, 3 * FT, 4 * FT, 0.03) });
// flat shapes
E("a flat 8 by 8 square on the ground", { gold: [{ cmd: "rect", from: [0, 0, 0], to: [8, 8, 0] }], check: { bbox: { size: [8, 8, 0] }, faces: { min: 1 } } });
E("a rectangle 5 m by 2 m on the floor", { gold: [{ cmd: "rect", from: [0, 0, 0], to: [5, 2, 0] }], check: { bbox: { size: [5, 2, 0], xy_any: true } } });
E("a circle of radius 2 m", { gold: [{ cmd: "circle", center: [0, 0, 0], radius: 2 }], check: { bbox: { size: [4, 4, 0], tol: 0.1 }, faces: { min: 1 } } });
E("a disc 3 m across", { gold: [{ cmd: "circle", center: [0, 0, 0], radius: 1.5 }], check: { bbox: { size: [3, 3, 0], tol: 0.1 } } });
E("a cylinder with radius 1 m and height 3 m", { gold: [{ cmd: "circle", center: [0, 0, 0], radius: 1, as: "c" }, { cmd: "pushpull", face: "@c", distance: 3 }], check: { bbox: { size: [2, 2, 3], tol: 0.1 } } });
E("a round tabletop 1.2 m in diameter and 4 cm thick", { gold: [{ cmd: "circle", center: [0, 0, 0], radius: 0.6, as: "c" }, { cmd: "pushpull", face: "@c", distance: 0.04 }], check: { bbox: { size: [1.2, 1.2, 0.04], tol: 0.05 } } });
E("a barrel: a cylinder 0.6 m wide and 0.9 m tall", { gold: [{ cmd: "circle", center: [0, 0, 0], radius: 0.3, as: "c" }, { cmd: "pushpull", face: "@c", distance: 0.9 }], check: { bbox: { size: [0.6, 0.6, 0.9], tol: 0.05 } } });
// library items
E("a column 3 m tall", { gold: [{ cmd: "column", at: [0, 0, 0], height: 3 }], check: { bbox: { size: [0.3, 0.3, 3] }, groups: { n: 1 } } });
E("a round column 4 m tall and 0.4 m wide", { gold: [{ cmd: "column", at: [0, 0, 0], size: 0.4, height: 4, round: true }], check: { bbox: { size: [0.4, 0.4, 4], tol: 0.06 } } });
E("a straight wall 6 m long and 2.7 m high", { gold: [{ cmd: "wall", points: [[0, 0, 0], [6, 0, 0]], height: 2.7 }], check: { bbox: { size: [6, 0.2, 2.7], xy_any: true, tol: 0.15 }, groups: { n: 1 } } });
E("a 3 m wall along the y axis, 0.3 m thick, 2.4 m tall", { gold: [{ cmd: "wall", points: [[0, 0, 0], [0, 3, 0]], thickness: 0.3, height: 2.4 }], check: { bbox: { size: [0.3, 3, 2.4], xy_any: true, tol: 0.15 } } });
E("a staircase 1 m wide rising 2.7 m", { gold: [{ cmd: "stairs", at: [0, 0, 0], rise: 2.7, width: 1 }], check: { bbox: { size: [null, null, 2.7], xy_has: 1 } } });
E("stairs rising 3 m, 1.2 m wide", { gold: [{ cmd: "stairs", at: [0, 0, 0], rise: 3, width: 1.2 }], check: { bbox: { size: [null, null, 3], xy_has: 1.2 } } });
E("a short flight of stairs, 0.9 m wide, climbing 1.5 m", { gold: [{ cmd: "stairs", at: [0, 0, 0], rise: 1.5, width: 0.9 }], check: { bbox: { size: [null, null, 1.5], xy_has: 0.9 } } });
for (const [asset, at, req] of [["tree", [5, 5, 0], "plant a tree at 5, 5"], ["car", [0, 0, 0], "put a car at the origin"], ["bench", [2, 0, 0], "a bench at x 2, y 0"], ["streetlight", [10, 0, 0], "a streetlight at 10, 0"], ["door", [3, 0, 0], "add a door at x 3 on the ground"], ["window", [2, 0, 1], "a window at 2, 0, 1"], ["hydrant", [4, 4, 0], "a fire hydrant at 4, 4"], ["garage_door", [0, 0, 0], "insert a garage door at the origin"], ["palm", [8, 2, 0], "a palm tree at 8, 2"]])
  E(req, { gold: [{ cmd: "insert", asset, at }], check: { instances: { name: asset.split("_")[0], min: 1 } } });
// operations on the house fixture
E("move the house 5 m east", { fx: "house", gold: [{ cmd: "move", ids: ["@house"], by: [5, 0, 0] }], check: { bbox: { min: [5, 0, 0], max: [9, 3, 2.4] } } });
E("move the house 3 m north and 2 m up", { fx: "house", gold: [{ cmd: "move", ids: ["@house"], by: [0, 3, 2] }], check: { bbox: { min: [0, 3, 2], max: [4, 6, 4.4] } } });
E("shift the house 10 m to the west", { fx: "house", gold: [{ cmd: "move", ids: ["@house"], by: [-10, 0, 0] }], check: { bbox: { min: [-10, 0, 0], max: [-6, 3, 2.4] } } });
E("rotate the selected group 45 degrees", { fx: "house", gold: [{ cmd: "rotate", ids: ["@house"], center: [2, 1.5, 0], angle: 45 }], check: { bbox: { size: [4.95, 4.95, 2.4], tol: 0.1 }, groups: { n: 1 } } });
E("rotate the house 90 degrees about the origin", { fx: "house", gold: [{ cmd: "rotate", ids: ["@house"], center: [0, 0, 0], angle: 90 }], check: { bbox: { min: [-3, 0, 0], max: [0, 4, 2.4] } } });
E("turn the selected group 180 degrees around its own corner at the origin", { fx: "house", gold: [{ cmd: "rotate", ids: ["@house"], center: [0, 0, 0], angle: 180 }], check: { bbox: { min: [-4, -3, 0], max: [0, 0, 2.4] } } });
E("scale the house to double size from the origin", { fx: "house", gold: [{ cmd: "scale", ids: ["@house"], center: [0, 0, 0], factor: 2 }], check: { bbox: { min: [0, 0, 0], max: [8, 6, 4.8] } } });
E("make the house twice as tall", { fx: "house", gold: [{ cmd: "scale", ids: ["@house"], center: [0, 0, 0], factor: [1, 1, 2] }], check: { bbox: { size: [4, 3, 4.8] } } });
E("shrink the house to half size, keeping the corner at the origin", { fx: "house", gold: [{ cmd: "scale", ids: ["@house"], center: [0, 0, 0], factor: 0.5 }], check: { bbox: { min: [0, 0, 0], max: [2, 1.5, 1.2] } } });
E("copy the house 6 m to the east", { fx: "house", gold: [{ cmd: "copy", group: "@house", by: [6, 0, 0] }], check: { groups: { n: 2 }, bbox: { min: [0, 0, 0], max: [10, 3, 2.4] } } });
E("delete the house", { fx: "house", gold: [{ cmd: "delete", ids: ["@house"] }], check: { groups: { n: 0 }, faces: { max: 0 } } });
E("rename the house to shed", { fx: "house", gold: [{ cmd: "rename", id: "@house", name: "shed" }], check: { groups: { name: "^shed$", n: 1 } } });
E("tag the house \"walls\"", { fx: "house", gold: [{ cmd: "tag", ids: ["@house"], tag: "walls" }], check: { tags: ["walls"] } });
for (const [c, rgb, w] of [["red", [1, 0, 0], "paint the house red"], ["blue", [0.1, 0.2, 0.9], "make the house blue"], ["green", [0.1, 0.7, 0.2], "color the house green"], ["yellow", [1, 0.9, 0.1], "paint the whole house yellow"], ["white", [1, 1, 1], "the house should be white"], ["orange", [1, 0.5, 0], "paint the house orange"]])
  E(w, { fx: "house", gold: [{ cmd: "paint", ids: ["@house"], color: rgb }], check: { painted: [{ color: c, where: { group: "house" }, all: true }] } });
E("paint the top face red", { fx: "house", gold: [{ cmd: "paint", ids: ["@top"], color: [1, 0, 0] }], check: { painted: [{ color: "red", where: { normal: [0, 0, 1] }, all: true }, { color: "red", where: { normal: [0, 0, -1] }, none: true }] } });
E("paint the top face of the block blue", { fx: "block", gold: [{ cmd: "paint", ids: ["@top"], color: [0, 0, 1] }], check: { painted: [{ color: "blue", where: { normal: [0, 0, 1] }, all: true }, { color: "blue", where: { normal: [0, -1, 0] }, none: true }] } });
E("what is the volume of the house?", { fx: "house", gold: [{ cmd: "volume", id: "@house" }], check: { reply: [{ key: "volume", approx: 28.8 }] } });
E("dimension from 0,0,0 to 5,0,0", { gold: [{ cmd: "dimension", from: [0, 0, 0], to: [5, 0, 0] }], check: { reply: [{ key: "length", approx: 5 }] } });
E("push the top of the tower up another 2 m", { fx: "tower", gold: [{ cmd: "pushpull", face: "@top", distance: 2 }], check: { bbox: { size: [2, 2, 8] } } });
E("push the lot up 3 m to make a block", { fx: "lot", gold: [{ cmd: "pushpull", face: "@lot", distance: 3, toward: [0, 0, 1] }], check: { bbox: { size: [10, 8, 3] } } });
E("move the lot 4 m south", { fx: "lot", gold: [{ cmd: "move", ids: ["@lot"], by: [0, -4, 0] }], check: { bbox: { min: [0, -4, 0], max: [10, 4, 0] } } });
E("move group b one meter up", { fx: "pair", gold: [{ cmd: "move", ids: ["@b"], by: [0, 0, 1] }], check: { bbox: { size: [4, 1, 2] } } });
E("delete group a", { fx: "pair", gold: [{ cmd: "delete", ids: ["@a"] }], check: { groups: { n: 1, name: "^b$" }, bbox: { min: [3, 0, 0], max: [4, 1, 1] } } });
E("duplicate the post 2 m to the east", { fx: "post", gold: [{ cmd: "duplicate", ids: ["@post"], by: [2, 0, 0] }], check: { groups: { n: 2 }, bbox: { size: [2.3, 0.3, 3] } } });
E("make the post twice as high", { fx: "post", gold: [{ cmd: "scale", ids: ["@post"], center: [0, 0, 0], factor: [1, 1, 2] }], check: { bbox: { size: [0.3, 0.3, 6] } } });
E("paint the post grey", { fx: "post", gold: [{ cmd: "paint", ids: ["@post"], color: [0.5, 0.5, 0.5] }], check: { painted: [{ color: "gray", where: { group: "Column" }, all: true }] } });
E("rotate group a 90 degrees around the point 0.5, 0.5", { fx: "pair", gold: [{ cmd: "rotate", ids: ["@a"], center: [0.5, 0.5, 0], angle: 90 }], check: { bbox: { size: [4, 1, 1] } } });
E("move group b 2 m toward a", { fx: "pair", gold: [{ cmd: "move", ids: ["@b"], by: [-2, 0, 0] }], check: { bbox: { size: [2, 1, 1] } } });

// =====================  MEDIUM  =====================
for (const [w, d, h] of [[6, 4, 2.4], [5, 5, 2.7], [8, 3, 3], [4, 4, 2.5], [10, 6, 3]]) {
  const room = [{ cmd: "wall", points: [[0, 0, 0], [w, 0, 0], [w, d, 0], [0, d, 0]], closed: true, height: h }];
  M(`a ${w}x${d} room with ${h} m walls`, { gold: room, check: { bbox: { size: [w + 0.2, d + 0.2, h], xy_any: true, tol: 0.15 }, groups: { n: 1 } } });
}
for (const [w, d, h, side, req] of [[6, 4, 2.4, "south", "a 6x4 room with 2.4 m walls and a door on the south wall"], [5, 5, 2.7, "north", "make a 5 by 5 m room, 2.7 m high, with a door in the north wall"], [8, 6, 3, "south", "a room 8 m by 6 m with 3 m walls and a door at the front"]]) {
  const x = side === "south" ? [w / 2 - 0.5, 0] : [w / 2 - 0.5, d];
  M(req, { gold: [{ cmd: "wall", points: [[0, 0, 0], [w, 0, 0], [w, d, 0], [0, d, 0]], closed: true, height: h }, { cmd: "insert", asset: "door", at: [x[0], x[1], 0] }], check: { bbox: { size: [w + 0.2, d + 0.2, h], xy_any: true, tol: 0.25 }, instances: { name: "door", min: 1 }, groups: { n: 1 } } });
}
M("a 6 m by 4 m room, 2.4 m walls, with a window on the east wall", { gold: [{ cmd: "wall", points: [[0, 0, 0], [6, 0, 0], [6, 4, 0], [0, 4, 0]], closed: true, height: 2.4 }, { cmd: "insert", asset: "window", at: [6, 2, 1], rotate: 90 }], check: { bbox: { size: [6.2, 4.2, 2.4], xy_any: true, tol: 0.15 }, instances: { name: "window", min: 1 } } });
M("add a door to the south wall of the room", { fx: "room", gold: [{ cmd: "insert", asset: "door", at: [2.5, 0, 0] }], check: { instances: { name: "door", min: 1 }, groups: { n: 1 }, bbox: { size: [6.2, 4.2, 2.4], tol: 0.15 } } });
M("put two windows in the north wall of the room", { fx: "room", gold: [{ cmd: "insert", asset: "window", at: [1.5, 4, 1] }, { cmd: "insert", asset: "window", at: [4, 4, 1] }], check: { instances: { name: "window", min: 2 }, groups: { n: 1 } } });
// roofs
for (const [w, d, h, kind, p, req] of [[4, 3, 2.4, "gable", 30, "a gable roof at 30° on the house"], [4, 3, 2.4, "gable", 45, "give the house a 45 degree gable roof"], [4, 3, 2.4, "hip", 30, "put a hip roof on the house, 30 degree pitch"], [4, 3, 2.4, "shed", 20, "a shed roof on the house, pitched at 20 degrees"]])
  M(req, { fx: "house", gold: [{ cmd: "roof", face: "@top", kind, pitch: p }], check: { groups: { name: "roof", n: 1 }, bbox: { min: [null, null, 0], max: [null, null, null] }, ...roofCheck(kind, p, d, h) } });
function roofCheck(kind, p, d, h) {
  // measured against the engine: rise above the eaves, with the default overhang (see validate_eval output)
  const half = kind === "shed" ? d : d / 2;
  const rise = half * Math.tan((p * Math.PI) / 180);
  return { roof_rise: { kind, base: h, rise, pitch: p } };
}
// arrays and copies
for (const [k, s, req] of [[6, 3, "array 6 columns 3 m apart"], [4, 2, "a row of 4 columns, 2 m apart"], [8, 1.5, "8 columns in a row, 1.5 m spacing"], [5, 4, "a colonnade of 5 columns 4 m apart"]])
  M(req, { gold: [{ cmd: "column", at: [0, 0, 0], as: "c" }, { cmd: "array", ids: ["@c"], by: [s, 0, 0], count: k - 1 }], check: { groups: { name: "column", n: k }, bbox: { size: [(k - 1) * s + 0.3, 0.3, 2.7], tol: 0.1 } } });
for (const [k, s, req] of [[4, 2, "a row of 4 one-meter cubes spaced 2 m apart"], [3, 3, "three 1 m boxes in a row, 3 m between them"], [5, 1.5, "a line of 5 unit cubes 1.5 m apart"]])
  M(req, { gold: [...boxCmds(1, 1, 1, [0, 0, 0], "cube"), { cmd: "array", ids: ["@cube"], by: [s, 0, 0], count: k - 1 }], check: { groups: { n: k }, bbox: { size: [(k - 1) * s + 1, 1, 1] } } });
M("array the house 4 times, 6 m apart", { fx: "house", gold: [{ cmd: "array", ids: ["@house"], by: [6, 0, 0], count: 3 }], check: { groups: { n: 4 }, bbox: { size: [22, 3, 2.4] } } });
M("make 3 copies of the tower, 4 m apart along y", { fx: "tower", gold: [{ cmd: "array", ids: ["@tower"], by: [0, 4, 0], count: 3 }], check: { groups: { n: 4 }, bbox: { size: [2, 14, 6] } } });
M("a row of 6 columns along y, 2.5 m apart", { gold: [{ cmd: "column", at: [0, 0, 0], as: "c" }, { cmd: "array", ids: ["@c"], by: [0, 2.5, 0], count: 5 }], check: { groups: { name: "column", n: 6 }, bbox: { size: [0.3, 12.8, 2.7], tol: 0.1 } } });
// stairs, shapes
M("stairs 1.2 m wide rising 2.4 m, heading north", { gold: [{ cmd: "stairs", at: [0, 0, 0], rise: 2.4, direction: 90, width: 1.2 }], check: { bbox: { size: [1.2, null, 2.4], tol: 0.1 } } });
M("a staircase going up 2.1 m toward the east that is 1 m wide", { gold: [{ cmd: "stairs", at: [0, 0, 0], rise: 2.1, direction: 0, width: 1 }], check: { bbox: { size: [null, 1, 2.1], tol: 0.1 } } });
M("an L-shaped block, 6 m by 4 m overall, arms 2 m wide, 3 m tall", { gold: [{ cmd: "polygon", points: [[0, 0, 0], [6, 0, 0], [6, 2, 0], [2, 2, 0], [2, 4, 0], [0, 4, 0]], as: "L" }, { cmd: "pushpull", face: "@L", distance: 3, toward: [0, 0, 1] }], check: { bbox: { size: [6, 4, 3] }, has_face: [{ normal: [0, 0, 1], area: 16, z: [2.9, 3.1] }] } });
M("a triangular prism: base triangle with points (0,0), (4,0), (2,3), extruded 2 m up", { gold: [{ cmd: "polygon", points: [[0, 0, 0], [4, 0, 0], [2, 3, 0]], as: "t" }, { cmd: "pushpull", face: "@t", distance: 2, toward: [0, 0, 1] }], check: { bbox: { size: [4, 3, 2] } } });
M("a cylinder radius 0.5 m, 3 m tall, centered at x 10, y 5", { gold: [{ cmd: "circle", center: [10, 5, 0], radius: 0.5, as: "c" }, { cmd: "pushpull", face: "@c", distance: 3, toward: [0, 0, 1] }], check: { bbox: { min: [9.5, 4.5, 0], max: [10.5, 5.5, 3], tol: 0.08 } } });
M("a 2 m diameter pond (a flat circle) centered at 3, 4", { gold: [{ cmd: "circle", center: [3, 4, 0], radius: 1 }], check: { bbox: { min: [2, 3, 0], max: [4, 5, 0], tol: 0.08 } } });
M("a pier: a 1 m square column 4 m tall at 5, 5", { gold: [{ cmd: "column", at: [5, 5, 0], size: 1, height: 4 }], check: { bbox: { min: [4.5, 4.5, 0], max: [5.5, 5.5, 4], tol: 0.1 } } });
// edits on fixtures
M("inset the lot by 1 m", { fx: "lot", gold: [{ cmd: "offset", face: "@lot", distance: 1 }], check: { faces: { min: 2 }, has_face: [{ normal: [0, 0, 1], normal_abs: true, area: 48 }] } });
M("cut a 1 m wide, 2 m tall door opening in the facade, 1 m from its left edge", { fx: "facade", gold: [{ cmd: "rect", from: [1, 0, 0], to: [2, 0, 2] }], check: { has_face: [{ normal: [0, 1, 0], normal_abs: true, area: 2 }], faces: { min: 2 } } });
M("cut a 1 m square window hole in the middle of the facade at 1 m height", { fx: "facade", gold: [{ cmd: "rect", from: [2.5, 0, 1], to: [3.5, 0, 2] }], check: { has_face: [{ normal: [0, 1, 0], normal_abs: true, area: 1 }], faces: { min: 2 } } });
M("move the house 5 m east then turn it 90 degrees about the origin", { fx: "house", gold: [{ cmd: "move", ids: ["@house"], by: [5, 0, 0] }, { cmd: "rotate", ids: ["@house"], center: [0, 0, 0], angle: 90 }], check: { bbox: { min: [-3, 5, 0], max: [0, 9, 2.4] } } });
M("copy the house 6 m east and paint the copy blue", { fx: "house", gold: [{ cmd: "copy", group: "@house", by: [6, 0, 0], as: "h2" }, { cmd: "paint", ids: ["@h2"], color: [0, 0, 1] }], check: { groups: { n: 2 }, painted: [{ color: "blue", where: { group: "copy" }, all: true }, { color: "blue", where: { group: "^house$" }, none: true }] } });
M("stack group b on top of group a", { fx: "pair", gold: [{ cmd: "move", ids: ["@b"], by: [-3, 0, 1] }], check: { bbox: { size: [1, 1, 2] }, groups: { n: 2 } } });
M("place b right next to a, touching it on the east side", { fx: "pair", gold: [{ cmd: "move", ids: ["@b"], by: [-2, 0, 0] }], check: { bbox: { size: [2, 1, 1] } } });
M("paint group a red and group b blue", { fx: "pair", gold: [{ cmd: "paint", ids: ["@a"], color: [1, 0, 0] }, { cmd: "paint", ids: ["@b"], color: [0, 0, 1] }], check: { painted: [{ color: "red", where: { group: "^a$" }, all: true }, { color: "blue", where: { group: "^b$" }, all: true }] } });
M("make the house a component called hut and place another hut 10 m east", { fx: "house", gold: [{ cmd: "make_component", ids: ["@house"], name: "hut" }, { cmd: "place", component: "hut", at: [10, 0, 0] }], check: { instances: { name: "hut", n: 2 } } });
M("scale the tower to half its height and double its width, from the origin", { fx: "tower", gold: [{ cmd: "scale", ids: ["@tower"], center: [0, 0, 0], factor: [2, 2, 0.5] }], check: { bbox: { size: [4, 4, 3] } } });
M("paint the front face of the block red", { fx: "block", gold: [{ cmd: "pick", at: [2, 0, 1.2], as: "ff" }, { cmd: "paint", ids: ["@ff"], color: [1, 0, 0] }], check: { painted: [{ color: "red", where: { normal: [0, -1, 0] }, all: true }, { color: "red", where: { normal: [0, 0, 1] }, none: true }] } });
M("paint the east side of the block green", { fx: "block", gold: [{ cmd: "pick", at: [4, 1.5, 1.2], as: "ef" }, { cmd: "paint", ids: ["@ef"], color: [0, 0.8, 0] }], check: { painted: [{ color: "green", where: { normal: [1, 0, 0] }, all: true }, { color: "green", where: { normal: [-1, 0, 0] }, none: true }] } });
M("draw a 4 m long dimension along the front edge of the block, set 1 m out", { fx: "block", gold: [{ cmd: "dimension", from: [0, 0, 0], to: [4, 0, 0], offset: [0, -1, 0] }], check: { reply: [{ key: "length", approx: 4 }] } });
M("tag the tower \"core\"", { fx: "tower", gold: [{ cmd: "tag", ids: ["@tower"], tag: "core" }], check: { tags: ["core"] } });
M("a tree and a bench side by side near 5, 5", { gold: [{ cmd: "insert", asset: "tree", at: [5, 5, 0] }, { cmd: "insert", asset: "bench", at: [7, 5, 0] }], check: { instances: { n: 2 } } });
M("a small shed: 3 m by 2 m by 2.2 m high box, named shed", { gold: boxCmds(3, 2, 2.2, [0, 0, 0], "shed"), check: { groups: { name: "^shed$", n: 1 }, bbox: { size: [3, 2, 2.2], xy_any: true } } });
M("a box 2 by 2 by 2 at x 10, y 10", { gold: boxCmds(2, 2, 2, [10, 10, 0]), check: { bbox: { min: [10, 10, 0], max: [12, 12, 2] } } });
M("a 5 m tall tower, 2 m square, and a second one 6 m to the east", { gold: [...boxCmds(2, 2, 5, [0, 0, 0], "t1"), ...boxCmds(2, 2, 5, [6, 0, 0], "t2")], check: { groups: { n: 2 }, bbox: { size: [8, 2, 5] } } });
M("measure the volume of the tower", { fx: "tower", gold: [{ cmd: "volume", id: "@tower" }], check: { reply: [{ key: "volume", approx: 24 }] } });
M("scale the lot down to a 5 by 4 plot, about the origin", { fx: "lot", gold: [{ cmd: "scale", ids: ["@lot"], center: [0, 0, 0], factor: 0.5 }], check: { bbox: { size: [5, 4, 0] } } });
M("pull the lot up into a 10 by 8 box 2 m high", { fx: "lot", gold: [{ cmd: "pushpull", face: "@lot", distance: 2, toward: [0, 0, 1] }], check: { bbox: { size: [10, 8, 2] } } });
M("insert a car at 3, 3 rotated 90 degrees", { gold: [{ cmd: "insert", asset: "car", at: [3, 3, 0], rotate: 90 }], check: { instances: { name: "car", n: 1 } } });
M("a gable roof at 30° on a 6 by 4 m box 3 m tall", { gold: [...boxCmds(6, 4, 3, [0, 0, 0], "h").slice(0, 1), { cmd: "rect", from: [0, 0, 0], to: [6, 4, 0], as: "bf" }, { cmd: "pushpull", face: "@bf", distance: 3, as: "bt" }, { cmd: "end_group" }, { cmd: "roof", face: "@bt", kind: "gable", pitch: 30 }], check: { groups: { name: "roof", n: 1 }, ...roofCheck("gable", 30, 4, 3) } });

// =====================  HARD  =====================
const roomCmds = (w, d, h) => [{ cmd: "wall", points: [[0, 0, 0], [w, 0, 0], [w, d, 0], [0, d, 0]], closed: true, height: h }];
H("a 8 by 6 house, 3 m high, with a 30 degree gable roof and a door in front", { gold: [{ cmd: "begin_group", name: "house", as: "h" }, { cmd: "rect", from: [0, 0, 0], to: [8, 6, 0], as: "f" }, { cmd: "pushpull", face: "@f", distance: 3, as: "t" }, { cmd: "end_group" }, { cmd: "roof", face: "@t", kind: "gable", pitch: 30 }, { cmd: "insert", asset: "door", at: [3.5, 0, 0] }], check: { groups: { name: "roof", n: 1 }, instances: { name: "door", min: 1 }, ...roofCheck("gable", 30, 6, 3) } });
H("a white 6 x 5 house 2.8 m tall with a dark gray hip roof at 25 degrees", { gold: [{ cmd: "begin_group", name: "house", as: "h" }, { cmd: "rect", from: [0, 0, 0], to: [6, 5, 0], as: "f" }, { cmd: "pushpull", face: "@f", distance: 2.8, as: "t" }, { cmd: "end_group" }, { cmd: "roof", face: "@t", kind: "hip", pitch: 25, as: "r" }, { cmd: "paint", ids: ["@h"], color: [1, 1, 1] }, { cmd: "paint", ids: ["@r"], color: [0.25, 0.25, 0.25] }], check: { painted: [{ color: "white", where: { group: "^house$" }, all: true }, { color: "gray", where: { group: "roof" }, all: true }], ...roofCheck("hip", 25, 5, 2.8) } });
H("paint the roof of the house dark gray and the walls white", { fx: "house", gold: [{ cmd: "roof", face: "@top", kind: "gable", pitch: 30, as: "r" }, { cmd: "paint", ids: ["@house"], color: [1, 1, 1] }, { cmd: "paint", ids: ["@r"], color: [0.3, 0.3, 0.3] }], check: { groups: { name: "roof", n: 1 }, painted: [{ color: "white", where: { group: "^house$" }, all: true }, { color: "gray", where: { group: "roof" }, all: true }] } });
H("four 3 m columns at the corners of a 6 by 6 square", { gold: [[0, 0], [6, 0], [6, 6], [0, 6]].map(([x, y]) => ({ cmd: "column", at: [x, y, 0], height: 3 })), check: { groups: { name: "column", n: 4 }, bbox: { size: [6.3, 6.3, 3], tol: 0.1 } } });
H("a 5 by 5 pavilion: four 3 m columns at the corners and a flat roof slab 0.2 m thick on top", { gold: [...[[0, 0], [5, 0], [5, 5], [0, 5]].map(([x, y]) => ({ cmd: "column", at: [x, y, 0], height: 3 })), ...boxCmds(5.3, 5.3, 0.2, [-0.15, -0.15, 3])], check: { groups: { name: "column", n: 4 }, bbox: { size: [5.3, 5.3, 3.2], tol: 0.15 } } });
H("a 3 by 3 grid of columns, 4 m apart", { gold: [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => ({ cmd: "column", at: [i * 4, j * 4, 0] }))), check: { groups: { name: "column", n: 9 }, bbox: { size: [8.3, 8.3, 2.7], tol: 0.1 } } });
H("a 2 by 4 grid of columns, 3 m apart", { gold: [0, 1].flatMap((i) => [0, 1, 2, 3].map((j) => ({ cmd: "column", at: [i * 3, j * 3, 0] }))), check: { groups: { name: "column", n: 8 }, bbox: { size: [3.3, 9.3, 2.7], xy_any: true, tol: 0.1 } } });
H("8 columns evenly spaced on a circle of radius 5 m around the origin", { gold: Array.from({ length: 8 }, (_, i) => ({ cmd: "column", at: [r3(5 * Math.cos((i * Math.PI) / 4)), r3(5 * Math.sin((i * Math.PI) / 4)), 0] })), check: { groups: { name: "column", n: 8 }, bbox: { size: [10.3, 10.3, 2.7], tol: 0.15 } } });
H("a two-storey block: two 6 by 4 floors, each 3 m high, stacked", { gold: [...boxCmds(6, 4, 3, [0, 0, 0], "floor1"), ...boxCmds(6, 4, 3, [0, 0, 3], "floor2")], check: { groups: { n: 2 }, bbox: { size: [6, 4, 6], xy_any: true } } });
H("three houses in a row, 10 m apart, the middle one twice as tall", { fx: "house", gold: [{ cmd: "copy", group: "@house", by: [10, 0, 0], as: "m" }, { cmd: "copy", group: "@house", by: [20, 0, 0] }, { cmd: "scale", ids: ["@m"], center: [10, 0, 0], factor: [1, 1, 2] }], check: { groups: { n: 3 }, bbox: { size: [24, 3, 4.8] } } });
H("a 20 by 30 foot garage 9 feet tall with a garage door in front", { gold: [...boxCmds(r3(20 * FT), r3(30 * FT), r3(9 * FT), [0, 0, 0], "garage"), { cmd: "insert", asset: "garage_door", at: [1, 0, 0] }], check: { bbox: { size: [20 * FT, 30 * FT, 9 * FT], xy_any: true, tol: 0.1 }, instances: { name: "garage", min: 1 } } });
H("an L-shaped room: 8 by 6 overall with a 4 by 3 notch cut from the north-east corner, 2.7 m walls", { gold: [{ cmd: "wall", points: [[0, 0, 0], [8, 0, 0], [8, 3, 0], [4, 3, 0], [4, 6, 0], [0, 6, 0]], closed: true, height: 2.7 }], check: { bbox: { size: [8.2, 6.2, 2.7], tol: 0.2 }, groups: { n: 1 } } });
H("a hollow box 4 by 4 by 3 m with 0.2 m thick walls and an open top", { gold: [{ cmd: "rect", from: [0, 0, 0], to: [4, 4, 0], as: "f" }, { cmd: "pushpull", face: "@f", distance: 3, as: "t" }, { cmd: "offset", face: "@t", distance: 0.2, as: "in" }, { cmd: "pushpull", face: "@in", distance: -2.8 }], check: { bbox: { size: [4, 4, 3] }, has_face: [{ normal: [0, 0, 1], area: 12.96, z: [0.1, 0.3] }] } });
H("a table: top 1.6 by 0.8 m and 4 cm thick at 0.75 m height, with four 5 cm square legs at the corners", { gold: [...boxCmds(1.6, 0.8, 0.04, [0, 0, 0.71]), ...[[0, 0], [1.55, 0], [1.55, 0.75], [0, 0.75]].map(([x, y]) => boxCmds(0.05, 0.05, 0.71, [x, y, 0])).flat()], check: { bbox: { size: [1.6, 0.8, 0.75], xy_any: true, tol: 0.06 } } });
H("a fence: 10 posts, 1.2 m tall and 0.1 m square, 1 m apart", { gold: [{ cmd: "column", at: [0, 0, 0], size: 0.1, height: 1.2, as: "p" }, { cmd: "array", ids: ["@p"], by: [1, 0, 0], count: 9 }], check: { groups: { name: "column", n: 10 }, bbox: { size: [9.1, 0.1, 1.2], tol: 0.08 } } });
H("a staircase 1 m wide rising 2.7 m with a 1.5 m square landing at the top", { gold: [{ cmd: "stairs", at: [0, 0, 0], rise: 2.7, width: 1, direction: 0, as: "s" }, ...boxCmds(1.5, 1.5, 0.1, [4.0, -0.25, 2.6])], check: { bbox: { size: [null, null, 2.7], tol: 0.15 }, groups: { name: "stairs", min: 1 } } });
H("rotate the house 30 degrees about its center and put a copy 8 m east of it", { fx: "house", gold: [{ cmd: "rotate", ids: ["@house"], center: [2, 1.5, 0], angle: 30 }, { cmd: "copy", group: "@house", by: [8, 0, 0] }], check: { groups: { n: 2 }, bbox: { size: [null, null, 2.4] } } });
H("two rooms side by side, each 4 by 4 m with 2.5 m walls, sharing the wall at x = 4", { gold: [{ cmd: "wall", points: [[0, 0, 0], [4, 0, 0], [4, 4, 0], [0, 4, 0]], closed: true, height: 2.5 }, { cmd: "wall", points: [[4, 0, 0], [8, 0, 0], [8, 4, 0], [4, 4, 0]], closed: true, height: 2.5 }], check: { bbox: { size: [8.2, 4.2, 2.5], tol: 0.2 }, groups: { min: 2 } } });
H("a 6 x 4 room with 2.4 m walls, a door on the south wall, a window on each of the other three walls, and a flat roof slab 0.2 m thick", { gold: [...roomCmds(6, 4, 2.4), { cmd: "insert", asset: "door", at: [2.5, 0, 0] }, { cmd: "insert", asset: "window", at: [6, 2, 1], rotate: 90 }, { cmd: "insert", asset: "window", at: [2.5, 4, 1] }, { cmd: "insert", asset: "window", at: [0, 2, 1], rotate: 90 }, ...boxCmds(6.2, 4.2, 0.2, [-0.1, -0.1, 2.4])], check: { instances: { name: "window", min: 3 }, bbox: { size: [6.2, 4.2, 2.6], tol: 0.2 }, groups: { min: 1 } } });
H("move the tower so it stands against the east side of the house, then raise the tower another 1 m on top", { fx: "house", gold: [{ cmd: "begin_group", name: "tower", as: "tw" }, { cmd: "rect", from: [4, 0, 0], to: [6, 2, 0], as: "tf" }, { cmd: "pushpull", face: "@tf", distance: 4, as: "tt" }, { cmd: "end_group" }, { cmd: "pushpull", face: "@tt", distance: 1 }], check: { groups: { n: 2 }, bbox: { size: [6, 3, 5] } } });
H("scale the house by 1.5 about its center so the middle stays fixed, then paint the top face of the scaled house blue", { fx: "house", gold: [{ cmd: "scale", ids: ["@house"], center: [2, 1.5, 1.2], factor: 1.5 }, { cmd: "paint", ids: ["@top"], color: [0, 0, 1] }], check: { bbox: { size: [6, 4.5, 3.6] }, painted: [{ color: "blue", where: { normal: [0, 0, 1] }, all: true }, { color: "blue", where: { normal: [0, 0, -1] }, none: true }] } });
H("a street of 4 houses 8 m apart along x, each with a 30 degree gable roof", { gold: [0, 1, 2, 3].flatMap((i) => [{ cmd: "begin_group", name: `h${i}`, as: `h${i}` }, { cmd: "rect", from: [i * 8, 0, 0], to: [i * 8 + 4, 3, 0], as: `f${i}` }, { cmd: "pushpull", face: `@f${i}`, distance: 2.4, as: `t${i}` }, { cmd: "end_group" }, { cmd: "roof", face: `@t${i}`, kind: "gable", pitch: 30 }]), check: { groups: { name: "roof", n: 4 }, bbox: { size: [null, null, null] }, parts: [] } });
H("a gazebo: six 2.5 m columns on a circle of radius 3 m and a round slab roof 7 m across and 0.2 m thick on top", { gold: [...Array.from({ length: 6 }, (_, i) => ({ cmd: "column", at: [r3(3 * Math.cos((i * Math.PI) / 3)), r3(3 * Math.sin((i * Math.PI) / 3)), 0], height: 2.5 })), { cmd: "circle", center: [0, 0, 2.5], radius: 3.5, as: "rf" }, { cmd: "pushpull", face: "@rf", distance: 0.2, toward: [0, 0, 1] }], check: { groups: { name: "column", n: 6 }, bbox: { size: [7, 7, 2.7], tol: 0.2 } } });
H("a 12 m by 8 m lot with a 6 by 4 m house 3 m tall in its middle", { gold: [{ cmd: "rect", from: [0, 0, 0], to: [12, 8, 0] }, ...boxCmds(6, 4, 3, [3, 2, 0], "house")], check: { bbox: { size: [12, 8, 3] }, groups: { n: 1 } } });
H("a 6 m tall tower with a 4 m wide 0.5 m thick slab balanced on top, centered on it", { fx: "tower", gold: boxCmds(4, 4, 0.5, [-1, -1, 6]), check: { bbox: { size: [4, 4, 6.5] }, groups: { n: 1 } } });
H("an outdoor scene: a house 6 by 4 by 3 m, a tree 4 m to the east of it, and a car 3 m in front of it", { gold: [...boxCmds(6, 4, 3, [0, 0, 0], "house"), { cmd: "insert", asset: "tree", at: [10, 2, 0] }, { cmd: "insert", asset: "car", at: [3, -3, 0] }], check: { groups: { n: 1 }, instances: { n: 2 } } });
H("a retaining wall made of a 10 m long 0.4 m thick 1.5 m high wall, with 5 buttress columns 0.4 m square every 2.5 m along it", { gold: [{ cmd: "wall", points: [[0, 0, 0], [10, 0, 0]], thickness: 0.4, height: 1.5 }, { cmd: "column", at: [0, -0.4, 0], size: 0.4, height: 1.5, as: "bc" }, { cmd: "array", ids: ["@bc"], by: [2.5, 0, 0], count: 4 }], check: { groups: { min: 6 }, bbox: { size: [10, null, 1.5], tol: 0.4 } } });
H("mirror the house to the other side of the y axis, so the two are back to back", { fx: "house", gold: [{ cmd: "copy", group: "@house", by: [0, -3, 0] }], check: { groups: { n: 2 }, bbox: { size: [4, 6, 2.4] } } });
H("a pyramid-like shape: a 6 m square slab 1 m thick with a 4 m square slab 1 m thick centered on it, then a 2 m square slab 1 m thick on top", { gold: [...boxCmds(6, 6, 1, [0, 0, 0]), ...boxCmds(4, 4, 1, [1, 1, 1]), ...boxCmds(2, 2, 1, [2, 2, 2])], check: { bbox: { size: [6, 6, 3] } } });
H("make the house 3 times longer along x only, then add a shed roof at 15 degrees", { fx: "house", gold: [{ cmd: "scale", ids: ["@house"], center: [0, 0, 0], factor: [3, 1, 1] }, { cmd: "roof", face: "@top", kind: "shed", pitch: 15 }], check: { groups: { name: "roof", n: 1 }, bbox: { min: [null, null, 0] } } });
H("a window wall: a 6 m wide 3 m tall facade with three 1 m square windows cut at x 1, 2.5 and 4, 1 m up", { fx: "facade", gold: [1, 2.5, 4].map((x) => ({ cmd: "rect", from: [x, 0, 1], to: [x + 1, 0, 2] })), check: { has_face: [{ normal: [0, 1, 0], normal_abs: true, area: 1, min: 3 }] } });
H("turn the whole street around: rotate both houses 180 degrees around their shared middle point at 7, 1.5", { fx: "pair", gold: [{ cmd: "rotate", ids: ["@a", "@b"], center: [2, 0.5, 0], angle: 180 }], check: { bbox: { size: [4, 1, 1] }, groups: { n: 2 } } });
H("replace the house with a copy that is 5 m east, half as tall, and green", { fx: "house", gold: [{ cmd: "copy", group: "@house", by: [5, 0, 0], as: "c2" }, { cmd: "scale", ids: ["@c2"], center: [5, 0, 0], factor: [1, 1, 0.5] }, { cmd: "paint", ids: ["@c2"], color: [0, 0.8, 0.1] }, { cmd: "delete", ids: ["@house"] }], check: { groups: { n: 1 }, bbox: { min: [5, 0, 0], max: [9, 3, 1.2] }, painted: [{ color: "green", where: {}, all: true }] } });

// =====================  ACCESSIBILITY (about 40)  =====================
// For people who dictate or type instead of pointing: exact numbers, positions relative to things, edit-by-sentence
// follow-ups, and questions that must be answered with read-only commands (and change nothing).
// --- precise numeric requests
A("easy", "a wall 4.2 m long, 2.4 m high, 20 cm thick starting at the origin", { gold: [{ cmd: "wall", points: [[0, 0, 0], [4.2, 0, 0]], thickness: 0.2, height: 2.4 }], check: { bbox: { size: [4.2, 0.2, 2.4], xy_any: true, tol: 0.15 }, groups: { n: 1 } } });
A("easy", "a box 3.5 meters by 2.25 meters by 1.8 meters with one corner at the origin", { gold: boxCmds(3.5, 2.25, 1.8), check: { bbox: { size: [3.5, 2.25, 1.8], xy_any: true, min: [0, 0, 0] } } });
A("easy", "a column at x 2 y 3, 0.4 m square, 3.2 m tall", { gold: [{ cmd: "column", at: [2, 3, 0], size: 0.4, height: 3.2 }], check: { bbox: { min: [1.8, 2.8, 0], max: [2.2, 3.2, 3.2], tol: 0.08 } } });
A("easy", "a flat rectangle from x 1 y 1 to x 6 y 4 on the ground", { gold: [{ cmd: "rect", from: [1, 1, 0], to: [6, 4, 0] }], check: { bbox: { min: [1, 1, 0], max: [6, 4, 0] } } });
A("easy", "a circle centered at 5 5 with a radius of 1.75 meters", { gold: [{ cmd: "circle", center: [5, 5, 0], radius: 1.75 }], check: { bbox: { min: [3.25, 3.25, 0], max: [6.75, 6.75, 0], tol: 0.1 } } });
A("easy", "a staircase rising 2.8 meters, 1.1 meters wide, starting at x 3 y 0", { gold: [{ cmd: "stairs", at: [3, 0, 0], rise: 2.8, width: 1.1 }], check: { bbox: { size: [null, null, 2.8], xy_has: 1.1, tol: 0.1 } } });
A("easy", "a tree at x 12 y 8", { gold: [{ cmd: "insert", asset: "tree", at: [12, 8, 0] }], check: { instances: { name: "tree", n: 1 } } });
A("medium", "a room 5.5 m by 3.5 m with walls 25 cm thick and 2.5 m high, corner at the origin", { gold: [{ cmd: "wall", points: [[0, 0, 0], [5.5, 0, 0], [5.5, 3.5, 0], [0, 3.5, 0]], thickness: 0.25, height: 2.5, closed: true }], check: { bbox: { size: [5.75, 3.75, 2.5], xy_any: true, tol: 0.2 }, groups: { n: 1 } } });
A("medium", "a box 2 m by 2 m by 2 m centered on the origin", { gold: boxCmds(2, 2, 2, [-1, -1, 0]), check: { bbox: { min: [-1, -1, 0], max: [1, 1, 2] } } });
A("medium", "two columns 0.3 m square and 3 m tall, one at x 0 y 0 and one at x 4.5 y 0", { gold: [{ cmd: "column", at: [0, 0, 0], height: 3 }, { cmd: "column", at: [4.5, 0, 0], height: 3 }], check: { groups: { name: "column", n: 2 }, bbox: { size: [4.8, 0.3, 3], tol: 0.1 } } });
A("medium", "a wall from 0 0 to 6 0 and another from 6 0 to 6 4, both 2.7 m high and 0.2 m thick", { gold: [{ cmd: "wall", points: [[0, 0, 0], [6, 0, 0], [6, 4, 0]], thickness: 0.2, height: 2.7 }], check: { bbox: { size: [6.2, 4.2, 2.7], tol: 0.25 } } });
// --- relative requests (position relative to a named thing, in words)
A("medium", "cut a window 1.2 m wide and 1 m tall in the north wall, starting 1 m from the left end, with its sill 0.9 m up", { fx: "northwall", gold: [{ cmd: "rect", from: [1, 4, 0.9], to: [2.2, 4, 1.9] }], check: { has_face: [{ normal: [0, 1, 0], normal_abs: true, area: 1.2, x: [1.55, 1.65], z: [1.35, 1.45] }] } });
A("medium", "put a window 1 m from the left end of the north wall, 1.2 m wide, 1 m tall, sill at 1 m", { fx: "northwall", gold: [{ cmd: "rect", from: [1, 4, 1], to: [2.2, 4, 2] }], check: { has_face: [{ normal: [0, 1, 0], normal_abs: true, area: 1.2, x: [1.55, 1.65], z: [1.45, 1.55] }] } });
A("medium", "make a door opening 0.9 m wide and 2.1 m tall in the north wall, centered", { fx: "northwall", gold: [{ cmd: "rect", from: [2.55, 4, 0], to: [3.45, 4, 2.1] }], check: { has_face: [{ normal: [0, 1, 0], normal_abs: true, area: 1.89, x: [2.95, 3.05] }] } });
A("medium", "a 2 m cube sitting 3 m east of the house", { fx: "house", gold: boxCmds(2, 2, 2, [7, 0, 0], "cube"), check: { groups: { n: 2 }, bbox: { size: [9, 3, 2.4], tol: 0.1 } } });
A("medium", "put a copy of the house 2 m to the north of it, with a gap of 2 m between", { fx: "house", gold: [{ cmd: "copy", group: "@house", by: [0, 5, 0] }], check: { groups: { n: 2 }, bbox: { size: [4, 8, 2.4] } } });
A("medium", "a tree 3 m south of the house at its middle", { fx: "house", gold: [{ cmd: "insert", asset: "tree", at: [2, -3, 0] }], check: { instances: { name: "tree", n: 1 }, groups: { n: 1 } } });
A("medium", "place group b directly on top of group a", { fx: "pair", gold: [{ cmd: "move", ids: ["@b"], by: [-3, 0, 1] }], check: { part_at: [{ group: "^b$", min: [0, 0, 1], max: [1, 1, 2] }, { group: "^a$", min: [0, 0, 0], max: [1, 1, 1] }] } });
A("medium", "slide group a 1 m toward group b", { fx: "pair", gold: [{ cmd: "move", ids: ["@a"], by: [1, 0, 0] }], check: { part_at: [{ group: "^a$", min: [1, 0, 0], max: [2, 1, 1] }, { group: "^b$", min: [3, 0, 0] }] } });
A("hard", "a second room of the same size attached to the east side of the room, sharing the east wall", { fx: "room", gold: [{ cmd: "copy", group: "@room", by: [6, 0, 0] }], check: { bbox: { size: [12.2, 4.2, 2.4], tol: 0.25 }, groups: { min: 2 } } });
A("hard", "a door in the middle of the south wall of the room and a window in the middle of the north wall", { fx: "room", gold: [{ cmd: "insert", asset: "door", at: [2.5, 0, 0] }, { cmd: "insert", asset: "window", at: [2.4, 4, 1] }], check: { instances: { name: "door", min: 1 }, groups: { n: 1 } } });
// --- edit-by-sentence follow-ups (on an existing model; the context says what the last request was)
A("easy", "make it 5 meters instead", { fx: "wide", gold: [{ cmd: "scale", ids: ["@house"], center: [0, 0, 0], factor: [1.25, 1, 1] }], check: { bbox: { size: [5, 3, 2.4] } } });
A("easy", "make it taller by 1 meter", { fx: "wide", gold: [{ cmd: "scale", ids: ["@house"], center: [0, 0, 0], factor: [1, 1, 3.4 / 2.4] }], check: { bbox: { size: [4, 3, 3.4] } } });
A("easy", "undo that", { fx: "moved", gold: [{ cmd: "undo" }], check: { bbox: { min: [0, 0, 0], max: [4, 3, 2.4] } } });
A("easy", "move it back 5 meters", { fx: "moved", gold: [{ cmd: "move", ids: ["@house"], by: [-5, 0, 0] }], check: { bbox: { min: [0, 0, 0], max: [4, 3, 2.4] } } });
A("easy", "move the door 1 m left", { fx: "roomdoor", gold: [{ cmd: "move", ids: ["@door"], by: [-1, 0, 0] }], check: { part_at: [{ group: "^door$", min: [1.5, null, 0], max: [2.5, null, 2.1] }] } });
A("easy", "move the door 0.5 m to the right", { fx: "roomdoor", gold: [{ cmd: "move", ids: ["@door"], by: [0.5, 0, 0] }], check: { part_at: [{ group: "^door$", min: [3, null, 0], max: [4, null, 2.1] }] } });
A("easy", "move it 2 meters up", { fx: "wide", gold: [{ cmd: "move", ids: ["@house"], by: [0, 0, 2] }], check: { bbox: { min: [0, 0, 2], max: [4, 3, 4.4] } } });
A("medium", "a bit wider: add 1 meter to the width", { fx: "wide", gold: [{ cmd: "scale", ids: ["@house"], center: [0, 0, 0], factor: [1.25, 1, 1] }], check: { bbox: { size: [5, 3, 2.4] } } });
A("medium", "make it red and move it 3 meters north", { fx: "wide", gold: [{ cmd: "paint", ids: ["@house"], color: [1, 0, 0] }, { cmd: "move", ids: ["@house"], by: [0, 3, 0] }], check: { painted: [{ color: "red", where: { group: "house" }, all: true }], bbox: { min: [0, 3, 0], max: [4, 6, 2.4] } } });
A("medium", "undo that and then move the house 2 m east", { fx: "moved", gold: [{ cmd: "undo" }, { cmd: "move", ids: ["@house"], by: [2, 0, 0] }], check: { bbox: { min: [2, 0, 0], max: [6, 3, 2.4] } } });
A("medium", "make the door twice as wide, keeping its left edge", { fx: "roomdoor", gold: [{ cmd: "scale", ids: ["@door"], center: [2.5, 0, 0], factor: [2, 1, 1] }], check: { part_at: [{ group: "^door$", min: [2.5, null, 0], max: [4.5, null, 2.1] }] } });
A("medium", "rotate it a quarter turn about the origin", { fx: "wide", gold: [{ cmd: "rotate", ids: ["@house"], center: [0, 0, 0], angle: 90 }], check: { bbox: { min: [-3, 0, 0], max: [0, 4, 2.4] } } });
A("hard", "change the width to 6 meters and the height to 3, and make it blue", { fx: "wide", gold: [{ cmd: "scale", ids: ["@house"], center: [0, 0, 0], factor: [1.5, 1, 1.25] }, { cmd: "paint", ids: ["@house"], color: [0, 0, 1] }], check: { bbox: { size: [6, 3, 3] }, painted: [{ color: "blue", where: { group: "house" }, all: true }] } });
A("hard", "move the door 1 m left and raise it 0.1 m", { fx: "roomdoor", gold: [{ cmd: "move", ids: ["@door"], by: [-1, 0, 0.1] }], check: { part_at: [{ group: "^door$", min: [1.5, null, 0.1], max: [2.5, null, 2.2] }] } });
// --- questions: must be answered with read-only commands and change nothing (graded: model unchanged + an inspect command ran)
for (const [fx, q] of [["room", "how big is the room?"], ["room", "what's in the model?"], ["house", "how tall is the house?"], ["house", "what's the volume of the house?"], ["roomdoor", "what's on the south wall?"], ["roomdoor", "is there a door? where is it?"], ["pair", "how far apart are a and b?"], ["pair", "how many things are there and what are they called?"], ["moved", "where is the house now?"], ["wide", "how wide is it?"]])
  A(q.includes("volume") ? "medium" : "easy", q, { fx, gold: [q.includes("volume") ? { cmd: "volume", id: "@house" } : { cmd: "parts" }], check: { readonly: true } });

// ---------- write ----------
mkdirSync(join(here, "fixtures"), { recursive: true });
for (const [k, f] of Object.entries(fixtures)) writeFileSync(join(here, "fixtures", `${k}.jsonl`), `# ${f.desc}\n` + f.commands.map((c) => JSON.stringify(c)).join("\n") + "\n");
writeFileSync(join(here, "fixtures.json"), JSON.stringify(Object.fromEntries(Object.entries(fixtures).map(([k, f]) => [k, f.desc])), null, 1) + "\n");
writeFileSync(join(here, "cases.jsonl"), cases.map((c) => JSON.stringify(c)).join("\n") + "\n");
const t = { easy: 0, medium: 0, hard: 0 };
cases.forEach((c) => t[c.tier]++);
console.log(cases.length, "cases", t);
