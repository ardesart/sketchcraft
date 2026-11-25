// The languages the app speaks, in Language-menu order. Adding one is a catalog file plus one line here.
// Pure (no React), so the menu model and the tests can use it too.
import english from "./locale-en";
import italian from "./locale-it";
import chinese from "./locale-zh";
import french from "./locale-fr";
import spanish from "./locale-es";
import german from "./locale-de";
import portuguese from "./locale-pt";

type Catalog = Readonly<Record<string, string | null>>;

export const LANGUAGE_TABLE = {
  de: { name: "Deutsch", tag: "de", catalog: german as Catalog },
  en: { name: "English", tag: "en", catalog: english as Catalog },
  es: { name: "Español", tag: "es", catalog: spanish as Catalog },
  fr: { name: "Français", tag: "fr", catalog: french as Catalog },
  it: { name: "Italiano", tag: "it", catalog: italian as Catalog },
  pt: { name: "Português", tag: "pt-BR", catalog: portuguese as Catalog },
  zh: { name: "简体中文", tag: "zh-Hans", catalog: chinese as Catalog },
} as const;

export type Language = keyof typeof LANGUAGE_TABLE;
export const LANGUAGE_IDS = Object.keys(LANGUAGE_TABLE) as Language[];

export const isLanguage = (value: unknown): value is Language =>
  typeof value === "string" && Object.hasOwn(LANGUAGE_TABLE, value);

/** The language for a system locale such as "fr-CA" or "zh-Hans-CN"; English when there is no catalog for it. */
export function systemLanguage(system: string): Language {
  // Traditional Chinese keeps the English UI until a zh-Hant catalog exists.
  if (/^zh-(?:Hant|TW|HK|MO)(?:-|$)/i.test(system)) return "en";
  const base = system.split(/[-_]/)[0].toLowerCase();
  return isLanguage(base) ? base : "en";
}
