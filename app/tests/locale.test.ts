import { expect, it } from "vitest";
import english from "../src/locale-en";
import italian from "../src/locale-it";
import { resolveLanguage, translate } from "../src/locale";
import { LANGUAGE_IDS, LANGUAGE_TABLE } from "../src/languages";
import { guide } from "../src/guide";
import { TOOL_INFO } from "../src/workspace";

it("covers every English message and built-in tool, with explicit null fallbacks", () => {
  expect(Object.keys(italian).sort()).toEqual(Object.keys(english).sort());
  const entries: Record<string, string | null> = italian;
  for (const [id, original] of Object.entries(english)) {
    expect(entries[id] === null || !!entries[id]?.trim()).toBe(true);
    expect(translate("it", id)).toBe(entries[id] ?? original);
  }
  for (const id of Object.keys(TOOL_INFO)) expect(Object.hasOwn(english, `tool.${id}`)).toBe(true);
  expect(translate("it", "toString", "fallback")).toBe("fallback");
});

it("covers every English message in every catalog, with the same placeholders", () => {
  const holes = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
  for (const lang of LANGUAGE_IDS) {
    const entries: Readonly<Record<string, string | null>> = LANGUAGE_TABLE[lang].catalog;
    expect(Object.keys(entries).sort(), lang).toEqual(Object.keys(english).sort());
    for (const [id, original] of Object.entries(english)) {
      const text = entries[id];
      expect(text === null || !!text.trim(), `${lang} ${id}`).toBe(true);
      if (text !== null) expect(holes(text), `${lang} ${id}`).toEqual(holes(original));
      expect(translate(lang, id)).toBe(text ?? original);
    }
    expect(translate(lang, "toString", "fallback")).toBe("fallback");
  }
});

it("translates everything in French, Spanish, German, Portuguese and Simplified Chinese", () => {
  for (const lang of ["fr", "es", "de", "pt", "zh"] as const) {
    expect(Object.values(LANGUAGE_TABLE[lang].catalog).every((text) => text !== null), lang).toBe(true);
  }
});

it("starts from the system locale and honors the selected language", () => {
  expect(resolveLanguage("system", "it-IT")).toBe("it");
  expect(resolveLanguage(null, "ko-KR")).toBe("en");
  expect(resolveLanguage("en", "it-IT")).toBe("en");
  expect(resolveLanguage("it", "en-GB")).toBe("it");
  expect(resolveLanguage("system", "zh-CN")).toBe("zh");
  expect(resolveLanguage("system", "zh-Hans-CN")).toBe("zh");
  expect(resolveLanguage("system", "zh-TW")).toBe("en");
  expect(resolveLanguage("zh", "en-GB")).toBe("zh");
  expect(resolveLanguage("system", "fr-FR")).toBe("fr");
  expect(resolveLanguage("system", "fr-CA")).toBe("fr");
  expect(resolveLanguage("system", "es-ES")).toBe("es");
  expect(resolveLanguage("system", "es-419")).toBe("es");
  expect(resolveLanguage("system", "pt-BR")).toBe("pt");
  expect(resolveLanguage("system", "pt-PT")).toBe("pt");
  expect(resolveLanguage("system", "de-DE")).toBe("de");
  expect(resolveLanguage("system", "de-AT")).toBe("de");
  expect(resolveLanguage("fr", "es-MX")).toBe("fr");
  expect(resolveLanguage("de", "es-MX")).toBe("de");
  expect(resolveLanguage("ko", "es-MX")).toBe("es");
  expect(guide("select", { selected: 3, op: null }, "it").step).toContain("3");
  for (const lang of LANGUAGE_IDS) expect(guide("select", { selected: 3, op: null }, lang).step).toContain("3");
});

it("keeps the modifier hints for the Italian paint and eraser tools", () => {
  expect(translate("it", "tool.paint")).toMatch(/campiona.*Ctrl.*Opzione.*collegate.*Maiusc.*stesso materiale/);
  expect(translate("it", "tool.erase")).toMatch(/Maiusc.*Ctrl.*ammorbidimento/);
});

it("has Simplified Chinese words for the paint and eraser tools", () => {
  expect(translate("zh", "tool.paint")).toMatch(/油漆桶.*Ctrl.*Option.*Shift/);
  expect(translate("zh", "tool.erase")).toMatch(/橡皮擦.*Shift.*Ctrl.*软化/);
});

it("keeps the modifier hints for the French and Spanish paint and eraser tools", () => {
  expect(translate("fr", "tool.paint")).toMatch(/Ctrl.*Option.*Maj/);
  expect(translate("fr", "tool.erase")).toMatch(/Maj.*Ctrl/);
  expect(translate("es", "tool.paint")).toMatch(/Ctrl.*Opción.*Mayús/);
  expect(translate("es", "tool.erase")).toMatch(/Mayús.*Ctrl/);
});

it("keeps the modifier hints for the German and Portuguese paint and eraser tools", () => {
  expect(translate("de", "tool.paint")).toMatch(/Ctrl.*Option.*Umschalt/);
  expect(translate("de", "tool.erase")).toMatch(/Umschalt.*Ctrl/);
  expect(translate("pt", "tool.paint")).toMatch(/Ctrl.*Option.*Shift/);
  expect(translate("pt", "tool.erase")).toMatch(/Shift.*Ctrl/);
});

it("explains the Paint Bucket modifiers in the step hint, in every language", () => {
  for (const lang of LANGUAGE_IDS) {
    const g = guide("paint", { selected: 0, op: null }, lang);
    expect(g.keys.map((k) => k[0])).toEqual(["⌘ click", "Ctrl / Option click", "⇧ click", "Ctrl ⇧ click"]);
    expect(g.keys.every((k) => k[1].trim().length > 5)).toBe(true);
  }
  expect(guide("paint", { selected: 0, op: null }, "en").keys[1][1]).toMatch(/touching faces.*continuing across edges/);
  expect(guide("paint", { selected: 0, op: null }, "it").keys[1][1]).toMatch(/facce collegate/);
  expect(guide("paint", { selected: 0, op: null }, "zh").keys[1][1]).toMatch(/相连面/);
  for (const lang of ["fr", "es", "de", "pt"] as const) {
    expect(guide("paint", { selected: 0, op: null }, lang).keys[1][1]).not.toBe(guide("paint", { selected: 0, op: null }, "en").keys[1][1]);
  }
});
