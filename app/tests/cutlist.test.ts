// The built-in Cut list plugin (core/plugins/cutlist/main.js), run with a stand-in for the plugin API.
import { expect, it } from "vitest";
import code from "../../core/plugins/cutlist/main.js?raw";

type Part = { name: string; size: [number, number, number]; material?: string };
type Shown = { title: string; text: string; table: { columns: string[]; rows: (string | number)[][] } };

async function cutList(parts: Part[], units = "in"): Promise<Shown> {
  const commands: Record<string, (ctx: unknown) => Promise<void>> = {};
  new Function("sketchcraft", code)({ command: (id: string, fn: (ctx: unknown) => Promise<void>) => (commands[id] = fn) });
  let shown: Shown | null = null;
  await commands["cut-list"]({
    selection: { groups: [], instances: [], faces: [], edges: [] },
    run: async () => ({ ok: true, units, parts }),
    show: (r: Shown) => (shown = r),
  });
  return shown!;
}

const IN = 0.0254;
const col = (s: Shown, name: string) => s.table.columns.indexOf(name);

it("calls dimensional lumber by its name and counts board feet by the nominal size", async () => {
  const s = await cutList([
    { name: "Leg", size: [96 * IN, 3.5 * IN, 1.5 * IN] }, // a 2×4, 8 ft
    { name: "Leg", size: [96 * IN, 3.5 * IN, 1.5 * IN] },
    { name: "Rail", size: [48 * IN, 0.75 * IN, 5.5 * IN] }, // a 1×6 lying on its edge
  ]);
  const leg = s.table.rows.find((r) => r[0] === "Leg")!;
  const rail = s.table.rows.find((r) => r[0] === "Rail")!;
  expect(leg[col(s, "Stock")]).toBe("2×4");
  expect(leg[col(s, "Board ft")]).toBe("10.67"); // 2 × (2 × 4 × 96 / 144)
  expect(rail[col(s, "Stock")]).toBe("1×6");
  expect(rail[col(s, "Board ft")]).toBe("2.00"); // 1 × 6 × 48 / 144
  expect(s.text).toMatch(/boards? of 2×4/);
  expect(s.text).toMatch(/12\.7 board feet/);
});

it("leaves sheet goods out of lumber names and board feet, and measures odd boards as they are", async () => {
  const s = await cutList([
    { name: "Shelf", size: [0.9, 0.3, 0.018], material: "Birch ply" },
    { name: "Slat", size: [1, 0.05, 0.02] },
  ], "m");
  const shelf = s.table.rows.find((r) => r[0] === "Shelf")!;
  const slat = s.table.rows.find((r) => r[0] === "Slat")!;
  expect(shelf[col(s, "Stock")]).toBe("");
  expect(shelf[col(s, "Board ft")]).toBe("");
  expect(slat[col(s, "Stock")]).toBe("");
  // 20 mm × 50 mm × 1 m by its actual size: 0.787 × 1.969 × 39.37 / 144
  expect(Number(slat[col(s, "Board ft")])).toBeCloseTo(0.42, 2);
  expect(s.text).toMatch(/sheet of 18 mm Birch ply/);
});
