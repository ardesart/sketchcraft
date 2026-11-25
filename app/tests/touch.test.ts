import { expect, it } from "vitest";
import { TouchGestures, touchMapping } from "../src/touch";

const touch = (id: number) => ({ pointerId: id, pointerType: "touch" });
const TOUCH = { ROTATE: 0, PAN: 1, DOLLY_PAN: 2, DOLLY_ROTATE: 3 };

it("lets one finger use the tool, like the left mouse button", () => {
  const g = new TouchGestures();
  expect(g.down(touch(1), false)).toBe(null);
  expect(g.ignore(touch(1))).toBe(false);
  g.up(touch(1));
  expect(g.touching()).toBe(false);
});

it("turns a second finger into a camera gesture until every finger lifts", () => {
  const g = new TouchGestures();
  g.down(touch(1), false);
  expect(g.down(touch(2), false)).toBe("gesture-start");
  expect(g.cancelsOperation()).toBe(true); // what the first finger started is dropped
  expect(g.ignore(touch(1))).toBe(true);
  expect(g.ignore(touch(2))).toBe(true);
  g.up(touch(2));
  expect(g.ignore(touch(1))).toBe(true); // still the same gesture with one finger left
  g.up(touch(1));
  expect(g.down(touch(3), false)).toBe(null); // a fresh touch is the tool again
  expect(g.ignore(touch(3))).toBe(false);
});

it("keeps an operation that was already under way when the gesture began", () => {
  const g = new TouchGestures();
  g.down(touch(1), true); // e.g. halfway through a line
  expect(g.down(touch(2), true)).toBe("gesture-start");
  expect(g.cancelsOperation()).toBe(false);
});

it("never treats the mouse or a pen as a gesture", () => {
  const g = new TouchGestures();
  const mouse = { pointerId: 1, pointerType: "mouse" };
  const pen = { pointerId: 2, pointerType: "pen" };
  expect(g.down(mouse, false)).toBe(null);
  expect(g.down(pen, false)).toBe(null);
  expect(g.ignore(mouse)).toBe(false);
  expect(g.touching()).toBe(false);
});

it("orbits and zooms with two fingers; one finger moves the camera only with Orbit or Pan", () => {
  expect(touchMapping("line", TOUCH)).toEqual({ ONE: null, TWO: TOUCH.DOLLY_ROTATE });
  expect(touchMapping("orbit", TOUCH).ONE).toBe(TOUCH.ROTATE);
  expect(touchMapping("pan", TOUCH).ONE).toBe(TOUCH.PAN);
});
