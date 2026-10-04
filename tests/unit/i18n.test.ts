import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatMessage, messagePlaceholders, type MessageValue } from "@/i18n/format";
import { LocalizedError, errorFromPayload, localizedErrorPayload, type ErrorKey } from "@/i18n/LocalizedError";
import { LOCALES, SOURCE_MESSAGES, type MessageKey } from "@/i18n/locales";
import { normalizeLanguagePreference, readStoredLanguagePreference, resolveLocale, LANGUAGE_STORAGE_KEY } from "@/i18n/store";
import { createTranslator, errorText, renderRichTemplate } from "@/i18n/translator";
import enErrors from "@/i18n/locales/en/errors.json";

const sourceKeys = Object.keys(SOURCE_MESSAGES).sort();

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
    expect(resolveLocale("system", ["de-DE", "ru"])).toBe("ru");
    expect(resolveLocale("system", ["de-DE"])).toBe("en");
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

describe.each(LOCALES.map((locale) => [locale.code, locale.messages] as const))("%s catalog", (code, messages) => {
  const catalog: Partial<Record<string, MessageValue>> = messages;
  const pluralCategories = new Intl.PluralRules(code).resolvedOptions().pluralCategories;

  it("has exactly the English keys", () => {
    expect(Object.keys(catalog).sort()).toEqual(sourceKeys);
  });

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

describe("translator", () => {
  it("translates through the requested locale", () => {
    expect(createTranslator("en")("common.language.label")).toBe("Language");
    expect(createTranslator("ru")("common.language.label")).toBe("Язык");
    expect(createTranslator("ru")).toBe(createTranslator("ru"));
  });

  it("renders localized errors in the UI language and keeps foreign messages", () => {
    const errorKey = Object.keys(enErrors)[0] as ErrorKey | undefined;
    const ru = createTranslator("ru");
    if (errorKey) expect(errorText(ru, new LocalizedError(errorKey), "common.language.label")).toBe(ru(errorKey));
    expect(errorText(ru, new Error("socket hang up"), "common.language.label")).toBe("socket hang up");
    expect(errorText(ru, "boom", "common.language.label")).toBe("Язык");
  });
});

describe("LocalizedError", () => {
  it("keeps an English message and survives a worker round trip", () => {
    const errorKey = Object.keys(enErrors)[0] as ErrorKey | undefined;
    if (!errorKey) return;
    const error = new LocalizedError(errorKey);
    expect(error.message).toBe(createTranslator("en")(errorKey));
    const restored = errorFromPayload(structuredClone(localizedErrorPayload(error)));
    expect(restored).toBeInstanceOf(LocalizedError);
    expect((restored as LocalizedError).key).toBe(errorKey);
    expect(errorFromPayload(localizedErrorPayload(new Error("plain")))).not.toBeInstanceOf(LocalizedError);
  });
});
