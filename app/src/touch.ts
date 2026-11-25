// Touch screens (phones, tablets): one finger is the tool, like the left mouse button; two fingers move the
// camera (drag to orbit, pinch to zoom, through OrbitControls). A second finger landing turns the touch into a
// camera gesture: the tool stops hearing those fingers until all of them lift, and whatever the first finger
// had just started is cancelled. Mouse and pen input never come through here as a gesture.

type Pointer = Pick<PointerEvent, "pointerId" | "pointerType">;

export class TouchGestures {
  private fingers = new Set<number>();
  private gesture = false;
  /** was a tool operation already under way when the first finger landed? (then a gesture leaves it alone) */
  private opBefore = false;

  /** A pointer went down. Returns "gesture-start" when this finger turns the touch into a camera gesture. */
  down(e: Pointer, opInProgress: boolean): "gesture-start" | null {
    if (e.pointerType !== "touch") return null;
    if (this.fingers.size === 0) {
      this.gesture = false;
      this.opBefore = opInProgress;
    }
    this.fingers.add(e.pointerId);
    if (this.fingers.size >= 2 && !this.gesture) {
      this.gesture = true;
      return "gesture-start";
    }
    return null;
  }

  /** A pointer lifted or was cancelled. */
  up(e: Pointer): void {
    if (e.pointerType !== "touch") return;
    this.fingers.delete(e.pointerId);
    if (this.fingers.size === 0) this.gesture = false;
  }

  /** Is any finger still down? */
  touching(): boolean {
    return this.fingers.size > 0;
  }

  /** Should the tool ignore this pointer event? (true for every finger while a two-finger gesture lasts) */
  ignore(e: Pointer): boolean {
    return e.pointerType === "touch" && this.gesture;
  }

  /** On gesture start: cancel what the first finger started, but not an operation that was already going. */
  cancelsOperation(): boolean {
    return !this.opBefore;
  }
}

/** OrbitControls' touch mapping for a tool: one finger orbits or pans only with those tools, two always orbit and zoom. */
export function touchMapping(tool: string, TOUCH: { ROTATE: number; PAN: number; DOLLY_ROTATE: number }) {
  return {
    ONE: tool === "orbit" ? TOUCH.ROTATE : tool === "pan" ? TOUCH.PAN : (null as unknown as number),
    TWO: TOUCH.DOLLY_ROTATE,
  };
}
