import { describe, expect, it } from "vitest";
import { panelTabs, readSideTab, shownTab, stepTab } from "../src/sidetabs";
import english from "../src/locale-en";
import italian from "../src/locale-it";

describe("the Vertical layout's tabs", () => {
  it("adds Properties in Vertical only, and SketchCraft AI last everywhere", () => {
    expect(panelTabs("model", "side", true)).toEqual(["outliner", "library", "views", "properties", "ai"]);
    expect(panelTabs("layout", "side", true)).toEqual(["pages", "outliner", "views", "properties", "ai"]);
    expect(panelTabs("model", "classic", true)).toEqual(["outliner", "library", "views", "ai"]);
    expect(panelTabs("model", "floating", true)).toEqual(["outliner", "library", "views", "ai"]);
  });

  it("reads a remembered tab back only if it is a known one", () => {
    expect(readSideTab("properties")).toBe("properties");
    expect(readSideTab("views")).toBe("views");
    expect(readSideTab("nope")).toBeNull();
    expect(readSideTab(null)).toBeNull();
    expect(readSideTab("__proto__")).toBeNull();
  });

  it("falls back to the first tab when the chosen one isn't there (Properties after leaving Vertical)", () => {
    expect(shownTab("properties", panelTabs("model", "classic", true))).toBe("outliner");
    expect(shownTab("library", panelTabs("layout", "side", true))).toBe("pages");
    expect(shownTab("properties", panelTabs("model", "side", true))).toBe("properties");
  });

  it("moves between tabs with the arrow keys, wrapping, and Home and End", () => {
    const tabs = panelTabs("model", "side", true);
    expect(stepTab(tabs, "outliner", "ArrowRight")).toBe("library");
    expect(stepTab(tabs, "ai", "ArrowRight")).toBe("outliner");
    expect(stepTab(tabs, "outliner", "ArrowLeft")).toBe("ai");
    expect(stepTab(tabs, "views", "Home")).toBe("outliner");
    expect(stepTab(tabs, "views", "End")).toBe("ai");
    expect(stepTab(tabs, "views", "a")).toBeNull();
  });

  it("has the tab's names in English and Italian", () => {
    expect(english["tab.properties"]).toBe("Properties");
    expect(italian["tab.properties"]).toBe("Proprietà");
  });
});

it("leaves SketchCraft AI out unless the labs switch is on", () => {
  expect(panelTabs("model", "side")).toEqual(["outliner", "library", "views", "properties"]);
  expect(panelTabs("model", "classic")).toEqual(["outliner", "library", "views"]);
  expect(panelTabs("model", "classic", true).at(-1)).toBe("ai");
});
