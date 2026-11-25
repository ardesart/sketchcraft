import { expect, it } from "vitest";
import { guideSegments } from "../src/photocraftguide";
import type { UvFace } from "../src/uveditor";

const quad = (id: number, uv: [number, number][]): UvFace => ({ id, material: "M", verts: uv.map((_, i) => id * 10 + i), loops: [uv.length], uv, island: 0 });

it("draws the UV layout in picture pixels, v up", () => {
  const segs = guideSegments([quad(1, [[0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5]])], 200, 100);
  expect(segs).toHaveLength(4);
  // (0,0) is the picture's bottom-left; (0.5, 0.5) is halfway across and halfway up
  expect(segs[0]).toEqual([0, 100, 100, 100]);
  expect(segs[1]).toEqual([100, 100, 100, 50]);
});

it("draws an edge two faces share once", () => {
  const a = quad(1, [[0, 0], [0.5, 0], [0.5, 1], [0, 1]]);
  const b = quad(2, [[0.5, 0], [1, 0], [1, 1], [0.5, 1]]);
  expect(guideSegments([a, b], 100, 100)).toHaveLength(7); // 4 + 4, minus the shared middle edge
});

it("draws holes too", () => {
  const ring: UvFace = { id: 3, material: "M", verts: [0, 1, 2, 3, 4, 5, 6, 7], loops: [4, 4], uv: [[0, 0], [1, 0], [1, 1], [0, 1], [0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]], island: 0 };
  expect(guideSegments([ring], 64, 64)).toHaveLength(8);
});
