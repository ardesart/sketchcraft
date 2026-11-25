// v3 targeted templates for the SketchCraftAI minimodel: they teach the failure families of the v2 model
// (see README "Training data (v3)"). Same contract as gen/templates.mjs: each template samples parameters and returns
// {fx, request, commands, check}; the check is computed from the INTENT (the request's numbers), never from the
// commands, and gen_data.mjs verifies every pair in the engine and against lib/heldout.mjs.
//
// Conventions taught (taken from what the eval checks, not from its sentences):
//   "N between them" / "with a gap of N" = the GAP between objects; "N apart" / "every N" / "N to the east" /
//   "array X n times, N apart" = origin-to-origin (center-to-center) offset; "array X n times" = n copies IN TOTAL.
//   "a box ... at x X, y Y" = the box's min (south-west, lower) corner is at (X, Y); "centered at" is the center.
//   Non-rectangular plans use polygon / circle; vertical rects have one equal coordinate (never a zero-width rect).
//   roof: {face: id (the top face), kind, pitch}. mirror is not in the agent allowlist: a box's mirror image is a copy.
import { W, COLORS, DIRS, addV, article, boxCmds, count, deg, fmt, fxFacade, fxHouse, fxTower, fxLast, fxRoomDoor, fxRoom, len, metric, r4, roofRise, scaleV } from "./templates.mjs";

export const V3 = [];
const F = (family, name, weight, fn) => V3.push({ name: `${family}_${name}`, family, tier: "medium", cat: "v3", weight, fn });
const M = (r, v) => metric(r, v);
const mm = (r, v) => `${fmt(v)}${r.pick([" m", " m", " meters", " metres"])}`;
const AXV = (axis, d) => (axis === "x" ? [d, 0, 0] : [0, d, 0]);
const AXTXT = { x: ["", "", " along x", " running east", " from west to east", " along the x axis"], y: [" along y", " running north", " from front to back", " along the y axis", " going north"] };

// ---------------------------------------------------------------- family 1: spacing words
F("f1", "row", 220, (r) => {
  const n = r.int(2, 7), axis = r.pick(["x", "x", "y"]);
  const cube = r.chance(0.5);
  let w, d, h, desc;
  if (cube) { w = d = h = r.step(0.5, 3, 0.5); desc = r.pick([`${M(r, w)} cubes`, `${fmt(w)} m cubes`, `${M(r, w)} blocks`, `cubes ${M(r, w)} on a side`, `${M(r, w)} crates`]); }
  else { w = r.step(0.5, 3, 0.5); d = r.step(0.5, 3, 0.5); h = r.step(0.5, 3, 0.5); desc = r.pick([`${fmt(w)} by ${fmt(d)} by ${fmt(h)} m boxes`, `${fmt(w)} x ${fmt(d)} x ${fmt(h)} blocks`, `boxes ${fmt(w)} by ${fmt(d)} and ${fmt(h)} tall`]); }
  const span = axis === "x" ? w : d;
  const ax = r.pick(AXTXT[axis]);
  const useGap = r.chance(0.5);
  let g, by, req;
  const N = W[n];
  if (useGap) {
    g = r.step(0.5, 6, 0.5); by = r4(span + g);
    const G = M(r, g);
    req = r.pick([`${N} ${desc} in a row${ax}, ${G} between them`, `${N} ${desc}${ax} with ${G} between each one`, `a row of ${N} ${desc}${ax}, leaving a ${G} gap between neighbours`, `line up ${N} ${desc}${ax} with ${G} of clear space between them`, `${N} ${desc}, ${G} between neighbours${ax}`, `put ${N} ${desc} in a line${ax} so there is ${G} of space between each pair`, `${N} ${desc} side by side${ax} with gaps of ${G}`]);
  } else {
    by = r4(span + r.step(0.5, 5, 0.5));
    const P = M(r, by);
    req = r.pick([`${N} ${desc} in a row${ax}, ${P} apart`, `${N} ${desc}${ax} spaced ${P} apart`, `${N} ${desc} every ${P}${ax}`, `${N} ${desc}${ax}, ${P} center to center`, `a row of ${N} ${desc}${ax} on a ${P} spacing`, `${N} ${desc}${ax}, each ${P} from the last`, `${N} ${desc} in a line${ax} with ${P} between their centers`]);
  }
  const bbox = axis === "x" ? [r4((n - 1) * by + w), d, h] : [w, r4((n - 1) * by + d), h];
  return { request: req, commands: [...boxCmds(0, 0, 0, w, d, h, "box"), { cmd: "array", ids: ["@box"], by: AXV(axis, by), count: n - 1 }], check: { groups: { n }, bbox: { size: bbox } } };
});

F("f1", "array", 200, (r) => {
  const fx = r.chance(0.8) ? fxHouse(r, { at: false, sel: false }) : fxTower(r);
  const nm = fx.name, axis = r.pick(["x", "x", "y"]);
  const span = axis === "x" ? fx.w : fx.d;
  const n = r.int(2, 6), ax = r.pick(AXTXT[axis]);
  const mode = r.pick(["pitch", "pitch", "gap", "more"]);
  let by, total = n, req, k = n - 1;
  const N = count(r, n);
  if (mode === "pitch") {
    by = r4(span + r.step(0.5, 8, 0.5));
    const P = M(r, by);
    req = r.pick([`array the ${nm} ${N} times${ax}, ${P} apart`, `${N} of the ${nm} in a row${ax}, ${P} apart`, `repeat the ${nm} to get ${N} in total${ax}, ${P} apart`, `make a row of ${N} ${nm}s${ax} spaced ${P} apart`, `array the ${nm}: ${N} in all, every ${P}${ax}`, `${N} copies of the ${nm} in total, ${P} apart${ax}`]);
  } else if (mode === "gap") {
    const g = r.step(0.5, 8, 0.5); by = r4(span + g);
    const G = M(r, g);
    req = r.pick([`array the ${nm} ${N} times${ax} with ${G} between them`, `${N} ${nm}s in a row${ax}, ${G} between each`, `lay out ${N} of the ${nm}${ax} leaving ${G} of space between neighbours`, `make ${N} ${nm}s in total${ax} with a ${G} gap between each pair`]);
  } else {
    k = n; total = n + 1;
    by = r4(span + r.step(0.5, 8, 0.5));
    const P = M(r, by);
    req = r.pick([`add ${N} more copies of the ${nm}${ax}, ${P} apart`, `${N} extra ${nm}s${ax} spaced ${P} apart from the first`, `array the ${nm} ${N} more times${ax}, ${P} apart`]);
  }
  const size = [fx.w, fx.d, fx.h]; size[axis === "x" ? 0 : 1] = r4((total - 1) * by + span);
  return { fx, request: req, commands: [{ cmd: "array", ids: [`@${nm}`], by: AXV(axis, by), count: k }], check: { groups: { n: total }, bbox: { size } } };
});

F("f1", "second", 130, (r) => {
  const noun = r.pick(["tower", "pillar", "crate", "kiosk", "shed", "block", "post", "plinth", "stand", "locker"]);
  const w = r.step(0.5, 4, 0.5), d = r.chance(0.5) ? w : r.step(0.5, 4, 0.5), h = r.step(0.5, 8, 0.5);
  const dir = r.pick(["east", "west", "north", "south"]), horiz = dir === "east" || dir === "west";
  const span = horiz ? w : d;
  const gapMode = r.chance(0.35);
  let dist, req;
  const dims = w === d ? `${M(r, w)} square and ${M(r, h)} tall` : `${fmt(w)} by ${fmt(d)} m and ${M(r, h)} tall`;
  const first = r.pick([`a ${noun}, ${dims}`, `${article(M(r, h) + " tall " + noun)} that is ${w === d ? M(r, w) + " square" : fmt(w) + " by " + fmt(d) + " m"}`, `build a ${noun} ${dims}`]);
  if (gapMode) {
    const g = r.step(0.5, 6, 0.5); dist = r4(span + g);
    req = r.pick([`${first}, plus an identical one to the ${dir} with ${M(r, g)} between them`, `${first}, and a second one to the ${dir} leaving a ${M(r, g)} gap`, `${first} and a copy of it ${M(r, g)} clear to the ${dir}`]);
  } else {
    dist = r4(span + r.step(0.5, 8, 0.5));
    req = r.pick([`${first}, and a second one ${M(r, dist)} to the ${dir}`, `${first}, then another identical one ${M(r, dist)} ${dir} of it`, `${first} and a twin ${M(r, dist)} to the ${dir}`, `${first}; add a second one moved ${M(r, dist)} ${dir}`]);
  }
  const by = scaleV(DIRS[dir], dist);
  const size = [w, d, h]; size[horiz ? 0 : 1] = r4(dist + span);
  return { request: req, commands: [...boxCmds(0, 0, 0, w, d, h, noun), { cmd: "copy", group: `@${noun}`, by }], check: { groups: { n: 2 }, bbox: { size } } };
});

F("f1", "copy_fx", 130, (r) => {
  const fx = fxHouse(r, { sel: false });
  const nm = fx.name, dir = r.pick(["east", "west", "north", "south"]), horiz = dir === "east" || dir === "west";
  const span = horiz ? fx.w : fx.d;
  const mode = r.pick(["offset", "gap", "gap_same"]);
  let dist, req;
  if (mode === "offset") {
    dist = r4(span + r.step(0.5, 8, 0.5));
    req = r.pick([`copy the ${nm} ${M(r, dist)} to the ${dir}`, `make a duplicate of the ${nm}, moved ${M(r, dist)} ${dir}`, `put a second ${nm} ${M(r, dist)} ${dir}, same size`, `duplicate the ${nm} and shift the copy ${M(r, dist)} ${dir}`]);
  } else {
    const g = mode === "gap_same" ? r.step(1, 6, 0.5) : r.step(0.5, 6, 0.5);
    dist = r4(span + g);
    req = mode === "gap_same"
      ? r.pick([`put a copy of the ${nm} ${M(r, g)} to the ${dir} of it, with a gap of ${M(r, g)} between`, `a copy of the ${nm} ${M(r, g)} ${dir}, with ${M(r, g)} of space between the two`])
      : r.pick([`put a copy of the ${nm} to the ${dir} of it with a ${M(r, g)} gap between them`, `a second ${nm} to the ${dir}, leaving ${M(r, g)} between the two`, `copy the ${nm} ${dir}ward so there is ${M(r, g)} between the walls`, `add a copy of the ${nm} on the ${dir} side with ${M(r, g)} of clear space`]);
  }
  const by = scaleV(DIRS[dir], dist);
  const size = [fx.w, fx.d, fx.h]; size[horiz ? 0 : 1] = r4(dist + span);
  return { fx, request: req, commands: [{ cmd: "copy", group: `@${nm}`, by }], check: { groups: { n: 2 }, bbox: { size } } };
});

F("f1", "mid", 100, (r) => {
  const fx = fxHouse(r, { at: false, sel: false });
  const nm = fx.name, n = r.pick([3, 3, 5, 4]);
  const idx = n === 4 ? r.pick([1, 2, 3]) : r.pick([Math.floor(n / 2), n - 1, 1]);
  const which = idx === Math.floor(n / 2) && n % 2 === 1 ? "middle" : idx === n - 1 ? r.pick(["last", "last"]) : idx === 1 ? "second" : idx === 2 ? "third" : "last";
  const gapMode = r.chance(0.3);
  const span = fx.w;
  let by, sp;
  if (gapMode) { const g = r.step(1, 8, 0.5); by = r4(span + g); sp = `with ${M(r, g)} between them`; }
  else { by = r4(span + r.step(1, 8, 1)); sp = `${M(r, by)} apart`; }
  const [k, ktxt] = r.pick([[2, "twice as tall"], [3, "three times as tall"], [2, "double the height"], [1.5, "1.5 times as tall"], [0.5, "half as tall"], [4, "four times as high"]]);
  const N = count(r, n);
  const req = r.pick([`${N} ${nm}s in a row, ${sp}, the ${which} one ${ktxt}`, `a row of ${N} ${nm}s ${sp} with the ${which} one ${ktxt}`, `line up ${N} ${nm}s ${sp}; make the ${which} one ${ktxt}`]);
  const cmds = [];
  for (let i = 1; i < n; i++) cmds.push({ cmd: "copy", group: `@${nm}`, by: [r4(by * i), 0, 0], as: `c${i}` });
  const tgt = idx === 0 ? `@${nm}` : `@c${idx}`;
  cmds.push({ cmd: "scale", ids: [tgt], center: [r4(by * idx), 0, 0], factor: [1, 1, k] });
  return { fx, request: req, commands: cmds, check: { groups: { n }, bbox: { size: [r4((n - 1) * by + span), fx.d, r4(Math.max(1, k) * fx.h)] } } };
});

// ---------------------------------------------------------------- family 2: "at x, y" = the min corner
F("f2", "box_at", 300, (r) => {
  const w = r.step(0.5, 8, 0.5), d = r.step(0.5, 8, 0.5), h = r.step(0.5, 6, 0.5);
  const x = r.chance(0.7) ? r.step(-30, 30, 1) : r.step(-20, 20, 0.5), y = r.chance(0.7) ? r.step(-30, 30, 1) : r.step(-20, 20, 0.5);
  const centered = r.chance(0.2);
  const cube = w === d && r.chance(0.5);
  const dims = r.pick([`${fmt(w)} by ${fmt(d)} by ${fmt(h)}`, `${fmt(w)} x ${fmt(d)} x ${fmt(h)} m`, `${fmt(w)}m by ${fmt(d)}m by ${fmt(h)}m`]);
  const item = r.pick(["box", "block", "slab", "crate", "volume", "solid"]);
  let req, x0 = x, y0 = y;
  if (centered) {
    x0 = r4(x - w / 2); y0 = r4(y - d / 2);
    req = r.pick([`a ${item} ${dims} centered at x ${fmt(x)}, y ${fmt(y)}`, `a ${dims} ${item} with its center at (${fmt(x)}, ${fmt(y)})`, `${dims} ${item}, centered on x ${fmt(x)} y ${fmt(y)}`]);
  } else {
    req = r.pick([
      `a ${item} ${dims} at x ${fmt(x)}, y ${fmt(y)}`, `a ${dims} ${item} at x=${fmt(x)}, y=${fmt(y)}`, `a ${dims} ${item} with its corner at ${fmt(x)}, ${fmt(y)}`,
      `${dims} ${item} starting at (${fmt(x)}, ${fmt(y)})`, `a ${dims} ${item} positioned at x ${fmt(x)} and y ${fmt(y)}`, `a ${item} ${dims}, lower left corner at (${fmt(x)}, ${fmt(y)})`,
      `a ${item} ${dims} whose south-west corner is at ${fmt(x)}, ${fmt(y)}`, `put a ${dims} ${item} at ${fmt(x)}, ${fmt(y)}`, `a ${dims} ${item} placed at x ${fmt(x)} y ${fmt(y)} on the ground`,
    ]);
  }
  if (cube) { /* keep dims text as given */ }
  const grouped = r.chance(0.25);
  return { request: req, commands: boxCmds(x0, y0, 0, w, d, h, grouped ? item : null), check: { bbox: { min: [x0, y0, 0], max: [r4(x0 + w), r4(y0 + d), h] } } };
});

// ---------------------------------------------------------------- family 3: polygons, circles, vertical faces
const ptxt = (r, pts) => {
  const f = pts.map(([x, y]) => [fmt(x), fmt(y)]);
  return r.pick([f.map(([x, y]) => `(${x},${y})`).join(", "), f.map(([x, y]) => `(${x}, ${y})`).join(", "), f.map(([x, y]) => `${x},${y}`).join(" -> "), f.map(([x, y]) => `x ${x} y ${y}`).join("; "), f.map(([x, y]) => `(${x} ${y})`).join(" ")]);
};
const bboxOf = (pts) => { const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); return { min: [Math.min(...xs), Math.min(...ys)], max: [Math.max(...xs), Math.max(...ys)] }; };
const area2 = (p) => Math.abs(p.reduce((a, q, i) => a + (q[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * q[1]), 0)) / 2;
F("f3", "prism", 170, (r) => {
  const kind = r.pick(["tri", "tri", "tri", "trap", "house", "Lshape", "quad"]);
  let pts, nm;
  if (kind === "tri") {
    do { pts = [0, 1, 2].map(() => [r.int(-3, 9), r.int(-3, 9)]); } while (area2(pts) < 3);
    nm = r.pick(["a triangular prism", "a wedge-shaped block", "a prism with a triangular base", "a triangle extruded into a prism"]);
  } else if (kind === "trap") {
    const a = r.int(4, 10), b = r.int(1, Math.floor(a / 2) - 1 || 1), c = r.int(2, 6), x0 = r.int(-2, 4), y0 = r.int(-2, 4);
    pts = [[x0, y0], [x0 + a, y0], [x0 + a - b, y0 + c], [x0 + b, y0 + c]];
    nm = r.pick(["a trapezoidal prism", "a block with a trapezoid base", "a prism whose base is a trapezoid"]);
  } else if (kind === "house") {
    const w = r.int(3, 9), h1 = r.int(2, 5), h2 = h1 + r.int(1, 3), x0 = r.int(0, 3), y0 = r.int(0, 3);
    pts = [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h1], [x0 + w / 2, y0 + h2], [x0, y0 + h1]];
    nm = r.pick(["a pentagonal prism", "a prism with a house-shaped (pentagon) base", "a block with a five-sided base"]);
  } else if (kind === "Lshape") {
    const A = r.int(5, 10), B = r.int(5, 9), c = r.int(2, A - 2), dn = r.int(2, B - 2);
    pts = [[0, 0], [A, 0], [A, B - dn], [A - c, B - dn], [A - c, B], [0, B]];
    nm = r.pick(["an L-shaped prism", "an L-shaped block", "a prism with an L-shaped footprint"]);
  } else {
    const x0 = r.int(0, 4), y0 = r.int(0, 4), a = r.int(3, 8), b = r.int(3, 7), s = r.int(1, 2);
    pts = [[x0, y0], [x0 + a, y0 + s], [x0 + a - 1, y0 + b], [x0 - 1, y0 + b - s]];
    nm = r.pick(["a four-sided prism", "a quadrilateral prism", "a prism with a four-sided base"]);
  }
  const hh = r.step(0.5, 6, 0.5);
  const req = r.pick([`${nm}: base points ${ptxt(r, pts)}, ${M(r, hh)} tall`, `${nm} through the points ${ptxt(r, pts)}, extruded ${M(r, hh)} up`, `draw the polygon ${ptxt(r, pts)} and pull it up ${M(r, hh)} to make ${nm.replace(/^an? /, "a ")}`, `${nm}, footprint ${ptxt(r, pts)}, height ${M(r, hh)}`, `extrude the shape with corners ${ptxt(r, pts)} by ${M(r, hh)}`]);
  const b = bboxOf(pts);
  return { request: req, commands: [{ cmd: "polygon", points: pts.map(([x, y]) => [x, y, 0]), as: "p" }, { cmd: "pushpull", face: "@p", distance: hh, toward: [0, 0, 1] }], check: { bbox: { min: [b.min[0], b.min[1], 0], max: [b.max[0], b.max[1], hh] } } };
});

F("f3", "ngon", 60, (r) => {
  const n = r.pick([5, 6, 8]), R = r.step(1, 5, 0.5), hh = r.step(0.5, 5, 0.5), cx = r.chance(0.4) ? r.step(-6, 6, 1) : 0, cy = r.chance(0.4) ? r.step(-6, 6, 1) : 0;
  const pts = Array.from({ length: n }, (_, i) => [r4(cx + R * Math.cos((2 * Math.PI * i) / n)), r4(cy + R * Math.sin((2 * Math.PI * i) / n)), 0]);
  const name = { 5: "pentagonal", 6: "hexagonal", 8: "octagonal" }[n];
  const where = cx || cy ? ` centered at ${fmt(cx)}, ${fmt(cy)}` : "";
  const req = r.pick([`a regular ${name} prism, ${M(r, R)} from center to corner${where}, ${M(r, hh)} tall`, `a ${name} column with circumradius ${M(r, R)}${where} and height ${M(r, hh)}`, `${article(name)} prism${where}: corners ${M(r, R)} from the center, ${M(r, hh)} high`]);
  const b = bboxOf(pts);
  return { request: req, commands: [{ cmd: "polygon", points: pts, as: "p" }, { cmd: "pushpull", face: "@p", distance: hh, toward: [0, 0, 1] }], check: { bbox: { min: [b.min[0], b.min[1], 0], max: [b.max[0], b.max[1], hh], tol: 0.08 } } };
});

F("f3", "gazebo", 110, (r) => {
  const n = r.pick([3, 4, 5, 6, 8, 10]), R = r.step(1.5, 6, 0.5), ch = r.step(2, 4, 0.5), t = r.step(0.1, 0.5, 0.1);
  const round = r.chance(0.75), Rs = r4(R + r.step(0.5, 1.5, 0.5));
  const cols = Array.from({ length: n }, (_, i) => ({ cmd: "column", at: [r4(R * Math.cos((2 * Math.PI * i) / n)), r4(R * Math.sin((2 * Math.PI * i) / n)), 0], height: ch }));
  const thing = r.pick(["a gazebo", "a pavilion", "a bandstand", "a rotunda", "a round pavilion"]);
  const cw = (k) => (k <= 12 ? W[k] : String(k));
  const roofTxt = round ? r.pick([`a round slab roof ${M(r, 2 * Rs)} across and ${M(r, t)} thick`, `a disc roof of radius ${M(r, Rs)}, ${M(r, t)} thick`, `a circular roof slab ${M(r, 2 * Rs)} in diameter, ${M(r, t)} thick`]) : r.pick([`a square slab roof ${M(r, 2 * Rs)} wide and ${M(r, t)} thick`, `a flat square roof ${M(r, 2 * Rs)} each way, ${M(r, t)} thick`]);
  const req = r.pick([`${thing}: ${cw(n)} columns ${M(r, ch)} tall spaced evenly on a circle of radius ${M(r, R)}, and ${roofTxt} on top`, `${thing} with ${cw(n)} ${M(r, ch)} columns around a ${M(r, R)} radius circle, topped by ${roofTxt}`, `${cw(n)} columns, ${M(r, ch)} high, on a circle of radius ${M(r, R)} around the origin, and ${roofTxt} resting on them`]);
  const roof = round
    ? [{ cmd: "circle", center: [0, 0, ch], radius: Rs, as: "rf" }, { cmd: "pushpull", face: "@rf", distance: t, toward: [0, 0, 1] }]
    : [{ cmd: "rect", from: [-Rs, -Rs, ch], to: [Rs, Rs, ch], as: "rf" }, { cmd: "pushpull", face: "@rf", distance: t, toward: [0, 0, 1] }];
  return { request: req, commands: [...cols, ...roof], check: { groups: { name: "column", n }, bbox: { size: [r4(2 * Rs), r4(2 * Rs), r4(ch + t)], tol: 0.15 } } };
});

F("f3", "stack", 110, (r) => {
  const n = r.int(2, 4), t = r.step(0.25, 1.5, 0.25);
  const rect = r.chance(0.3);
  const base = r.step(4, 12, 1) + 2 * n, ratio = r.step(2, 8, 2);
  const sizes = [], depths = [];
  for (let i = 0; i < n; i++) { sizes.push(r4(base - i * 2 * (r.chance(0) ? 1 : Math.max(1, Math.floor((base - 1) / (2 * n)))))); }
  for (let i = 0; i < n; i++) depths.push(rect ? r4(sizes[i] - ratio < 1 ? sizes[i] : sizes[i] - ratio) : sizes[i]);
  if (sizes.some((s, i) => s < 1 || depths[i] < 1 || (i && (s >= sizes[i - 1] || depths[i] >= depths[i - 1])))) return null;
  const list = sizes.map((s, i) => (rect ? `${fmt(s)} by ${fmt(depths[i])}` : fmt(s)));
  const listTxt = list.length > 1 ? list.slice(0, -1).join(", ") + " and " + list.at(-1) : list[0];
  const sh = rect ? "" : "square ";
  const req = r.pick([
    `a stepped pyramid: ${count(r, n)} ${sh}slabs ${listTxt} m, each ${M(r, t)} thick, every one centered on the one below`,
    `stack ${count(r, n)} ${sh}slabs, ${listTxt} m, ${M(r, t)} thick each, centered on top of each other with the biggest at the bottom`,
    `a ziggurat of ${count(r, n)} layers (${listTxt} m), each layer ${M(r, t)} high, centered`,
  ]);
  const cmds = [];
  const W0 = sizes[0], D0 = depths[0];
  for (let i = 0; i < n; i++) {
    const x = r4((W0 - sizes[i]) / 2), y = r4((D0 - depths[i]) / 2), z = r4(i * t);
    cmds.push({ cmd: "rect", from: [x, y, z], to: [r4(x + sizes[i]), r4(y + depths[i]), z], as: `s${i}` }, { cmd: "pushpull", face: `@s${i}`, distance: t, toward: [0, 0, 1] });
  }
  return { request: req, commands: cmds, check: { bbox: { size: [W0, D0, r4(n * t)] } } };
});

F("f3", "vertical", 100, (r) => {
  const plane = r.pick(["y", "x"]); // y: runs along x (a facade); x: runs along y
  const wd = r.step(1, 10, 0.5), ht = r.step(0.5, 6, 0.5), a0 = r.chance(0.5) ? r.step(-5, 8, 1) : 0, z0 = r.chance(0.25) ? r.step(0.5, 3, 0.5) : 0, P = r.chance(0.4) ? r.step(-5, 8, 1) : 0;
  const thick = r.chance(0.45) ? r.step(0.1, 0.5, 0.1) : null;
  const from = plane === "y" ? [a0, P, z0] : [P, a0, z0], to = plane === "y" ? [r4(a0 + wd), P, r4(z0 + ht)] : [P, r4(a0 + wd), r4(z0 + ht)];
  const orient = plane === "y" ? r.pick(["in the xz plane", "facing north and south", "running along x"]) : r.pick(["in the yz plane", "facing east and west", "running along y"]);
  const at = a0 || P ? ` starting at ${plane === "y" ? `x ${fmt(a0)}, y ${fmt(P)}` : `x ${fmt(P)}, y ${fmt(a0)}`}` : "";
  const lift = z0 ? `, bottom edge ${M(r, z0)} up` : "";
  let req, cmds, check;
  if (!thick) {
    req = r.pick([`a vertical rectangle ${M(r, wd)} wide and ${M(r, ht)} tall ${orient}${at}${lift}`, `a flat upright panel, ${M(r, wd)} by ${M(r, ht)}, ${orient}${at}${lift}`, `a ${fmt(wd)} x ${fmt(ht)} m vertical face ${orient}${at}${lift}`]);
    cmds = [{ cmd: "rect", from, to, as: "v" }];
    check = { has_face: [{ normal: plane === "y" ? [0, 1, 0] : [1, 0, 0], normal_abs: true, area: r4(wd * ht) }], bbox: { size: plane === "y" ? [wd, 0, ht] : [0, wd, ht] } };
  } else {
    req = r.pick([`a thin wall slab ${M(r, wd)} long, ${M(r, ht)} high and ${M(r, thick)} thick ${orient}${at}${lift}`, `a standing slab ${M(r, wd)} wide, ${M(r, ht)} tall, ${M(r, thick)} thick ${orient}${at}${lift}`]);
    cmds = [{ cmd: "rect", from, to, as: "v" }, { cmd: "pushpull", face: "@v", distance: thick, toward: plane === "y" ? [0, 1, 0] : [1, 0, 0] }];
    check = { bbox: { size: plane === "y" ? [wd, thick, ht] : [thick, wd, ht] } };
  }
  return { request: req, commands: cmds, check };
});

F("f3", "table", 100, (r) => {
  const kind = r.pick(["table", "desk", "coffee table", "workbench", "stool", "side table", "bench"]);
  const L = r.step(0.4, 2.4, 0.1), D = r.step(0.4, 1.2, 0.1), t = r.step(0.02, 0.1, 0.01), H = r.step(0.3, 1, 0.05), s = r.step(0.03, 0.1, 0.01);
  if (H - t < 0.1 || 2 * s >= Math.min(L, D)) return null;
  const sc = r.pick([`${fmt(s * 100)} cm`, `${fmt(s)} m`]), tc = r.pick([`${fmt(t * 100)} cm`, `${fmt(t)} m`]);
  const req = r.pick([`a ${kind}: top ${fmt(L)} by ${fmt(D)} m and ${tc} thick, ${fmt(H)} m high overall, with four ${sc} square legs at the corners`, `${article(kind)} with a ${fmt(L)} x ${fmt(D)} m top (${tc} thick) whose top surface is at ${fmt(H)} m, on four ${sc} square legs, one at each corner`, `${article(kind)} ${fmt(H)} m tall: ${fmt(L)} by ${fmt(D)} m top, ${tc} thick, four square legs ${sc} wide in the corners`]);
  const legH = r4(H - t), cmds = [];
  [[0, 0], [r4(L - s), 0], [r4(L - s), r4(D - s)], [0, r4(D - s)]].forEach(([x, y], i) => cmds.push({ cmd: "rect", from: [x, y, 0], to: [r4(x + s), r4(y + s), 0], as: `l${i}` }, { cmd: "pushpull", face: `@l${i}`, distance: legH, toward: [0, 0, 1] }));
  cmds.push({ cmd: "rect", from: [0, 0, legH], to: [L, D, legH], as: "top" }, { cmd: "pushpull", face: "@top", distance: t, toward: [0, 0, 1] });
  return { request: req, commands: cmds, check: { bbox: { size: [L, D, H], tol: 0.06 } } };
});

F("f3", "cap", 70, (r) => {
  const fx = fxTower(r);
  const s = fx.w, W = r.step(Math.max(1, s - 1), 6, 0.5), T = r.step(0.2, 1, 0.1);
  const x = r4(s / 2 - W / 2);
  const req = r.pick([`a ${M(r, fx.h)} tall ${fx.name} with a ${M(r, W)} wide, ${M(r, T)} thick slab balanced on top, centered on it`, `put a ${M(r, W)} square slab, ${M(r, T)} thick, on top of the ${fx.name}, centered`, `cap the ${fx.name} with a ${M(r, T)} thick slab ${M(r, W)} wide, centered over it`]);
  const z = fx.h;
  return { fx, request: req, commands: [{ cmd: "rect", from: [x, x, z], to: [r4(x + W), r4(x + W), z], as: "cap" }, { cmd: "pushpull", face: "@cap", distance: T, toward: [0, 0, 1] }], check: { bbox: { size: [Math.max(W, s), Math.max(W, s), r4(fx.h + T)] }, groups: { n: 1 } } };
});

F("f3", "lroom", 80, (r) => {
  const A = r.step(5, 12, 1), B = r.step(4, 10, 1), c = r.step(2, A - 2, 1), dn = r.step(2, B - 2, 1), h = r.step(2.2, 3.2, 0.1);
  const corner = r.pick(["north-east", "north-west", "south-east", "south-west"]);
  const pts = { "north-east": [[0, 0], [A, 0], [A, B - dn], [A - c, B - dn], [A - c, B], [0, B]], "north-west": [[0, 0], [A, 0], [A, B], [c, B], [c, B - dn], [0, B - dn]], "south-east": [[0, 0], [A - c, 0], [A - c, dn], [A, dn], [A, B], [0, B]], "south-west": [[c, 0], [A, 0], [A, B], [0, B], [0, dn], [c, dn]] }[corner];
  const kind = r.pick(["room", "room", "set of walls"]);
  const req = r.pick([`an L-shaped ${kind}: ${fmt(A)} by ${fmt(B)} overall with a ${fmt(c)} by ${fmt(dn)} notch cut out of the ${corner} corner, ${M(r, h)} walls`, `${article("L-shaped " + kind)}, ${fmt(A)} x ${fmt(B)} m bounding box, the ${corner} corner removed (${fmt(c)} x ${fmt(dn)}), walls ${M(r, h)} high`, `a ${fmt(A)} by ${fmt(B)} m room with the ${corner} ${fmt(c)} by ${fmt(dn)} chunk missing, so it is L-shaped; ${M(r, h)} high walls`]);
  return { request: req, commands: [{ cmd: "wall", points: pts.map(([x, y]) => [x, y, 0]), closed: true, height: h }], check: { bbox: { size: [r4(A + 0.2), r4(B + 0.2), h], tol: 0.2 }, groups: { n: 1 } } };
});

// ---------------------------------------------------------------- family 4: roofs
F("f4", "box_roof", 200, (r) => {
  const w = r.step(3, 12, 0.5), d = r.step(3, 10, 0.5), h = r.step(2, 5, 0.5);
  const kind = r.pick(["gable", "gable", "hip", "shed"]), pitch = r.pick([15, 20, 22, 25, 30, 35, 40, 45]);
  const nm = r.pick(["house", "box", "cabin", "shed", "hut", "block", "building"]);
  const ov = kind !== "shed" && r.chance(0.25) ? r.pick([0, 0.25, 0.5, 0.6]) : null;
  const ovTxt = ov == null ? "" : ov === 0 ? ", no overhang" : `, ${M(r, ov)} overhang`;
  const req = r.pick([
    `a ${kind} roof at ${deg(r, pitch)} on a ${fmt(w)} by ${fmt(d)} m ${nm} ${M(r, h)} tall${ovTxt}`, `a ${fmt(w)} x ${fmt(d)} ${nm}, ${M(r, h)} high, with a ${deg(r, pitch)} ${kind} roof${ovTxt}`,
    `build a ${nm} ${fmt(w)} m wide, ${fmt(d)} m deep and ${M(r, h)} tall, then roof it: ${kind}, ${deg(r, pitch)}${ovTxt}`, `${article(nm)} (${fmt(w)}x${fmt(d)}x${fmt(h)}) topped with a ${kind} roof pitched at ${deg(r, pitch)}${ovTxt}`,
  ]);
  const roof = { cmd: "roof", face: "@bt", kind, pitch };
  if (ov != null) roof.overhang = ov;
  const cmds = [{ cmd: "begin_group", name: nm, as: nm }, { cmd: "rect", from: [0, 0, 0], to: [w, d, 0], as: "bf" }, { cmd: "pushpull", face: "@bf", distance: h, toward: [0, 0, 1], as: "bt" }, { cmd: "end_group" }, roof];
  const check = { groups: { name: "roof", n: 1 }, roof_rise: { kind, base: h, rise: roofRise(kind, w, d, pitch), pitch } };
  if (ov != null) check.bbox = { size: [r4(w + 2 * ov), r4(d + 2 * ov), null], tol: 0.1 };
  return { request: req, commands: cmds, check };
});

F("f4", "fx_edit_roof", 120, (r) => {
  const fx = fxHouse(r, { at: false, sel: false });
  const nm = fx.name, axis = r.pick(["x", "x", "y"]), k = r.pick([2, 3, 4]);
  const kind = r.pick(["gable", "hip", "shed"]), pitch = r.pick([15, 20, 25, 30, 35, 40]);
  const span = axis === "x" ? fx.w : fx.d;
  const kw = { 2: "twice", 3: "3 times", 4: "four times" }[k];
  const req = r.pick([`make the ${nm} ${kw} longer along ${axis} only, then add a ${kind} roof at ${deg(r, pitch)}`, `stretch the ${nm} to ${kw} its ${axis === "x" ? "width" : "depth"} (${axis} only) and put a ${deg(r, pitch)} ${kind} roof on it`, `scale the ${nm} by ${k} along ${axis}, keep the other sizes, and roof it with a ${kind} roof, ${deg(r, pitch)}`]);
  const factor = axis === "x" ? [k, 1, 1] : [1, k, 1];
  const size = [fx.w, fx.d]; size[axis === "x" ? 0 : 1] = r4(span * k + 0.8);
  return { fx, request: req, commands: [{ cmd: "scale", ids: [`@${nm}`], center: [0, 0, 0], factor }, { cmd: "roof", face: "@top", kind, pitch }], check: { groups: { name: "roof", n: 1 }, bbox: kind === "shed" ? { min: [null, null, 0] } : { min: [null, null, 0], size: [size[0] + (axis === "x" ? 0 : 0.8), size[1] + (axis === "x" ? 0.8 : 0), null], tol: 0.12 } } };
});

F("f4", "street", 100, (r) => {
  const n = r.int(2, 5), kind = r.pick(["gable", "gable", "hip"]), pitch = r.pick([20, 25, 30, 35, 40, 45]);
  const sized = r.chance(0.5);
  const w = sized ? r.step(3, 6, 1) : 4, d = sized ? r.step(3, 5, 1) : 3, h = sized ? r.step(2.4, 3.2, 0.2) : 2.4;
  const gapMode = r.chance(0.3);
  let sp, spTxt;
  if (gapMode) { const g = r.step(2, 6, 1); sp = r4(w + g); spTxt = `${M(r, g)} between them`; } else { sp = r4(w + r.step(2, 6, 1)); spTxt = `${M(r, sp)} apart`; }
  const dims = sized ? ` (${fmt(w)} x ${fmt(d)} x ${fmt(h)})` : "";
  const req = r.pick([`a street of ${count(r, n)} houses${dims} ${spTxt} along x, each with a ${deg(r, pitch)} ${kind} roof`, `${count(r, n)} houses${dims} in a row, ${spTxt}, every one with a ${kind} roof at ${deg(r, pitch)}`, `row of ${count(r, n)} houses${dims} along x, ${spTxt}, roofs: ${kind}, ${deg(r, pitch)}`]);
  const cmds = [];
  for (let i = 0; i < n; i++) { const x = r4(i * sp); cmds.push({ cmd: "begin_group", name: `h${i}`, as: `h${i}` }, { cmd: "rect", from: [x, 0, 0], to: [r4(x + w), d, 0], as: `f${i}` }, { cmd: "pushpull", face: `@f${i}`, distance: h, toward: [0, 0, 1], as: `t${i}` }, { cmd: "end_group" }, { cmd: "roof", face: `@t${i}`, kind, pitch }); }
  return { request: req, commands: cmds, check: { groups: { name: "roof", n }, bbox: { min: [null, null, 0] } } };
});

function fxHouseRoof(r) {
  const f = fxHouse(r, { at: false, sel: false });
  const kind = r.pick(["gable", "hip", "shed"]), pitch = r.pick([20, 25, 30, 35]);
  return { ...f, kind: "houseroof", kindRoof: kind, pitch, setup: [...f.setup, { cmd: "roof", face: "@top", kind, pitch, as: "roof" }], desc: `${f.desc} A ${kind} roof (${pitch} degrees) is already on it: @roof is the roof group (a separate group on top of the ${f.name}).` };
}
F("f4", "paint", 130, (r) => {
  const mode = r.pick(["has_roof", "has_roof", "add_roof", "implied"]);
  const fx = mode === "has_roof" ? fxHouseRoof(r) : fxHouse(r, { at: false, sel: false });
  const nm = fx.name;
  const cs = r.shuffle(Object.keys(COLORS)).filter((c) => !["grey"].includes(c)), c1 = cs[0], c2 = cs.find((c) => COLORS[c][1] !== COLORS[c1][1]);
  const kind = r.pick(["gable", "hip", "shed"]), pitch = r.pick([25, 30, 35]);
  let req, cmds;
  if (mode === "has_roof") {
    req = r.pick([`paint the roof ${c1} and the walls ${c2}`, `make the ${nm} walls ${c2} and its roof ${c1}`, `${c2} walls, ${c1} roof on the ${nm}`, `color the roof of the ${nm} ${c1} and paint the rest ${c2}`]);
    cmds = [{ cmd: "paint", ids: [`@${nm}`], color: COLORS[c2][0] }, { cmd: "paint", ids: ["@roof"], color: COLORS[c1][0] }];
  } else if (mode === "add_roof") {
    req = r.pick([`give the ${nm} a ${kind} roof at ${deg(r, pitch)}, then paint the roof ${c1} and the walls ${c2}`, `put a ${deg(r, pitch)} ${kind} roof on the ${nm}; roof ${c1}, walls ${c2}`]);
    cmds = [{ cmd: "roof", face: "@top", kind, pitch, as: "r" }, { cmd: "paint", ids: [`@${nm}`], color: COLORS[c2][0] }, { cmd: "paint", ids: ["@r"], color: COLORS[c1][0] }];
  } else {
    req = r.pick([`paint the roof of the ${nm} ${c1} and the walls ${c2}`, `${nm}: ${c1} roof, ${c2} walls`, `I want the ${nm} with a ${c1} roof and ${c2} walls`]);
    cmds = [{ cmd: "roof", face: "@top", kind: "gable", pitch: 30, as: "r" }, { cmd: "paint", ids: [`@${nm}`], color: COLORS[c2][0] }, { cmd: "paint", ids: ["@r"], color: COLORS[c1][0] }];
  }
  return { fx, request: req, commands: cmds, check: { groups: { name: "roof", n: 1 }, painted: [{ color: COLORS[c2][1], where: { group: `^${nm}$` }, all: true }, { color: COLORS[c1][1], where: { group: "roof" }, all: true }] } };
});

// ---------------------------------------------------------------- family 5: openings, hollow boxes, shared walls
function fxWall(r) {
  const side = r.pick(["north", "north", "south", "east", "west"]);
  const L = r.step(3, 12, 0.5), H = r.step(2.4, 4, 0.1), other = r.step(3, 9, 0.5);
  const plane = side === "north" ? other : side === "south" ? 0 : side === "east" ? other : 0;
  const alongX = side === "north" || side === "south";
  const nm = side[0] + "wall";
  const setup = [{ cmd: "rect", from: alongX ? [0, plane, 0] : [plane, 0, 0], to: alongX ? [L, plane, H] : [plane, L, H], as: nm }];
  const ends = alongX ? "from x 0 (west end) to x " + fmt(L) + " (east end)" : "from y 0 (south end) to y " + fmt(L) + " (north end)";
  const desc = `@${nm} is the ${side} wall of a room as one flat vertical face in the plane ${alongX ? "y" : "x"} = ${fmt(plane)}, ${ends} and z 0..${fmt(H)}.${side === "north" ? " Its left end is the west end, its right end the east end." : ""} South is -y, north is +y, west is -x, east is +x.`;
  return { kind: "wall_" + side, side, L, H, plane, alongX, nm, setup, desc };
}
F("f5", "wall_window", 200, (r) => {
  const fx = fxWall(r);
  const door = r.chance(0.25);
  const w = door ? r.step(0.8, 1.2, 0.1) : r.step(0.6, 2, 0.1), h = door ? r.step(2, Math.min(2.3, fx.H - 0.2), 0.1) : r.step(0.5, 1.5, 0.1);
  const z = door ? 0 : r.step(0.5, Math.max(0.5, fx.H - h - 0.2), 0.1);
  if (z + h > fx.H - 0.1 || w > fx.L - 1) return null;
  const mode = r.pick(["end", "end", "end", "other", "center"]);
  const ends = fx.alongX ? ["west", "east"] : ["south", "north"];
  let a0, where;
  const off = r.step(0.3, Math.max(0.3, fx.L - w - 0.3), 0.1);
  if (mode === "center") { a0 = r4((fx.L - w) / 2); where = r.pick(["centered on the wall", "in the middle of it", "centered"]); }
  else if (mode === "end" || mode === "other") {
    const fromFirst = mode === "end";
    if (fx.side === "north" && r.chance(0.7)) { a0 = fromFirst ? off : r4(fx.L - off - w); where = `${M(r, off)} from the ${fromFirst ? "left" : "right"} end`; }
    else { a0 = fromFirst ? off : r4(fx.L - off - w); where = `${M(r, off)} from the ${fromFirst ? ends[0] : ends[1]} end`; }
  }
  if (a0 < 0.1 || a0 + w > fx.L - 0.1) return null;
  const what = door ? r.pick(["door opening", "doorway", "door cut-out"]) : r.pick(["window", "window", "window opening"]);
  const sillTxt = door ? "" : r.pick([`, sill at ${M(r, z)}`, `, ${M(r, z)} sill`, `, bottom ${M(r, z)} up`, `, its sill ${M(r, z)} above the floor`]);
  const req = r.pick([`put a ${what} ${where} of the ${fx.side} wall, ${M(r, w)} wide, ${M(r, h)} tall${sillTxt}`, `cut a ${what} in the ${fx.side} wall, ${where}: ${M(r, w)} wide by ${M(r, h)} tall${sillTxt}`, `${fx.side} wall: a ${M(r, w)} wide, ${M(r, h)} high ${what}, ${where}${sillTxt}`]);
  const P = fx.plane;
  const from = fx.alongX ? [a0, P, z] : [P, a0, z], to = fx.alongX ? [r4(a0 + w), P, r4(z + h)] : [P, r4(a0 + w), r4(z + h)];
  const c = r4(a0 + w / 2), cz = r4(z + h / 2);
  const hf = { normal: fx.alongX ? [0, 1, 0] : [1, 0, 0], normal_abs: true, area: r4(w * h) };
  hf[fx.alongX ? "x" : "y"] = [r4(c - 0.05), r4(c + 0.05)]; hf.z = [r4(cz - 0.05), r4(cz + 0.05)];
  return { fx, request: req, commands: [{ cmd: "rect", from: fx.alongX ? from : from, to }], check: { has_face: [hf] } };
});

F("f5", "facade_windows", 130, (r) => {
  const fx = fxFacade(r);
  const n = r.int(2, 5), s = r.pick([0.5, 0.8, 1, 1.2, 1.5]), z0 = r.step(0.5, Math.max(0.5, fx.h - s - 0.4), 0.1);
  if (z0 + s > fx.h - 0.3) return null;
  const xs = [];
  const mode = r.pick(["list", "pitch", "center"]);
  let x0, p;
  if (mode === "list") {
    // explicit left edges, increasing, no overlap, inside the facade
    let x = r.step(0.5, 1.5, 0.5);
    for (let i = 0; i < n; i++) { xs.push(x); x = r4(x + s + r.step(0.5, 2, 0.5)); }
  } else { x0 = r.step(0.5, 1.5, 0.5); p = r4(s + r.step(0.5, 2, 0.5)); for (let i = 0; i < n; i++) xs.push(r4(x0 + i * p)); }
  if (xs.at(-1) + s > fx.w - 0.3) return null;
  const sq = `${M(r, s)} square`;
  const cw = (k) => W[k];
  const lst = xs.length > 1 ? xs.slice(0, -1).map(fmt).join(", ") + " and " + fmt(xs.at(-1)) : fmt(xs[0]);
  let req, pos = xs;
  if (mode === "list") req = r.pick([`cut ${cw(n)} ${sq} windows in the ${fx.name} at x ${lst}, ${M(r, z0)} up`, `${fx.name}: ${cw(n)} ${sq} window openings with their left edges at x ${lst}, sills ${M(r, z0)} up`, `punch ${cw(n)} ${sq} windows through the ${fx.name} at x = ${lst}, all ${M(r, z0)} above the ground`]);
  else if (mode === "pitch") req = r.pick([`${cw(n)} ${sq} windows in the ${fx.name}, the first at x ${fmt(x0)} and then every ${M(r, p)}, sill ${M(r, z0)}`, `cut ${cw(n)} ${sq} windows into the ${fx.name} starting at x ${fmt(x0)}, ${M(r, p)} apart (left edge to left edge), ${M(r, z0)} up`]);
  else { pos = xs.map((x) => r4(x)); req = r.pick([`cut ${cw(n)} ${sq} windows in the ${fx.name} centered at x ${xs.map((x) => fmt(r4(x + s / 2))).join(", ").replace(/, ([^,]*)$/, " and $1")}, ${M(r, z0)} up`]); }
  return { fx, request: req, commands: pos.map((x) => ({ cmd: "rect", from: [x, 0, z0], to: [r4(x + s), 0, r4(z0 + s)] })), check: { has_face: [{ normal: [0, 1, 0], normal_abs: true, area: r4(s * s), min: n }] } };
});

F("f5", "hollow", 120, (r) => {
  const w = r.step(2, 8, 0.5), d = r.step(2, 8, 0.5), h = r.step(1, 4, 0.5), t = r.step(0.1, 0.5, 0.05);
  const fl = r.chance(0.3) ? r.step(0.1, 0.5, 0.05) : t;
  if (h - fl < 0.4 || 2 * t >= Math.min(w, d) - 0.4) return null;
  const nm = r.pick(["box", "planter", "tank", "bin", "crate", "tray", "container", "trough"]);
  const wt = r.pick([`${M(r, t)} thick walls`, `walls ${M(r, t)} thick`]);
  const flTxt = fl !== t ? ` and a ${M(r, fl)} floor` : "";
  const top = r.pick(["an open top", "no lid", "the top open", "no top"]);
  const req = r.pick([`a hollow ${nm} ${fmt(w)} by ${fmt(d)} by ${fmt(h)} m with ${wt}${flTxt} and ${top}`, `an open-topped ${nm}, ${fmt(w)} x ${fmt(d)} x ${fmt(h)}, ${wt}${flTxt}`, `${article(nm)} ${fmt(w)} m long, ${fmt(d)} m wide, ${fmt(h)} m tall, hollow inside with ${wt}${flTxt}, ${top}`]);
  const cmds = [{ cmd: "rect", from: [0, 0, 0], to: [w, d, 0], as: "f" }, { cmd: "pushpull", face: "@f", distance: h, toward: [0, 0, 1], as: "t" }, { cmd: "offset", face: "@t", distance: t, as: "in" }, { cmd: "pushpull", face: "@in", distance: r4(-(h - fl)) }];
  return { request: req, commands: cmds, check: { bbox: { size: [w, d, h] }, has_face: [{ normal: [0, 0, 1], area: r4((w - 2 * t) * (d - 2 * t)), z: [r4(fl - 0.05), r4(fl + 0.05)] }] } };
});

F("f5", "rooms_shared", 100, (r) => {
  const n = r.int(2, 4), axis = r.pick(["x", "x", "y"]), dep = r.step(3, 6, 0.5), h = r.step(2.2, 3.2, 0.1), t = r.chance(0.3) ? r.step(0.1, 0.3, 0.05) : 0.2;
  const same = r.chance(0.5), w0 = r.step(3, 6, 0.5);
  const ws = Array.from({ length: n }, () => (same ? w0 : r.step(3, 6, 0.5)));
  const lst = ws.map(fmt);
  const dimTxt = same ? `each ${fmt(w0)} by ${fmt(dep)} m` : `${lst.length > 1 ? lst.slice(0, -1).join(", ") + " and " + lst.at(-1) : lst[0]} m ${axis === "x" ? "wide" : "long"} and all ${fmt(dep)} m ${axis === "x" ? "deep" : "wide"}`;
  const thick = t !== 0.2 ? `, ${M(r, t)} thick walls` : "";
  const req = r.pick([`${count(r, n)} rooms ${axis === "x" ? "side by side" : "in a row from front to back"}, ${dimTxt}, ${M(r, h)} walls${thick}, sharing the walls between them`, `${count(r, n)} adjoining rooms ${axis === "x" ? "along x" : "along y"} (${dimTxt}) with ${M(r, h)} high walls${thick}; neighbours share one wall`, `a row of ${count(r, n)} rooms, ${dimTxt}, ${M(r, h)} walls${thick}, each pair sharing the wall between them`]);
  const cmds = [];
  let o = 0;
  for (const w of ws) {
    const A = axis === "x" ? w : dep, B = axis === "x" ? dep : w;
    const x = axis === "x" ? o : 0, y = axis === "x" ? 0 : o;
    const c = { cmd: "wall", points: [[x, y, 0], [r4(x + A), y, 0], [r4(x + A), r4(y + B), 0], [x, r4(y + B), 0]], closed: true, height: h };
    if (t !== 0.2) c.thickness = t;
    cmds.push(c); o = r4(o + w);
  }
  const tot = r4(ws.reduce((a, b) => a + b, 0));
  return { request: req, commands: cmds, check: { bbox: { size: axis === "x" ? [r4(tot + t), r4(dep + t), h] : [r4(dep + t), r4(tot + t), h], tol: 0.2 }, groups: { min: n } } };
});

F("f5", "room_features", 100, (r) => {
  const w = r.step(3, 8, 0.5), d = r.step(3, 7, 0.5), h = r.step(2.2, 3, 0.1), T = r.step(0.1, 0.3, 0.05);
  if (h + T < 2.55) return null; // windows (1 m sill, 1.5 m tall) reach 2.5 m
  const sides = ["south", "north", "east", "west"], doorSide = r.pick(sides);
  const others = sides.filter((s) => s !== doorSide);
  const winSides = r.chance(0.5) ? others : r.shuffle(others).slice(0, r.int(1, 2));
  const sw = (s) => ({ south: [r4(w / 2 - 0.5), 0], north: [r4(w / 2 - 0.5), d], east: [w, r4(d / 2)], west: [0, r4(d / 2)] }[s]);
  const winTxt = winSides.length === 3 ? "a window on each of the other three walls" : winSides.length === 2 ? `a window in the ${winSides[0]} wall and one in the ${winSides[1]} wall` : `a window in the ${winSides[0]} wall`;
  const req = r.pick([`a ${fmt(w)} x ${fmt(d)} room with ${M(r, h)} walls, a door on the ${doorSide} wall, ${winTxt}, and a flat roof slab ${M(r, T)} thick`, `build a ${fmt(w)} by ${fmt(d)} m room, ${M(r, h)} high, door in the ${doorSide} wall, ${winTxt}, and cap it with a ${M(r, T)} thick flat slab`, `a room ${fmt(w)} by ${fmt(d)} with ${M(r, h)} high walls and a ${M(r, T)} flat slab roof; put the door in the ${doorSide} wall and ${winTxt}`]);
  const cmds = [{ cmd: "wall", points: [[0, 0, 0], [w, 0, 0], [w, d, 0], [0, d, 0]], closed: true, height: h }];
  const dp = sw(doorSide); const dc = { cmd: "insert", asset: "door", at: [dp[0], dp[1], 0] }; if (doorSide === "east" || doorSide === "west") dc.rotate = 90; cmds.push(dc);
  for (const s of winSides) { const p = sw(s); const c = { cmd: "insert", asset: "window", at: [p[0], p[1], 1] }; if (s === "east" || s === "west") c.rotate = 90; cmds.push(c); }
  cmds.push({ cmd: "rect", from: [-0.1, -0.1, h], to: [r4(w + 0.1), r4(d + 0.1), h], as: "slab" }, { cmd: "pushpull", face: "@slab", distance: T, toward: [0, 0, 1] });
  return { request: req, commands: cmds, check: { bbox: { size: [r4(w + 0.2), r4(d + 0.2), r4(h + T)], tol: 0.2 }, instances: { name: "window", min: winSides.length } } };
});

// ---------------------------------------------------------------- family 6: edits on a fixture, mirrors, questions
F("f6", "resize", 150, (r) => {
  const which = r.pick(["house", "house", "last", "tower"]);
  const fx = which === "last" ? fxLast(r) : which === "tower" ? fxTower(r) : fxHouse(r, { sel: r.chance(0.5) });
  const nm = fx.name;
  const ax = which === "tower" ? r.pick(["z", "z", "z", "x"]) : r.pick(["z", "z", "z", "x", "y"]);
  const dim = { x: fx.w, y: fx.d, z: fx.h }[ax];
  const neg = r.chance(0.25);
  let dlt = r.chance(0.25) ? r.step(10, 90, 10) / 100 : r.step(0.5, 4, 0.5);
  if (neg && dim - dlt < 0.5) return null;
  const amt = dlt < 1 && Number.isInteger(dlt * 100) && dlt * 100 % 10 === 0 && r.chance(0.5) ? `${fmt(dlt * 100)} cm` : M(r, dlt);
  const word = { z: neg ? ["shorter", "lower"] : ["taller", "higher"], x: neg ? ["narrower"] : ["wider"], y: neg ? ["shallower"] : ["deeper"] }[ax];
  const ref = (which === "last" || (which === "house" && fx.sel)) && r.chance(0.6) ? "it" : `the ${nm}`;
  const req = r.pick([`make ${ref} ${word[0]} by ${amt}`, `${ref === "it" ? "it" : "the " + nm} should be ${amt} ${word[0]}`, `${neg ? "reduce" : "increase"} ${ref === "it" ? "its" : "the " + nm + "'s"} ${{ z: "height", x: "width (x)", y: "depth (y)" }[ax]} by ${amt}`, `${ref === "it" ? "make it" : "make the " + nm} ${amt} ${word[0]}`].map((s) => s));
  const f = r4((dim + (neg ? -dlt : dlt)) / dim);
  const factor = { x: [f, 1, 1], y: [1, f, 1], z: [1, 1, f] }[ax];
  const size = [fx.w, fx.d, fx.h]; size[{ x: 0, y: 1, z: 2 }[ax]] = r4(dim + (neg ? -dlt : dlt));
  return { fx, request: req, commands: [{ cmd: "scale", ids: [`@${nm}`], center: [fx.x0 || 0, fx.y0 || 0, 0], factor }], check: { bbox: { size, min: [fx.x0 || 0, fx.y0 || 0, 0] } } };
});

F("f6", "mirror", 90, (r) => {
  const fx = fxHouse(r, { sel: false });
  if (fx.x0 < 0 || fx.y0 < 0) return null;
  const nm = fx.name, flipY = r.chance(0.6);
  const ax = flipY ? "x" : "y";
  const touching = (flipY ? fx.y0 : fx.x0) === 0;
  const tail = touching ? r.pick([", so the two are back to back", " so they touch back to back", "", ""]) : r.pick(["", ""]);
  const req = r.pick([`mirror the ${nm} across the ${ax} axis${tail}`, `make a mirror image of the ${nm} on the other side of the ${ax} axis${tail}`, `reflect a copy of the ${nm} across the ${ax} axis${tail}`, `flip a copy of the ${nm} over the ${ax} axis${tail}`]);
  const by = flipY ? [0, r4(-(2 * fx.y0 + fx.d)), 0] : [r4(-(2 * fx.x0 + fx.w)), 0, 0];
  const mn = flipY ? [fx.x0, r4(-(fx.y0 + fx.d)), 0] : [r4(-(fx.x0 + fx.w)), fx.y0, 0], mx = flipY ? [r4(fx.x0 + fx.w), r4(fx.y0 + fx.d), fx.h] : [r4(fx.x0 + fx.w), r4(fx.y0 + fx.d), fx.h];
  return { fx, request: req, commands: [{ cmd: "copy", group: `@${nm}`, by }], check: { groups: { n: 2 }, bbox: { min: mn, max: mx } } };
});

function fxHouseTower(r) {
  const h = fxHouse(r, { at: false, sel: false, name: "house" });
  const s = r.step(1, 3, 0.5), th = r.step(3, 10, 1), tx = r4(h.w + r.step(4, 10, 1)), ty = r.step(-8, 8, 1);
  const setup = [...h.setup, { cmd: "begin_group", name: "tower", as: "tower" }, { cmd: "rect", from: [tx, ty, 0], to: [r4(tx + s), r4(ty + s), 0], as: "tf" }, { cmd: "pushpull", face: "@tf", distance: th, as: "ttop" }, { cmd: "end_group" }];
  const desc = `@house is a group named "house": a box ${fmt(h.w)} m (x) by ${fmt(h.d)} m (y) by ${fmt(h.h)} m tall, one corner at the origin (x 0..${fmt(h.w)}, y 0..${fmt(h.d)}, z 0..${fmt(h.h)}). @tower is a group named "tower": a box ${fmt(s)} m by ${fmt(s)} m and ${fmt(th)} m tall standing at x ${fmt(tx)}..${fmt(tx + s)}, y ${fmt(ty)}..${fmt(ty + s)}. @ttop is the top face of the tower.`;
  return { kind: "housetower", h, s, th, tx, ty, setup, desc };
}
F("f6", "tower_against", 80, (r) => {
  const fx = fxHouseTower(r), { h, s, th } = fx;
  const side = r.pick(["east", "west", "north", "south"]);
  const up = r.step(1, 4, 0.5);
  const center = r.chance(0.3);
  let tx2, ty2;
  if (side === "east") { tx2 = h.w; ty2 = center ? r4(h.d / 2 - s / 2) : 0; }
  else if (side === "west") { tx2 = r4(-s); ty2 = center ? r4(h.d / 2 - s / 2) : 0; }
  else if (side === "north") { ty2 = h.d; tx2 = center ? r4(h.w / 2 - s / 2) : 0; }
  else { ty2 = r4(-s); tx2 = center ? r4(h.w / 2 - s / 2) : 0; }
  const pos = center ? `, centered on that side` : "";
  const req = r.pick([`move the tower so it stands against the ${side} side of the house${pos}, then raise the tower another ${M(r, up)}`, `slide the tower over to touch the ${side} wall of the house${pos} and then make the tower ${M(r, up)} taller`, `put the tower right up against the ${side} side of the house${pos}; after that extend the tower upward by ${M(r, up)}`]);
  const by = [r4(tx2 - fx.tx), r4(ty2 - fx.ty), 0];
  const minx = Math.min(0, tx2), maxx = Math.max(h.w, r4(tx2 + s)), miny = Math.min(0, ty2), maxy = Math.max(h.d, r4(ty2 + s));
  return { fx, request: req, commands: [{ cmd: "move", ids: ["@tower"], by }, { cmd: "pushpull", face: "@ttop", distance: up }], check: { groups: { n: 2 }, bbox: { size: [r4(maxx - minx), r4(maxy - miny), r4(Math.max(h.h, th + up))] }, part_at: [{ group: "^tower$", min: [tx2, ty2, 0], max: [r4(tx2 + s), r4(ty2 + s), r4(th + up)] }] } };
});

F("f6", "question", 120, (r) => {
  const useRoom = r.chance(0.75);
  const fx = useRoom ? fxRoomDoor(r) : fxHouse(r);
  const nm = useRoom ? "room" : fx.name;
  const side = r.pick(["north", "south", "east", "west"]);
  const Q = useRoom ? [
    [`what's on the ${side} wall?`, [{ cmd: "parts" }]], [`what is on the ${side} wall of the room?`, [{ cmd: "parts" }]], [`is there anything on the ${side} wall`, [{ cmd: "parts" }]], [`anything on the ${side} wall?`, [{ cmd: "parts" }]],
    [`tell me what is along the ${side} wall`, [{ cmd: "parts" }]], [`what's attached to the ${side} wall`, [{ cmd: "parts" }]], [`which faces make up the ${side} wall?`, [{ cmd: "faces" }]],
    [`how long is the ${side} wall?`, [{ cmd: "parts", ids: ["@room"] }]], ["how tall are the walls?", [{ cmd: "parts", ids: ["@room"] }]], ["is there a door in this room?", [{ cmd: "parts" }]],
    [`what's near the door?`, [{ cmd: "parts" }]], ["what are the room's dimensions?", [{ cmd: "parts", ids: ["@room"] }]], ["what's in here?", [{ cmd: "parts" }]], ["what is the door's size?", [{ cmd: "parts", ids: ["@door"] }]],
  ] : [
    [`what's on the ${side} side of the ${nm}?`, [{ cmd: "parts" }]], [`what is next to the ${nm}?`, [{ cmd: "parts" }]], [`what's on top of the ${nm}?`, [{ cmd: "parts" }]], [`how many faces does the ${nm} have?`, [{ cmd: "faces" }]],
    [`what color is the ${nm}?`, [{ cmd: "faces" }]], [`what is the ${nm} made of?`, [{ cmd: "faces" }]], [`is there a roof on the ${nm}?`, [{ cmd: "parts" }]], [`what's attached to the ${nm}?`, [{ cmd: "parts" }]],
  ];
  const [q, cmds] = r.pick(Q);
  return { fx, request: q, commands: cmds, check: { readonly: true } };
});

for (const t of V3) { /* weights are relative; see gen_data.mjs --templates v3 */ }
