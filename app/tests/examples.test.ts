import { expect, it } from "vitest";
import { EXAMPLES } from "../src/templates";

it("bundles each example as a model in the current format, with a picture", () => {
  expect(EXAMPLES.map((x) => x.name)).toContain("Townhouse");
  for (const x of EXAMPLES) {
    const m = JSON.parse(x.data);
    expect(m.format, x.name).toBeTruthy();
    expect(Object.keys(m.faces).length, x.name).toBeGreaterThan(0);
    expect(x.thumb, x.name).toBeTruthy();
  }
});
