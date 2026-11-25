import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { LANGUAGE_TABLE, isLanguage, systemLanguage, type Language } from "./languages";

export type { Language } from "./languages";
type Preference = Language | "system";
const storageKey = "sketchcraft.language";

export function resolveLanguage(preference: string | null, system: string): Language {
  return isLanguage(preference) ? preference : systemLanguage(system);
}

export function translate(language: Language, id: string, fallback = id): string {
  const lookup = (catalog: Readonly<Record<string, string | null>>) => Object.hasOwn(catalog, id) ? catalog[id] : null;
  return lookup(LANGUAGE_TABLE[language].catalog) ?? lookup(LANGUAGE_TABLE.en.catalog) ?? fallback;
}

function readPreference(): Preference {
  try {
    const saved = localStorage.getItem(storageKey);
    if (isLanguage(saved)) return saved;
  } catch {}
  return "system";
}

type Locale = { language: Language; preference: Preference; setPreference: (value: string) => void; t: (id: string) => string };
const Context = createContext<Locale>({
  language: "en", preference: "system", setPreference: () => {}, t: (id) => translate("en", id),
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [preference, choose] = useState(readPreference);
  const [system, setSystem] = useState(navigator.language);
  useEffect(() => {
    const update = () => setSystem(navigator.language);
    window.addEventListener("languagechange", update);
    return () => window.removeEventListener("languagechange", update);
  }, []);
  const language = resolveLanguage(preference, system);
  useEffect(() => { document.documentElement.lang = LANGUAGE_TABLE[language].tag; }, [language]);
  const setPreference = (value: string) => {
    if (value !== "system" && !isLanguage(value)) return;
    choose(value);
    try { localStorage.setItem(storageKey, value); } catch {}
  };
  return <Context.Provider value={{ language, preference, setPreference, t: (id) => translate(language, id) }}>{children}</Context.Provider>;
}

export const useLocale = () => useContext(Context);
