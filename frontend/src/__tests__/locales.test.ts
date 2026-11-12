/**
 * Locale catalog contract.
 *
 * Every supported language must expose exactly the English key set with the
 * same interpolation placeholders — otherwise a screen silently falls back to
 * English (or renders a literal "{{count}}") after a language switch.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import en from "../locales/en.json";
import sw from "../locales/sw.json";
import fr from "../locales/fr.json";
import es from "../locales/es.json";
import de from "../locales/de.json";
import { APP_LANGUAGES } from "../i18n";

type Catalog = Record<string, unknown>;

function flatten(value: unknown, prefix = ""): Map<string, string> {
  if (value === null || typeof value !== "object") {
    return new Map([[prefix, String(value)]]);
  }
  return new Map(
    Object.entries(value as Catalog).flatMap(([key, child]) => [
      ...flatten(child, prefix ? `${prefix}.${key}` : key),
    ])
  );
}

const catalogs: Record<string, Map<string, string>> = {
  en: flatten(en),
  sw: flatten(sw),
  fr: flatten(fr),
  es: flatten(es),
  de: flatten(de),
};

const english = catalogs.en;

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)]
    .map((match) => match[1])
    .sort();
}

describe("locale catalogs", () => {
  it("covers every supported language", () => {
    expect(Object.keys(catalogs).sort()).toEqual([...APP_LANGUAGES].sort());
  });

  it("has exactly the English key set in every language", () => {
    for (const language of APP_LANGUAGES) {
      const catalog = catalogs[language];
      expect([...catalog.keys()].filter((key) => !english.has(key)), `${language} extra keys`).toEqual([]);
      expect([...english.keys()].filter((key) => !catalog.has(key)), `${language} missing keys`).toEqual([]);
    }
  });

  it("never ships a blank translation", () => {
    for (const language of APP_LANGUAGES) {
      for (const [key, value] of catalogs[language]) {
        expect(value.trim(), `${language}:${key}`).not.toBe("");
      }
    }
  });

  it("keeps interpolation placeholders identical to English", () => {
    for (const language of APP_LANGUAGES) {
      for (const [key, value] of catalogs[language]) {
        const source = english.get(key);
        if (source === undefined) continue;
        expect(placeholders(value), `${language}:${key}`).toEqual(placeholders(source));
      }
    }
  });

  it("resolves every literal t() key used by the app", () => {
    const srcRoot = join(process.cwd(), "src");
    const files: string[] = [];
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full = join(directory, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "__tests__" && entry.name !== "locales") walk(full);
        } else if ([".ts", ".tsx"].includes(extname(entry.name))) {
          files.push(full);
        }
      }
    };
    walk(srcRoot);

    const used = new Set<string>();
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/\b(?:i18n\.)?t\(\s*["']([\w.-]+)["']/g)) {
        used.add(match[1]);
      }
    }

    const unresolved = [...used]
      .filter((key) => !english.has(key) && !english.has(`${key}_one`) && !english.has(`${key}_other`))
      .sort();

    expect(unresolved, `Literal t() keys missing from src/locales/en.json`).toEqual([]);
  });
});
