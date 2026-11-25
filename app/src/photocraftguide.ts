// The UV guide PhotoCraft shows on top of a picture (photocraft.ts), as plain geometry so it can be tested on its own.
import { loopEdges, type UvFace } from "./uveditor";

export type Seg = [number, number, number, number];

/** The UV guide's lines in pixels for a w × h picture (u → x, v up → y down, as the engine maps them), each shared
 *  edge once. */
export function guideSegments(faces: UvFace[], w: number, h: number): Seg[] {
  const seen = new Set<string>();
  const out: Seg[] = [];
  const px = (uv: [number, number]): [number, number] => [uv[0] * w, (1 - uv[1]) * h];
  for (const f of faces) {
    for (const [a, b] of loopEdges(f)) {
      const p = px(f.uv[a]);
      const q = px(f.uv[b]);
      const k1 = `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
      const k2 = `${q[0].toFixed(2)},${q[1].toFixed(2)}`;
      const key = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([p[0], p[1], q[0], q[1]]);
    }
  }
  return out;
}
