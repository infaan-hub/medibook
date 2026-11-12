import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en.json";
import sw from "./locales/sw.json";
import fr from "./locales/fr.json";
import es from "./locales/es.json";
import de from "./locales/de.json";

export const APP_LANGUAGES = ["en", "sw", "fr", "es", "de"] as const;
export type AppLanguage = (typeof APP_LANGUAGES)[number];
export const LANGUAGE_NAMES: Record<AppLanguage, string> = {
  en: "English",
  sw: "Kiswahili",
  fr: "Français",
  es: "Español",
  de: "Deutsch",
};
export const LANGUAGE_STORAGE_KEY = "medibook_language";

export function isAppLanguage(value: unknown): value is AppLanguage {
  return typeof value === "string" && APP_LANGUAGES.includes(value as AppLanguage);
}

export function normalizeLanguage(value: string | null | undefined): AppLanguage | null {
  if (!value) return null;
  const normalized = value.toLowerCase().split(/[-_]/)[0];
  return isAppLanguage(normalized) ? normalized : null;
}

export function getStoredLanguage(): AppLanguage | null {
  if (typeof window === "undefined") return null;
  return normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
}

function syncDocumentLanguage(language: string) {
  const normalized = normalizeLanguage(language) ?? "en";
  if (typeof document !== "undefined") document.documentElement.lang = normalized;
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      sw: { translation: sw },
      fr: { translation: fr },
      es: { translation: es },
      de: { translation: de },
    },
    supportedLngs: [...APP_LANGUAGES],
    nonExplicitSupportedLngs: true,
    load: "languageOnly",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ["localStorage"],
    },
  });

i18n.on("initialized", () => syncDocumentLanguage(i18n.resolvedLanguage ?? i18n.language));
i18n.on("languageChanged", (language) => {
  const normalized = normalizeLanguage(language) ?? "en";
  syncDocumentLanguage(normalized);
  if (typeof window !== "undefined") window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
});

/** Change the UI language immediately, and persist the guest/device choice. */
export async function changeAppLanguage(language: AppLanguage): Promise<void> {
  await i18n.changeLanguage(language);
  if (typeof window !== "undefined") window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  syncDocumentLanguage(language);
}

/** A language selection in another open tab takes effect immediately. */
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== LANGUAGE_STORAGE_KEY) return;
    const language = normalizeLanguage(event.newValue);
    if (language && language !== normalizeLanguage(i18n.language)) void i18n.changeLanguage(language);
  });
}

export default i18n;
