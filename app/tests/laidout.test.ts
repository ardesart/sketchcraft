// The bar shown while the parts are laid out flat: the clicked part's name and size, in the model's units.
import { expect, it } from "vitest";
import type { LaidOut } from "../src/engine";
import { innermostPart, laidOutParts, partLabel } from "../src/laidoutbar";

const laid: LaidOut = {
  parts: [
    { id: 4, name: "Side", kind: "group", material: null, size: [0.9, 0.4, 0.018] },
    { id: 9, name: "Shelf", kind: "component", material: "Pine", size: [0.564, 0.38, 0.018] },
  ],
  gap: 0.036,
  bounds: { min: [0, 0, 0], max: [1, 1, 0.018] },
  loose_faces: 1,
};

it("names the clicked part with its size in the model's units", () => {
  expect(partLabel(laid, [9], "mm")).toBe("Shelf: 564 mm × 380 mm × 18 mm");
  expect(partLabel(laid, [77, 4], "mm")).toBe("Side: 900 mm × 400 mm × 18 mm");
});

it("says nothing when no part is clicked", () => {
  expect(partLabel(laid, [], "mm")).toBeNull();
  expect(partLabel(laid, [77], "mm")).toBeNull();
});

it("takes the part a click lands on, not the group around it", () => {
  const parts = laidOutParts(laid)!;
  // a board (4) inside a group (12) that is no part: the board
  expect(innermostPart([4, 12], parts)).toBe(4);
  // a group asked for as a part (9 here) holding a group that is not one (30): the part
  expect(innermostPart([30, 9, 12], parts)).toBe(9);
  expect(innermostPart([30, 12], parts)).toBeNull();
  expect(laidOutParts(null)).toBeNull();
});
