import { expect, it } from "vitest";
import { LABS_AI_KEY, labsOn } from "../src/labs";

const store = (v: string | null) => ({ getItem: () => v });

it("is off unless the key is exactly 1", () => {
  expect(labsOn(LABS_AI_KEY, store(null))).toBe(false);
  expect(labsOn(LABS_AI_KEY, store("true"))).toBe(false);
  expect(labsOn(LABS_AI_KEY, store("1"))).toBe(true);
  expect(labsOn(LABS_AI_KEY, undefined)).toBe(false);
  expect(labsOn(LABS_AI_KEY, { getItem: () => { throw new Error("blocked"); } })).toBe(false);
});
