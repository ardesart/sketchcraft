// Cut list: a SketchCraft plugin (and the example for writing your own).
//
// Make each board its own group or component, select some (or nothing, for
// the whole model), then Plugins › Cut list. Parts are measured along their
// own faces, so a board turned on its side still reads right. Parts up to
// 40 mm thick and at least 100 mm wide are sheet goods, packed onto 4×8 ft
// sheets; the rest are boards, packed onto 8 ft lengths. Both allow a 3 mm saw
// kerf. Rough guides for buying, not a cutting plan.
//
// A board whose cross-section is real dimensional lumber (a 2×4 is 1½" × 3½",
// a 1×6 is ¾" × 5½") is called by its name, and boards get board feet: the
// lumber yard's measure, by the nominal size for dimensional lumber (a 2×4
// 8 ft long is 5.33 bd ft) and by the actual size for everything else.

const SHEET = [2.44, 1.22]; // 4 × 8 ft, in meters
const BOARD = 2.44; // 8 ft
const KERF = 0.003;
const INCH = 0.0254;

// dimensional lumber: nominal [thickness, width] in inches -> actual inches
const NOMINAL_T = { 1: 0.75, 2: 1.5, 4: 3.5, 6: 5.5 };
const NOMINAL_W = { 2: 1.5, 3: 2.5, 4: 3.5, 6: 5.5, 8: 7.25, 10: 9.25, 12: 11.25 };
const LUMBER = [];
for (const [t, at] of Object.entries(NOMINAL_T))
  for (const [w, aw] of Object.entries(NOMINAL_W)) if (+w >= +t) LUMBER.push({ name: `${t}×${w}`, nominal: [+t, +w], actual: [at, aw] });

/** The lumber name for a thickness × width in meters ("2×4"), or null. Within 1.5 mm, either way round. */
function lumberName(thick, wide) {
  const [a, b] = [Math.min(thick, wide), Math.max(thick, wide)].map((m) => m / INCH);
  const hit = LUMBER.find((l) => Math.abs(l.actual[0] - a) * INCH <= 0.0015 && Math.abs(l.actual[1] - b) * INCH <= 0.0015);
  return hit ?? null;
}

/** Board feet of one part [length, width, thickness] in meters: nominal for dimensional lumber, else actual. */
function boardFeet(size) {
  const lumber = lumberName(size[2], size[1]);
  const [t, w] = lumber ? lumber.nominal : [size[2] / INCH, size[1] / INCH];
  return (t * w * (size[0] / INCH)) / 144;
}

sketchcraft.command("cut-list", async (ctx) => {
  const sel = ctx.selection;
  const ids = [...sel.groups, ...sel.instances];
  const reply = await ctx.run({ cmd: "parts", ids });
  const parts = reply.parts ?? [];
  if (!parts.length) {
    ctx.show({ title: "Cut list", text: "No parts found. Make each board its own group or component, then try again." });
    return;
  }
  const imperial = reply.units === "ft" || reply.units === "in";
  const fmt = (m) => (imperial ? inches(m) : `${Math.round(m * 1000)} mm`);

  // the same size and material is one line with a count
  const lines = new Map();
  for (const p of parts) {
    const key = `${p.size.map((x) => x.toFixed(3)).join("x")}|${p.material ?? ""}`;
    const l = lines.get(key) ?? { names: new Set(), qty: 0, size: p.size, material: p.material };
    l.names.add(p.name);
    l.qty += 1;
    lines.set(key, l);
  }
  const all = [...lines.values()].sort((a, b) => b.size[0] - a.size[0]);
  // sheet goods and boards
  const isSheet = (s) => s[2] <= 0.04 && s[1] >= 0.1;
  const stock = (s) => (isSheet(s) ? "" : lumberName(s[2], s[1])?.name ?? "");
  const bf = (l) => (isSheet(l.size) ? null : boardFeet(l.size) * l.qty);
  const rows = all.map((l) => [[...l.names].join(", "), l.qty, fmt(l.size[0]), fmt(l.size[1]), fmt(l.size[2]), stock(l.size), bf(l) == null ? "" : bf(l).toFixed(2), l.material ?? ""]);
  const notes = [];
  const sheetGroups = groupBy(all.filter((l) => isSheet(l.size)), (l) => `${fmt(l.size[2])} ${l.material ?? ""}`.trim());
  for (const [what, ls] of sheetGroups) {
    const pieces = ls.flatMap((l) => Array(l.qty).fill([l.size[0], l.size[1]]));
    const n = packSheets(pieces);
    notes.push(`${n} sheet${n === 1 ? "" : "s"} of ${what} (4×8 ft)${pieces.some(([a, b]) => !fits(a, b)) ? ", and some parts are bigger than a sheet" : ""}`);
  }
  const boardGroups = groupBy(all.filter((l) => !isSheet(l.size)), (l) => `${stock(l.size) || `${fmt(l.size[2])} × ${fmt(l.size[1])}`} ${l.material ?? ""}`.trim());
  for (const [what, ls] of boardGroups) {
    const lengths = ls.flatMap((l) => Array(l.qty).fill(l.size[0]));
    const n = packBoards(lengths);
    notes.push(`${n} board${n === 1 ? "" : "s"} of ${what}, 8 ft long${lengths.some((x) => x > BOARD) ? " (some parts are longer than 8 ft)" : ""}`);
  }

  const totalBf = all.reduce((sum, l) => sum + (bf(l) ?? 0), 0);
  if (totalBf > 0) notes.push(`${totalBf.toFixed(1)} board feet in the boards' parts (nominal sizes for dimensional lumber)`);

  ctx.show({
    title: `Cut list: ${parts.length} part${parts.length === 1 ? "" : "s"}`,
    text: `To buy, roughly (3 mm saw kerf):\n${notes.map((n) => `• ${n}`).join("\n")}`,
    table: { columns: ["Part", "Qty", "Length", "Width", "Thickness", "Stock", "Board ft", "Material"], rows },
  });
});

function groupBy(xs, key) {
  const m = new Map();
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return m;
}

const fits = (a, b) => (a <= SHEET[0] && b <= SHEET[1]) || (a <= SHEET[1] && b <= SHEET[0]);

/** Shelf packing, biggest first: rows across the sheet, each as tall as its first part. */
function packSheets(pieces) {
  const ps = pieces.filter(([a, b]) => fits(a, b)).sort((p, q) => q[0] * q[1] - p[0] * p[1]);
  const sheets = []; // each: { shelves: [{ y, h, x }], top }
  for (const [a, b] of ps) {
    let placed = false;
    for (const s of sheets) {
      for (const [w, h] of [[a, b], [b, a]]) {
        const shelf = s.shelves.find((r) => h <= r.h && r.x + w <= SHEET[0]);
        if (shelf) {
          shelf.x += w + KERF;
          placed = true;
          break;
        }
        if (s.top + h <= SHEET[1] && w <= SHEET[0]) {
          s.shelves.push({ h, x: w + KERF });
          s.top += h + KERF;
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
    if (!placed) {
      const [w, h] = a <= SHEET[0] && b <= SHEET[1] ? [a, b] : [b, a];
      sheets.push({ shelves: [{ h, x: w + KERF }], top: h + KERF });
    }
  }
  return sheets.length;
}

/** First fit, longest first. */
function packBoards(lengths) {
  const left = [];
  for (const l of [...lengths].sort((a, b) => b - a)) {
    const piece = Math.min(l, BOARD);
    const i = left.findIndex((r) => r >= piece);
    if (i >= 0) left[i] -= piece + KERF;
    else left.push(BOARD - piece - KERF);
    // a part longer than a board takes extra boards end to end
    for (let extra = l - BOARD; extra > 0; extra -= BOARD) left.push(BOARD - Math.min(extra, BOARD) - KERF);
  }
  return left.length;
}

/** Meters to inches, to the nearest 1/16. */
function inches(m) {
  const sixteenths = Math.round((m / 0.0254) * 16);
  const whole = Math.floor(sixteenths / 16);
  let f = sixteenths % 16;
  let d = 16;
  while (f && f % 2 === 0) (f /= 2), (d /= 2);
  return f ? `${whole} ${f}/${d}"` : `${whole}"`;
}
