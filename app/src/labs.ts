// Labs: features that are in the app but not shown yet. Each is off unless its key is set to "1" in localStorage
// (in the app's console: localStorage.setItem("sketchcraft.labs.ai", "1"), then reload).

/** SketchCraft AI (the AI tab, the top-bar button, the @name hint in Properties): still being trained and tested. */
export const LABS_AI_KEY = "sketchcraft.labs.ai";

export function labsOn(key: string, store: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): boolean {
  try {
    return store?.getItem(key) === "1";
  } catch {
    return false;
  }
}

export const labsAi = () => labsOn(LABS_AI_KEY);
