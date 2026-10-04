import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { formatMessage, messagePlaceholders, type MessageValue } from "@/i18n/format";
import { LocalizedError, errorFromPayload, localizedErrorPayload, type ErrorKey } from "@/i18n/LocalizedError";
import { LOCALES, SOURCE_MESSAGES, localeCatalog, type MessageKey } from "@/i18n/locales";
import { normalizeLanguagePreference, readStoredLanguagePreference, resolveLocale, LANGUAGE_STORAGE_KEY } from "@/i18n/store";
import { createTranslator, errorText, renderRichTemplate } from "@/i18n/translator";

const sourceKeys = Object.keys(SOURCE_MESSAGES).sort();
const firstErrorKey = sourceKeys.find((key): key is ErrorKey => key.startsWith("errors."));
const sourceKeySet = new Set(sourceKeys);
const untranslatedKeys = (catalog: Partial<Record<string, MessageValue>>) => sourceKeys.filter((key) => catalog[key] === undefined);

describe("message formatting", () => {
  it("interpolates params and leaves unknown placeholders visible", () => {
    expect(formatMessage("Update to {version}", "en", { version: "1.2.0" })).toBe("Update to 1.2.0");
    expect(formatMessage("Hello {name}", "en")).toBe("Hello {name}");
  });

  it("selects Russian plural forms by count", () => {
    const shapes: MessageValue = { one: "{count} фигура", few: "{count} фигуры", many: "{count} фигур", other: "{count} фигуры" };
    expect([1, 3, 5, 21, 1.5].map((count) => formatMessage(shapes, "ru", { count }))).toEqual([
      "1 фигура",
      "3 фигуры",
      "5 фигур",
      "21 фигура",
      "1.5 фигуры",
    ]);
  });

  it("falls back to the other form without a numeric count", () => {
    expect(formatMessage({ one: "{count} shape", other: "{count} shapes" }, "en", { count: "many" })).toBe("many shapes");
  });
});

describe("language preference", () => {
  it("resolves the system language by its base subtag", () => {
    expect(resolveLocale("system", ["ru-RU", "en-US"])).toBe("ru");
    expect(resolveLocale("system", ["ja-JP", "ru"])).toBe("ru");
    expect(resolveLocale("system", ["ja-JP"])).toBe("en");
    // Brazilian Portuguese is the one Portuguese catalog, also for Portugal.
    expect(resolveLocale("system", ["pt-BR"])).toBe("pt");
    expect(resolveLocale("system", ["pt-PT"])).toBe("pt");
    expect(resolveLocale("system", ["de-AT", "en"])).toBe("de");
    expect(resolveLocale("system", [])).toBe("en");
    expect(resolveLocale("en", ["ru-RU"])).toBe("en");
  });

  it("normalizes unknown stored values to system", () => {
    expect(normalizeLanguagePreference("ru")).toBe("ru");
    expect(normalizeLanguagePreference("klingon")).toBe("system");
    expect(normalizeLanguagePreference(null)).toBe("system");
    expect(readStoredLanguagePreference({ getItem: (key) => (key === LANGUAGE_STORAGE_KEY ? "ru" : null) })).toBe("ru");
    expect(readStoredLanguagePreference({ getItem: () => { throw new Error("blocked"); } })).toBe("system");
  });
});

describe.each(LOCALES.map((locale) => [locale.code, localeCatalog(locale.code), locale.complete] as const))("%s catalog", (code, messages, complete) => {
  const catalog: Partial<Record<string, MessageValue>> = messages;
  const pluralCategories = new Intl.PluralRules(code).resolvedOptions().pluralCategories;

  it("has no keys that English lacks", () => {
    expect(Object.keys(catalog).filter((key) => !sourceKeySet.has(key))).toEqual([]);
  });

  // A language being translated (`complete: false` in locales.ts) may lack strings: they show in English.
  // They are reported as a todo, which the test summary always counts, instead of a failure.
  const missing = untranslatedKeys(catalog);
  if (complete || missing.length === 0) {
    it("has every English key", () => {
      expect(missing).toEqual([]);
    });
  } else {
    it.todo(`translate ${missing.length} of ${sourceKeys.length} strings, shown in English until then: ${missing.slice(0, 20).join(", ")}${missing.length > 20 ? ", …" : ""}`);
  }

  it("uses the same placeholders as English", () => {
    const mismatches = sourceKeys.filter((key) => {
      const value = catalog[key];
      return value !== undefined && messagePlaceholders(value).join() !== messagePlaceholders(SOURCE_MESSAGES[key as MessageKey]).join();
    });
    expect(mismatches).toEqual([]);
  });

  it("has every plural form the language needs", () => {
    const incomplete = sourceKeys.filter((key) => {
      const value = catalog[key];
      return typeof value === "object" && pluralCategories.some((category) => typeof value[category] !== "string");
    });
    expect(incomplete).toEqual([]);
  });

  it("has no empty messages", () => {
    const empty = sourceKeys.filter((key) => {
      const value = catalog[key];
      if (value === undefined) return false;
      const forms = typeof value === "object" ? Object.values(value) : [value];
      return forms.some((form) => typeof form !== "string" || form.trim() === "");
    });
    expect(empty).toEqual([]);
  });
});

describe("rich messages", () => {
  const html = (node: ReactNode) => renderToStaticMarkup(createElement("p", null, node));

  it("wraps tagged chunks and inserts node params", () => {
    const rendered = renderRichTemplate("Press <b>Shift + {key}</b> to {action} {count} times", {
      b: (chunks) => createElement("strong", null, chunks),
      key: "R",
      action: createElement("em", null, "rotate"),
      count: 2,
    });
    expect(html(rendered)).toBe("<p>Press <strong>Shift + R</strong> to <em>rotate</em> 2 times</p>");
  });

  it("keeps unknown tags and placeholders as plain text", () => {
    expect(html(renderRichTemplate("<x>bold</x> {missing}", {}))).toBe("<p>bold {missing}</p>");
  });
});

describe("missing translations", () => {
  it("are listed per key", () => {
    const partial = { [sourceKeys[0]]: "x" };
    expect(untranslatedKeys(partial)).toEqual(sourceKeys.slice(1));
  });

  it("show in English", () => {
    const ru: Partial<Record<string, MessageValue>> = localeCatalog("ru");
    const key = "common.language.label";
    const translated = ru[key];
    delete ru[key];
    try {
      expect(createTranslator("ru")(key)).toBe("Language");
    } finally {
      ru[key] = translated;
    }
    expect(createTranslator("ru")(key)).toBe("Язык");
  });
});

describe("languages loaded on demand", () => {
  it("translate with a translator made before the language loaded, once it has", async () => {
    vi.resetModules();
    const fresh = await import("@/i18n/translator");
    const locales = await import("@/i18n/locales");
    expect(locales.isLocaleCatalogLoaded("ru")).toBe(false);
    const ru = fresh.createTranslator("ru");
    // English text with English plural rules until Russian arrives, never a key.
    expect(ru("common.language.label")).toBe("Language");
    expect(ru("dashboard.projects.shapeCount", { count: 3 })).toBe("3 shapes");
    await locales.loadLocaleCatalog("ru");
    expect(ru("common.language.label")).toBe("Язык");
    expect(ru("dashboard.projects.shapeCount", { count: 3 })).toBe("3 фигуры");
  });
});

describe("translator", () => {
  it("translates through the requested locale", () => {
    expect(createTranslator("en")("common.language.label")).toBe("Language");
    expect(createTranslator("ru")("common.language.label")).toBe("Язык");
    expect(createTranslator("ru")).toBe(createTranslator("ru"));
  });

  it("renders localized errors in the UI language and keeps foreign messages", () => {
    const errorKey = firstErrorKey;
    const ru = createTranslator("ru");
    if (errorKey) expect(errorText(ru, new LocalizedError(errorKey), "common.language.label")).toBe(ru(errorKey));
    expect(errorText(ru, new Error("socket hang up"), "common.language.label")).toBe("socket hang up");
    expect(errorText(ru, "boom", "common.language.label")).toBe("Язык");
  });
});

describe("LocalizedError", () => {
  it("keeps an English message and survives a worker round trip", () => {
    const errorKey = firstErrorKey;
    if (!errorKey) return;
    const error = new LocalizedError(errorKey);
    expect(error.message).toBe(createTranslator("en")(errorKey));
    const restored = errorFromPayload(structuredClone(localizedErrorPayload(error)));
    expect(restored).toBeInstanceOf(LocalizedError);
    expect((restored as LocalizedError).key).toBe(errorKey);
    expect(errorFromPayload(localizedErrorPayload(new Error("plain")))).not.toBeInstanceOf(LocalizedError);
  });
});
