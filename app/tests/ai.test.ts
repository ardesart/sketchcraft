import { describe, expect, it } from "vitest";
import rs from "../src-tauri/src/ai.rs?raw";
import { chatMessages, parseAnswer, repair, SHORT_SYSTEM } from "../src/ai";
// @ts-expect-error plain .mjs from the minimodel tools (no types)
import * as spec from "../../tools/minimodel/lib/spec.mjs";

describe("SketchCraft AI prompt and answer reading", () => {
  it("uses exactly the prompt and message format the model was trained with", () => {
    expect(SHORT_SYSTEM).toBe(spec.SHORT_SYSTEM);
    expect(chatMessages("empty model", "a box")).toEqual(spec.chatMessages("empty model", "a box"));
  });
  it("the Rust allowlist is the spec's command table minus undo", () => {
    const body = /MODEL_ALLOW: &\[&str\] = &\[([^\]]*)\]/.exec(rs)![1];
    const names = [...body.matchAll(/"(\w+)"/g)].map((m) => m[1]);
    expect(names).toEqual((spec.COMMANDS as [string][]).map((c) => c[0]).filter((n) => n !== "undo"));
  });
  it("reads fenced, wrapped and bare answers; rejects non-commands", () => {
    expect(parseAnswer('{"commands":[{"cmd":"info"}]}')).toEqual([{ cmd: "info" }]);
    expect(parseAnswer('```json\n{"commands":[{"cmd":"info"}]}\n```')).toEqual([{ cmd: "info" }]);
    expect(parseAnswer("sorry")).toBeNull();
    expect(parseAnswer('{"commands":["rm -rf /"]}')).toBeNull();
  });
  it("turns a box-in-one-rect into rect + pushpull", () => {
    const out = repair([{ cmd: "rect", from: [0, 0, 0], to: [4, 3, 2.5] }]);
    expect(out.map((c) => c.cmd)).toEqual(["rect", "pushpull"]);
  });
});

import { aiName } from "../src/ai";
describe("aiName", () => {
  it("names things the way the model writes them", () => {
    expect(aiName("Box")).toBe("box");
    expect(aiName("Big Box")).toBe("big_box");
    expect(aiName("  Wine-cooler 2 ")).toBe("wine_cooler_2");
    expect(aiName("Küche!")).toBe("kche");
  });
});
