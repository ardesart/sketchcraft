import { describe, expect, it } from "vitest";
import { FIT_RADIUS_FLOOR, fitDistance, fitRadius, perspectiveNear } from "../src/viewport/fit";

const FOV = 40;

describe("viewport fit", () => {
  it("frames a desk-sized drink chiller in proportion to a house", () => {
    const chillerRadius = fitRadius({ x: 0.27, y: 0.2, z: 0.24 });
    const houseRadius = fitRadius({ x: 10, y: 8, z: 6 });
    const chillerDistance = fitDistance(chillerRadius, FOV);
    const houseDistance = fitDistance(houseRadius, FOV);

    expect(chillerDistance).toBeLessThan(1);
    expect(chillerDistance / chillerRadius).toBeCloseTo(houseDistance / houseRadius, 12);
  });

  it("keeps the old framing for a house-sized box", () => {
    const size = { x: 10, y: 8, z: 6 };
    const oldRadius = Math.max(Math.sqrt(size.x * size.x + size.y * size.y + size.z * size.z) / 2, 1.5);
    const oldDistance = (oldRadius / Math.sin((FOV / 2) * (Math.PI / 180))) * 1.05;

    expect(fitDistance(fitRadius(size), FOV)).toBe(oldDistance);
  });

  it("uses the small floor for a zero-size box", () => {
    const radius = fitRadius({ x: 0, y: 0, z: 0 });

    expect(radius).toBe(FIT_RADIUS_FLOOR);
    expect(Number.isFinite(fitDistance(radius, FOV))).toBe(true);
  });

  it("moves the near plane in for close views without changing normal views", () => {
    expect(perspectiveNear(0.06)).toBeCloseTo(0.006);
    expect(perspectiveNear(10)).toBe(0.05);
  });
});
