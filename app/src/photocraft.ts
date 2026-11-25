// Edit in PhotoCraft: send a material's picture to PhotoCraft with its UV layout as a guide layer, and take it back
// every time it's saved there. The files (an OpenRaster .ora in a Textures folder beside the model), the launch and
// the flattening are the desktop side's (src-tauri/src/photocraft.rs); this decides what to send and watches.
//
// The faces' picture is edited as it is when they wear one (the tile itself, like SketchUp's "edit texture image").
// Faces with only a colour first get a paint texture of their own (unwrapped if needed, their look baked in), so
// there is a picture to edit. The UV guide is drawn only when the UVs are a clean layout (inside 0..1, no overlaps).
import { invoke } from "@tauri-apps/api/core";
import { exec, inTauri, loadScene, onMobileApp, type Reply, type Scene } from "./engine";
import type { UvFace } from "./uveditor";
import { guideSegments, type Seg } from "./photocraftguide";
import { paintMaterialOf } from "./texturepaint";

export { guideSegments };

/** PhotoCraft is a desktop app: the menu item shows only there. */
export const photocraftHere = inTauri && !onMobileApp;

/** How often a saved file is looked for, and for how long after opening. */
const POLL_MS = 1500;
const WATCH_MS = 4 * 60 * 60 * 1000;

/** The guide as a transparent PNG data: URL: bright lines with a dark edge, readable on any picture. */
function drawGuide(segs: Seg[], w: number, h: number): string {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const lw = Math.max(1, Math.round(Math.max(w, h) / 1024));
  g.lineCap = "round";
  for (const [style, width] of [["rgba(0,0,0,0.75)", lw + 2], ["#3ee6ff", lw]] as const) {
    g.strokeStyle = style;
    g.lineWidth = width;
    g.beginPath();
    for (const [x1, y1, x2, y2] of segs) {
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
    }
    g.stroke();
  }
  return c.toDataURL("image/png");
}

/** A picture's size in pixels. */
function sizeOf(data: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error("unreadable picture"));
    img.src = data;
  });
}

const watchers = new Map<string, number>();

/** Stop watching every material (a new or reopened model). */
export function stopWatching() {
  for (const id of watchers.values()) window.clearInterval(id);
  watchers.clear();
}

type Say = (text: string, bad?: boolean) => void;
type Tr = (id: string) => string;

/** Tools › Edit texture in PhotoCraft…: for the selection (`ids` of faces, groups, components). */
export async function editInPhotoCraft(scene: Scene, ids: number[], sel: { faces: number[]; groups: number[] }, run: (cmd: Record<string, unknown>) => Promise<Reply>, say: Say, t: Tr) {
  if (!ids.length) return say(t("pc.none"), true);
  let material = paintMaterialOf(scene, sel);
  let fresh = scene;
  if (!material) {
    // only a colour: give the faces a picture of their own first (one undo step), their look baked in
    const r = await run({ cmd: "texture_paint_new", faces: ids, size: 2048, unwrap: true, base: "material" });
    if (!r.ok) return;
    material = String(r.material);
    fresh = await loadScene();
  }
  const m = fresh.materials.find((x) => x.name === material);
  if (!m?.texture?.data) return say(t("pc.nopicture"), true);

  // the guide: only when the UVs are one clean layout over the picture
  let guide: string | undefined;
  const status = await exec({ cmd: "texture_paint_status", faces: ids });
  const clean = status.ok && !((status.without as number[] | undefined)?.length) && !status.overlap && !status.outside;
  if (clean) {
    const info = await exec({ cmd: "uv_info", faces: ids });
    const faces = info.ok ? ((info.faces as UvFace[]) ?? []).filter((f) => f.material === material) : [];
    if (faces.length) {
      const { w, h } = await sizeOf(m.texture.data);
      guide = drawGuide(guideSegments(faces, w, h), w, h);
    }
  }

  let opened: { path: string; modified: number; reused: boolean };
  try {
    opened = await invoke("photocraft_open", { material, texture: m.texture.data, guide: guide ?? null });
  } catch (e) {
    return say(String(e), true);
  }
  say(t(opened.reused ? "pc.reopened" : "pc.opened").replace("{name}", material));
  watch(material, opened.modified, run, say, t);
}

function watch(material: string, since: number, run: (cmd: Record<string, unknown>) => Promise<Reply>, say: Say, t: Tr) {
  if (watchers.has(material)) window.clearInterval(watchers.get(material));
  const started = Date.now();
  let last = since;
  let busy = false;
  let warnedPsd = false;
  const id = window.setInterval(async () => {
    if (busy) return;
    if (Date.now() - started > WATCH_MS) {
      window.clearInterval(id);
      watchers.delete(material);
      return;
    }
    busy = true;
    try {
      const r = await invoke<{ modified: number; data?: string; psd?: boolean }>("photocraft_poll", { material, since: last });
      if (r.data) {
        last = r.modified;
        const done = await run({ cmd: "texture", name: material, data: r.data });
        if (done.ok) say(t("pc.back").replace("{name}", material));
      } else if (r.psd && !warnedPsd) {
        warnedPsd = true;
        say(t("pc.psd"), true);
      }
    } catch (e) {
      say(String(e), true);
    } finally {
      busy = false;
    }
  }, POLL_MS);
  watchers.set(material, id);
}
