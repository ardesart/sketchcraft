// Inference: lining the cursor up with points hovered earlier ("From Point"), and with two of
// them at once: where their axis lines cross (the middle of a board from two of its sides).
import { OrthographicCamera, PerspectiveCamera, Vector3, type Camera } from "three";
import { beforeEach, expect, it } from "vitest";
import type { Scene } from "../src/engine";
import { crossing, forgetRecent, infer, type InferEnv, type Pick } from "../src/inference";

const W = 800, H = 600;
type Seg = [number, number, number, number, number, number];
const scene = (segs: Seg[]): Scene => ({ edges: segs.flat(), guides: [], edgeList: [] }) as unknown as Scene;

/** Straight down on the ground, 100 pixels to the metre (`span` metres across the window). */
function topView(span = 8): Camera {
  const c = new OrthographicCamera(-span / 2, span / 2, (span * H) / W / 2, (-span * H) / W / 2, 0.1, 100);
  c.position.set(0, 0, 10);
  c.updateMatrixWorld();
  c.updateProjectionMatrix();
  return c;
}
function env(camera: Camera, segs: Seg[], pick: InferEnv["pick"] = () => null): InferEnv {
  return { camera, rect: { left: 0, top: 0, width: W, height: H } as DOMRect, scene: scene(segs), pick, groundZ: 0 };
}
/** The pointer over a point of the model, `dx`, `dy` pixels off it. */
function over(camera: Camera, p: Vector3, dx = 0, dy = 0) {
  const q = p.clone().project(camera);
  return { clientX: (q.x * 0.5 + 0.5) * W + dx, clientY: (-q.y * 0.5 + 0.5) * H + dy };
}
/** Rest the cursor on the middle of an edge, as a person does before lining up with it. */
function hover(E: InferEnv, mid: Vector3) {
  const sn = infer(E, over(E.camera, mid));
  expect(sn.kind).toBe("midpoint");
  expect(sn.p.distanceTo(mid)).toBeLessThan(1e-9);
}

// a 3 m by 2 m board lying on the ground, away from the origin
const board: Seg[] = [
  [0.5, 0.5, 0, 3.5, 0.5, 0], [3.5, 0.5, 0, 3.5, 2.5, 0], [3.5, 2.5, 0, 0.5, 2.5, 0], [0.5, 2.5, 0, 0.5, 0.5, 0],
];
const front = new Vector3(2, 0.5, 0); // middle of the front side
const left = new Vector3(0.5, 1.5, 0); // middle of the left side
const middle = new Vector3(2, 1.5, 0);

beforeEach(() => forgetRecent());

it("finds the middle of a board from the midpoints of two of its sides", () => {
  const E = env(topView(), board);
  hover(E, front);
  hover(E, left);
  const sn = infer(E, over(E.camera, middle, 3, -2));
  expect(sn.p.distanceTo(middle)).toBeLessThan(1e-9);
  expect(sn.label).toBe("From Points");
  expect(sn.kind).toBe("axis");
  // both points it lines up with, each with its axis, so both dotted lines can be drawn
  expect([sn.from?.toArray(), sn.from2?.toArray()]).toEqual([front.toArray(), left.toArray()]);
  expect([sn.axis, sn.axis2]).toEqual([1, 0]);
});

it("finds it in a perspective view too", () => {
  const c = new PerspectiveCamera(50, W / H, 0.1, 100);
  c.position.set(5, -3, 4);
  c.up.set(0, 0, 1);
  c.lookAt(middle);
  c.updateMatrixWorld();
  const E = env(c, board);
  hover(E, front);
  hover(E, left);
  const sn = infer(E, over(c, middle, -4, 3));
  expect(sn.p.distanceTo(middle)).toBeLessThan(1e-9);
  expect(sn.label).toBe("From Points");
});

it("finds it while drawing a line from a corner", () => {
  const E = env(topView(), board);
  hover(E, front);
  hover(E, left);
  const sn = infer(E, over(E.camera, middle, 2, 2), { anchor: new Vector3(0.5, 0.5, 0) });
  expect(sn.p.distanceTo(middle)).toBeLessThan(1e-9);
  expect(sn.label).toBe("From Points");
});

it("drawing along an axis from the last point still comes first", () => {
  const E = env(topView(), board);
  hover(E, front);
  hover(E, left);
  // up the green axis from the front midpoint: level with the left one at the middle
  const sn = infer(E, over(E.camera, middle, 3, -2), { anchor: front.clone() });
  expect(sn.label).toBe("On Green Axis · From Point");
  expect(sn.p.distanceTo(middle)).toBeLessThan(1e-9);
  expect(sn.from2).toBeUndefined();
});

it("finds the middle of a part a few centimetres across", () => {
  // 40 mm by 20 mm, one pixel a tenth of a millimetre
  const part: Seg[] = [
    [0.01, 0.005, 0, 0.05, 0.005, 0], [0.05, 0.005, 0, 0.05, 0.025, 0], [0.05, 0.025, 0, 0.01, 0.025, 0], [0.01, 0.025, 0, 0.01, 0.005, 0],
  ];
  const E = env(topView(0.08), part);
  hover(E, new Vector3(0.03, 0.005, 0));
  hover(E, new Vector3(0.01, 0.015, 0));
  const sn = infer(E, over(E.camera, new Vector3(0.03, 0.015, 0), 3, 3));
  expect(sn.p.distanceTo(new Vector3(0.03, 0.015, 0))).toBeLessThan(1e-9);
  expect(sn.label).toBe("From Points");
});

it("one hovered point lines up along its axis as before", () => {
  const E = env(topView(), board);
  hover(E, front);
  const sn = infer(E, over(E.camera, middle, 3, -2));
  expect(sn.label).toBe("From Point");
  expect(sn.p.toArray()).toEqual([2, expect.closeTo(1.52, 9), 0]);
  expect(sn.from?.toArray()).toEqual(front.toArray());
  expect(sn.axis).toBe(1);
  expect(sn.from2).toBeUndefined();
  expect(sn.axis2).toBeUndefined();
});

it("two hovered points still give one line away from where the lines cross", () => {
  const E = env(topView(), board);
  hover(E, front);
  hover(E, left);
  // on the line up from the front midpoint, 40 pixels short of the middle
  const sn = infer(E, over(E.camera, new Vector3(2, 1.1, 0), 2, 0));
  expect(sn.label).toBe("From Point");
  expect(sn.p.toArray()).toEqual([2, expect.closeTo(1.1, 9), 0]);
  expect(sn.from2).toBeUndefined();
});

it("two hovered points lined up along the same axis have no crossing: one line, as before", () => {
  const E = env(topView(), board);
  const back = new Vector3(2, 2.5, 0); // middle of the back side, straight across from the front one
  hover(E, front);
  hover(E, back);
  // their green lines are one and the same line, their red lines never meet
  const green = new Vector3(0, 1, 0), red = new Vector3(1, 0, 0);
  expect(crossing(front, green, back, green)).toBeNull();
  expect(crossing(front, red, back, red)).toBeNull();
  const sn = infer(E, over(E.camera, middle, 3, -2));
  expect(sn.label).toBe("From Point");
  expect(sn.p.toArray()).toEqual([2, expect.closeTo(1.52, 9), 0]);
  expect(sn.axis).toBe(1);
  expect(sn.from2).toBeUndefined();
  expect(sn.axis2).toBeUndefined();
});

it("lines that pass each other at different heights do not count as crossing", () => {
  // the left side is a metre above the front side: seen from above the lines cross, in the model they do not
  const E = env(topView(), [board[0], [0.5, 2.5, 1, 0.5, 0.5, 1]]);
  const high = new Vector3(0.5, 1.5, 1);
  hover(E, front);
  hover(E, high);
  const sn = infer(E, over(E.camera, middle, 2, -1));
  expect(sn.label).toBe("From Point");
  expect(sn.from2).toBeUndefined();
  expect(sn.p.toArray()).toEqual([expect.closeTo(2.02, 9), 1.5, 1]);
});

it("a crossing off the drawing plane is ignored", () => {
  const E = env(topView(), board);
  hover(E, front);
  hover(E, left);
  // drawing a metre up: the crossing lies on the ground, under the plane
  const sn = infer(E, over(E.camera, middle, 3, -2), { plane: { origin: new Vector3(0, 0, 1), normal: new Vector3(0, 0, 1) } });
  expect(sn.kind).toBe("plane");
  expect(sn.p.z).toBeCloseTo(1, 9);
  expect(sn.from).toBeUndefined();
});

it("a crossing hidden behind the surface under the cursor is ignored", () => {
  let hit: Pick | null = null;
  const E = env(topView(), board, () => hit);
  hover(E, front);
  hover(E, left);
  // a surface five metres above the board, between the camera and the crossing
  const e = over(E.camera, middle, 3, -2);
  hit = { face: null, owner: 0, point: new Vector3(2.03, 1.52, 5), distance: 5 };
  const sn = infer(E, e);
  expect(sn.kind).toBe("face");
  expect(sn.from).toBeUndefined();
});

it("an endpoint next to the crossing still wins", () => {
  // a line ending four pixels from the middle of the board
  const E = env(topView(), [...board, [2.04, 1.5, 0, 2.04, 2.2, 0]]);
  hover(E, front);
  hover(E, left);
  const sn = infer(E, over(E.camera, middle));
  expect(sn.kind).toBe("endpoint");
  expect(sn.p.toArray()).toEqual([2.04, 1.5, 0]);
});
