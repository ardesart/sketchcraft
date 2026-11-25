// The slice of SketchCraft's command language the small model may speak (81 of the engine's ~206 commands),
// as one table. From it we generate BOTH the compact reference in the prompt and the JSON schema handed to
// Ollama as `format` (so output can only be a valid command list). `check_spec` verifies every name here is
// a real variant of the Command enum and is in the agent allowlist (policy.rs), so the table can't drift.
//
// type codes: v3 = [x,y,z] meters, n = number, i = integer, s = string, b = boolean, id = id or "@name",
// ids = list of ids, pts = list of v3, fac = number or v3. A trailing ? = optional.
export const ASSETS = ["door", "window", "garage_door", "tree", "palm", "car", "streetlight", "bench", "hydrant"];
export const ROOFS = ["gable", "hip", "shed"];

export const COMMANDS = [
  ["rect", { from: "v3", to: "v3", as: "s?" }, "axis-aligned rectangle; both corners share one coordinate (z equal = on the ground). On an existing face it cuts a hole (window) or splits it (door)"],
  ["polygon", { points: "pts", as: "s?" }, "flat face from points"],
  ["line", { points: "pts" }, "edges"],
  ["circle", { center: "v3", radius: "n", as: "s?" }, "flat circle (radius, not diameter)"],
  ["offset", { face: "id", distance: "n", as: "s?" }, "+ shrinks a face inward (new inner face), - grows outward"],
  ["pushpull", { face: "id", distance: "n", toward: "v3?", as: "s?" }, "extrude a face by distance (- pushes in); returns the new far face as `face`; toward:[0,0,1] forces up"],
  ["move", { ids: "ids", by: "v3" }, "move groups/faces by an offset"],
  ["rotate", { ids: "ids", center: "v3", axis: "v3?", angle: "n" }, "rotate about a point, axis default [0,0,1], degrees, counter-clockwise from above"],
  ["scale", { ids: "ids", center: "v3", factor: "fac" }, "uniform number or [x,y,z] factors, about center"],
  ["duplicate", { ids: "ids", by: "v3" }, "one copy offset by `by`"],
  ["array", { ids: "ids", by: "v3", count: "i" }, "`count` MORE copies spaced `by` apart (total = count+1)"],
  ["copy", { group: "id", by: "v3", as: "s?" }, "copy a group, offset by `by`"],
  ["delete", { ids: "ids" }, ""],
  ["paint", { ids: "ids", color: "v3?", material: "s?", scope: "scope?", through: "b?" }, "color as [r,g,b] each 0..1, or material: a named picture material in the model; painting a group paints all its faces; scope face|connected|all|object spreads it, through:true lays one picture across touching faces"],
  ["begin_group", { name: "s?", as: "s?" }, "start a group: everything drawn until end_group belongs to it"],
  ["end_group", {}, ""],
  ["group", { ids: "ids", name: "s?", as: "s?" }, ""],
  ["rename", { id: "id", name: "s" }, ""],
  ["tag", { ids: "ids", tag: "s" }, ""],
  ["hide", { ids: "ids" }, ""],
  ["unhide", { ids: "ids?" }, ""],
  ["make_component", { ids: "ids", name: "s?", as: "s?" }, ""],
  ["place", { component: "s", at: "v3" }, "another instance of a component by name"],
  ["wall", { points: "pts", thickness: "n?", height: "n?", closed: "b?", as: "s?" }, "walls along a path (a group); thickness default 0.2, height 2.7; closed:true makes a room"],
  ["stairs", { at: "v3", rise: "n", direction: "n?", width: "n?", as: "s?" }, "straight stair climbing `rise`; direction degrees from +X (0=east, 90=north); width default 1"],
  ["roof", { face: "id", kind: "roofkind?", pitch: "n?", overhang: "n?", as: "s?" }, "roof (a group) over a flat top face; kind gable|hip|shed; pitch in degrees"],
  ["column", { at: "v3", size: "n?", height: "n?", round: "b?", as: "s?" }, "square column centered at `at`; size default 0.3, height 2.7"],
  ["insert", { asset: "asset", at: "v3", rotate: "n?" }, "built-in door window garage_door tree palm car streetlight bench hydrant"],
  ["dimension", { from: "v3", to: "v3", offset: "v3?" }, "dimension line; replies with its length"],
  ["undo", {}, "take back the last step"],
  ["info", {}, "READ-ONLY: counts, bounds, groups, instances, materials"],
  ["parts", { ids: "ids?" }, "READ-ONLY: each group/component's true size (sorted)"],
  ["faces", {}, "READ-ONLY: every face (id, normal, center, area, material, group)"],
  ["volume", { id: "id" }, "READ-ONLY: volume of a closed group"],
  ["pick", { at: "v3", as: "s?" }, "the face under a point (remember it with as)"],
  ["room_info", { name: "s" }, "READ-ONLY: a room by name (loose, \"master\" finds the primary bedroom): its floor area in m2 and ft2, perimeter, size, level"],
  ["floorplan_build", { floors: "floors", units: "units?", wall_height: "n?", wall_thickness: "n?", name: "s?" }, "a whole house from a room plan, ONE command: floors[{rooms[{name, rect:[x,y,width,depth]}], openings[{kind door|window|opening|open, between:[room, room|\"outside\"], side?, width?}], stairs?[{room}]}]; rects on wall centerlines, front row at y=0, left to right from x=0; touching rooms share a wall; units ft|m"],
  ["room_rect", { from: "v3", to: "v3", thickness: "n?", height: "n?", name: "s?", mode: "rmode?", as: "s?" }, "Room mode: a room (4 walls + floor, a group) dragged between two corners ON THE WALL CENTERLINES; a side on a neighbour's wall shares it; mode combine joins the room the box overlaps, subtract cuts the box out of it"],
  ["room_preview", { from: "v3", to: "v3", thickness: "n?", mode: "rmode?" }, "READ-ONLY: what room_rect would do (inside size, area, shared walls, or why refused)"],
  ["rooms", {}, "READ-ONLY: the rooms: name, inside rectangle, area m2"],
  ["wall_pull", { face: "id", by: "n" }, "pull the whole wall a face belongs to by metres along that face's outward normal (- the other way); thickness kept, doors and windows ride along, joined walls follow"],
  ["wall_info", { face: "id" }, "READ-ONLY: what pulling that wall would move"],
  ["texture_project", { faces: "ids?", entity: "id?", mode: "pmode", material: "s?", origin: "v3?", axis: "v3?", scale: "n?", rotation: "n?", fit: "b?" }, "projection mapping: lay a material's picture on faces (or a group) as planar|box|cylinder|sphere, or clear"],
  ["texture_uv", { faces: "ids" }, "READ-ONLY: the texture coordinates of faces"],
  ["texture_position", { face: "id?", faces: "ids?", transform: "tf?", matrix: "m6?", reset: "b?" }, "Position Texture: move (offset [du,dv] m), rotate (degrees), scale or skew the picture on faces; reset goes back"],
  ["texture_frame", { face: "id" }, "READ-ONLY: a face's picture-space corners and tile size"],
  ["vertex_paint", { faces: "ids?", entity: "id?", color: "col", points: "pts1?", radius: "n?", strength: "n?", falloff: "falloff?", erase: "b?" }, "vertex colour brush: corners within radius metres of each stroke point blend toward color; no points fills the selection"],
  ["vertex_paint_clear", { faces: "ids?", entity: "id?" }, "take vertex colours off"],
  ["vertex_colors", { faces: "ids" }, "READ-ONLY: per-corner vertex colours of faces"],
  ["texture_paint_new", { faces: "ids?", entity: "id?", size: "n?", base: "col?", name: "s?", unwrap: "b?" }, "make a paintable texture (square, size px) and put it on faces or a group; unwrap:true unwraps them first"],
  ["texture_paint_stroke", { material: "s", faces: "ids?", entity: "id?", points: "pts1?", radius: "n?", uv_points: "pts2?", uv_radius: "n?", fill: "b?", color: "col?", hardness: "n?", opacity: "n?", erase: "b?" }, "one brush stroke on a paint texture's pixels; fill:true paints every texel"],
  ["texture_paint_status", { faces: "ids?", entity: "id?" }, "READ-ONLY: can these faces be painted (UVs missing, overlapping, outside 0..1)"],
  ["uv_seam", { edges: "ids?", faces: "ids?", entity: "id?", on: "b?", auto: "n?" }, "mark (on, default) or clear UV seams on edges, or auto: edges between faces meeting past that many degrees"],
  ["uv_unwrap", { faces: "ids?", entity: "id?", method: "umethod?", seams: "useams?", angle: "n?", margin: "n?" }, "UV unwrap faces or a group: islands along seams, flattened, packed into 0..1"],
  ["uv_pack", { faces: "ids?", entity: "id?", margin: "n?", set: "n?" }, "repack existing UV islands"],
  ["uv_lightmap", { faces: "ids?", entity: "id?", margin: "n?", angle: "n?", clear: "b?" }, "lightmap UV channel (second UV set, no overlaps); clear removes it"],
  ["uv_transform", { faces: "ids", matrix: "m6", set: "n?" }, "move UVs by [a,b,c,d,e,f] (u' = a u + c v + e, v' = b u + d v + f)"],
  ["uv_info", { faces: "ids?", entity: "id?", set: "n?" }, "READ-ONLY: UVs, islands, seams of faces"],
  // v5: the rest of the Model tab (arcs, Follow Me, text, guides, axes, edge tools, solids) and more material control
  ["arc", { start: "v3", end: "v3", bulge: "n", normal: "v3?", as: "s?" }, "arc edges from start to end, bowing `bulge` m out to the LEFT of start->end seen from the normal side (- bows right); normal default [0,0,1] (on the ground); a half circle of radius R has bulge R; a pie or half-disc face: arc, then line {points:[end, center, start]}"],
  ["follow_me", { face: "id", points: "pts?", edges: "ids?", around: "id?" }, "Follow Me: sweep a profile face along a path (points, or edges), or around another face's outline (around); the profile must stand at the path's start"],
  ["text", { at: "v3", text: "s", leader: "v3?" }, "a text label at a point, with an optional leader line to `leader`"],
  ["guide", { point: "v3", direction: "v3?" }, "Tape Measure / Protractor: a construction guide line through point along direction (no direction = a guide point)"],
  ["clear_guides", {}, "delete every construction guide"],
  ["set_axes", { origin: "v3?", x: "v3?", y: "v3?", reset: "b?" }, "Axes tool: move the drawing axes to origin with red along x and green along y; reset:true puts them back"],
  ["resize", { factor: "n" }, "Tape Measure resize: scale the WHOLE model by factor = wanted length / measured length"],
  ["soften", { ids: "ids?", soft: "b?", coplanar: "b?" }, "soften (hide) the edges of faces or edges in ids; soft:false makes them hard again; coplanar:true softens every flat seam in the model"],
  ["explode", { id: "id" }, "turn a component instance back into plain geometry (a group)"],
  ["ungroup", { id: "id" }, "dissolve a group; what was inside moves up a level"],
  ["intersect", { ids: "ids", with: "withk?" }, "Intersect Faces: draw edges where these groups/faces cross the model (with model, default) or each other (with selection)"],
  ["divide", { edge: "id", count: "i" }, "split an edge into count equal parts"],
  ["weld", { edges: "ids" }, "join connected edges into one curve"],
  ["explode_curve", { edges: "ids" }, "split a curve (arc, circle, welded edges) back into separate edges"],
  ["flip", { ids: "ids", axis: "axis" }, "Flip Along: mirror groups/faces in place across their middle, along x (red), y (green) or z (blue)"],
  ["reverse", { ids: "ids" }, "reverse faces (turn them inside out); a group reverses all its faces"],
  ["bevel", { edges: "ids", size: "n", segments: "i?" }, "bevel edges of a solid group by size m; segments 1 = flat chamfer, more = rounded fillet"],
  ["subdivide", { id: "id", levels: "lvl?", keep_sharp: "b?" }, "smooth a group into a subdivision surface (levels 1-4, default 2); keep_sharp keeps sharp edges creased"],
  ["solid", { op: "solidop", ids: "ids" }, "solid tools on closed groups: union, intersect, outer_shell, split, subtract (the FIRST cuts the second and is used up), trim (the first cuts the second and stays)"],
  ["slice", { id: "id", origin: "v3", normal: "v3" }, "cut a solid group in two along the plane through origin facing normal"],
  ["material", { name: "s", color: "v3?", roughness: "n?", metalness: "n?", glass: "b?", emission: "n?" }, "make or change a named material ([r,g,b] 0..1, roughness/metalness 0..1, glass, emission); then paint with material: name"],
  ["texture", { name: "s", width: "n?", height: "n?" }, "change a picture material's tile size: width and height in m of one repeat of its picture"],
  ["texture_pixels", { material: "s", x: "u?", y: "u?", w: "u?", h: "u?" }, "READ-ONLY: a block of a picture material's pixels"],
];

const NAME = "^@?[A-Za-z0-9_]{1,32}$";
const N = { type: "number" };
const ROOM = { type: "object", properties: { name: { type: "string", maxLength: 40 }, rect: { type: "array", items: N, minItems: 4, maxItems: 4 }, polygon: { type: "array", items: { type: "array", items: N, minItems: 2, maxItems: 2 }, minItems: 4, maxItems: 32 }, floor: { type: "boolean" } }, required: ["name"], additionalProperties: false };
const OPENING = { type: "object", properties: { kind: { enum: ["door", "window", "opening", "open"] }, between: { type: "array", items: { type: "string", maxLength: 40 }, minItems: 1, maxItems: 2 }, side: { enum: ["north", "south", "east", "west"] }, at: { type: "array", items: N, minItems: 2, maxItems: 2 }, width: N, height: N, sill: N }, required: ["kind", "between"], additionalProperties: false };
const STAIR = { type: "object", properties: { room: { type: "string", maxLength: 40 }, at: { type: "array", items: N, minItems: 2, maxItems: 2 }, direction: N, width: N, rise: N }, additionalProperties: false };
const FLOORS = { type: "array", minItems: 1, maxItems: 4, items: { type: "object", properties: { level: { type: "integer" }, elevation: N, wall_height: N, rooms: { type: "array", items: ROOM, minItems: 1, maxItems: 40 }, openings: { type: "array", items: OPENING, maxItems: 80 }, stairs: { type: "array", items: STAIR, maxItems: 4 } }, required: ["rooms"], additionalProperties: false } };
const ID = { anyOf: [{ type: "integer" }, { type: "string", pattern: "^@[A-Za-z0-9_]{1,32}$" }] };
const V3 = { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 };
const N2 = { type: "array", items: N, minItems: 2, maxItems: 2 };
const TF = { type: "object", properties: { offset: N2, rotation: N, scale: { anyOf: [N, N2] }, skew: { anyOf: [N, N2] }, pivot: N2 }, additionalProperties: false };
const TYPES = {
  col: { type: "array", items: N, minItems: 3, maxItems: 4 }, m6: { type: "array", items: N, minItems: 6, maxItems: 6 },
  pts1: { type: "array", items: { type: "array", items: N, minItems: 3, maxItems: 3 }, minItems: 1, maxItems: 24 },
  pts2: { type: "array", items: N2, minItems: 1, maxItems: 24 }, tf: TF,
  pmode: { enum: ["planar", "box", "cylinder", "sphere", "clear"] }, rmode: { enum: ["new", "combine", "subtract"] },
  scope: { enum: ["face", "connected", "all", "object"] }, falloff: { enum: ["smooth", "linear", "hard"] },
  umethod: { enum: ["conformal", "angle", "planar_islands"] }, useams: { enum: ["marked", "auto"] },
  v3: V3, n: { type: "number" }, i: { type: "integer", minimum: 1, maximum: 200 }, s: { type: "string", maxLength: 40 }, b: { type: "boolean" },
  id: ID, ids: { type: "array", items: ID, minItems: 1, maxItems: 12 }, pts: { type: "array", items: V3, minItems: 2, maxItems: 24 },
  fac: { anyOf: [{ type: "number" }, V3] }, roofkind: { enum: ROOFS }, asset: { enum: ASSETS },
  floors: FLOORS, units: { enum: ["m", "ft", "in", "cm", "mm"] },
  axis: { enum: ["x", "y", "z"] }, solidop: { enum: ["union", "subtract", "intersect", "trim", "split", "outer_shell"] },
  withk: { enum: ["model", "selection"] }, lvl: { type: "integer", minimum: 1, maximum: 4 }, u: { type: "integer", minimum: 0, maximum: 4096 },
};
const T = (code) => TYPES[code.replace("?", "")];

/** JSON schema for Ollama's `format`: {"commands":[ one of the typed commands, ... ]} */
export function buildSchema(only = null) {
  const variants = COMMANDS.filter(([n]) => !only || only.includes(n)).map(([name, fields]) => {
    const props = { cmd: { const: name } };
    const required = ["cmd"];
    for (const [k, code] of Object.entries(fields)) {
      props[k] = k === "as" ? { type: "string", pattern: NAME } : T(code);
      if (!code.endsWith("?")) required.push(k);
    }
    return { type: "object", properties: props, required, additionalProperties: false };
  });
  return { type: "object", properties: { commands: { type: "array", items: { anyOf: variants }, minItems: 1, maxItems: 40 } }, required: ["commands"], additionalProperties: false };
}

const SHORT = { floors: "[floor,..]", units: "m|ft", v3: "[x,y,z]", n: "number", i: "int", s: "string", b: "bool", id: "id", ids: "[id,..]", pts: "[[x,y,z],..]", fac: "n|[x,y,z]", roofkind: "gable|hip|shed", asset: "asset" };
/** The compact reference put in the prompt, generated from the table (about 900 tokens). */
export function buildReference(only = null) {
  const lines = COMMANDS.filter(([n]) => !only || only.includes(n)).map(([name, fields, doc]) => {
    const f = Object.entries(fields).map(([k, c]) => (c.endsWith("?") ? `${k}?` : k) + (c.startsWith("n") || c.startsWith("i") ? "" : "")).join(", ");
    return `${name}${f ? " {" + f + "}" : ""}${doc ? ": " + doc : ""}`;
  });
  return [
    "You turn a plain-English request into SketchCraft commands. Output JSON: {\"commands\":[ ... ]}, each command an object with \"cmd\".",
    "Units are meters (convert feet/inches/cm/mm to meters). Z is up. +X east, +Y north (south = -Y), -Y is the front. Angles in degrees.",
    "\"as\":\"name\" remembers a result id (face, group, instance); use \"@name\" wherever an id goes. Names listed in the model state are already usable as @name.",
    "To make a solid object you will paint, move or copy as a whole: begin_group (as:name), rect, pushpull, end_group, then act on \"@name\".",
    "Questions (how big, what is there, where) use only the READ-ONLY commands and change nothing.",
    "Commands:",
    ...lines,
  ].join("\n");
}

// Hand-written worked examples (none is an eval request). [request, answer, fixture-or-null]. `--shots N` uses the first N.
export const FEW_SHOT = [
  ["a 3 by 2 meter box 1.5 m tall", { commands: [{ cmd: "begin_group", name: "box", as: "box" }, { cmd: "rect", from: [0, 0, 0], to: [3, 2, 0], as: "f" }, { cmd: "pushpull", face: "@f", distance: 1.5 }, { cmd: "end_group" }] }, null],
  ["move the house 5 m east and paint it red", { commands: [{ cmd: "move", ids: ["@house"], by: [5, 0, 0] }, { cmd: "paint", ids: ["@house"], color: [1, 0, 0] }] }, "house"],
  ["a 5x4 room with 2.5 m walls", { commands: [{ cmd: "wall", points: [[0, 0, 0], [5, 0, 0], [5, 4, 0], [0, 4, 0]], thickness: 0.2, height: 2.5, closed: true }] }, null],
  ["how tall is the tower?", { commands: [{ cmd: "parts", ids: ["@tower"] }] }, "tower"],
  ["a green 2 m cube 4 m east of the origin", { commands: [{ cmd: "begin_group", name: "cube", as: "cube" }, { cmd: "rect", from: [4, 0, 0], to: [6, 2, 0], as: "f" }, { cmd: "pushpull", face: "@f", distance: 2 }, { cmd: "end_group" }, { cmd: "paint", ids: ["@cube"], color: [0, 0.6, 0] }] }, null],
  ["an L-shaped wall, 5 m along x then 3 m along y, 3 m high", { commands: [{ cmd: "wall", points: [[0, 0, 0], [5, 0, 0], [5, 3, 0]], height: 3 }] }, null],
  ["put a 30 degree shed roof on the tower", { commands: [{ cmd: "roof", face: "@top", kind: "shed", pitch: 30 }] }, "tower"],
  ["three more posts in a line along y, 1.5 m apart", { commands: [{ cmd: "array", ids: ["@post"], by: [0, 1.5, 0], count: 3 }] }, "post"],
];

// The SHORT system prompt used for fine-tuning (Phase 2) and for scoring a fine-tuned model (`run_eval --prompt short`):
// no command reference and no examples; the tuned model has learned the table. Keep training and eval in sync.
export const SHORT_SYSTEM = [
  "You are SketchCraft's modeling assistant. Turn the request into SketchCraft commands.",
  "Reply with JSON only: {\"commands\":[...]}, each command an object with \"cmd\". Meters, Z up, +X east, +Y north, degrees.",
  "Questions use only read-only commands (info, parts, faces, volume, room_info). Area or size of a named room: room_info {name}; never compute it yourself. Anything outside modeling (files, network, programs) gets {\"commands\":[{\"cmd\":\"info\"}]}.",
  "A house or floor plan described room by room is ONE floorplan_build command in the person's units (units:\"ft\" or \"m\"): floors:[{rooms:[{name, rect:[x,y,width,depth]}], openings:[{kind:door|window|opening|open, between:[room, room or \"outside\"], side?, width?}], stairs?:[{room}]}]. Rooms go row by row from the front (y=0) to the back, left to right from x=0; rooms that touch share a wall. Front = south, back = north, left = west, right = east.",
].join("\n");
/** one chat example as trained and as scored: [system, user, (assistant)] */
export const chatMessages = (state, request, commands = null) => [
  { role: "system", content: SHORT_SYSTEM },
  { role: "user", content: `Model state: ${state}\nRequest: ${request}` },
  ...(commands ? [{ role: "assistant", content: JSON.stringify({ commands }) }] : []),
];
