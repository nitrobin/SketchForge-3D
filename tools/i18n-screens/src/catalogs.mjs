import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/** Reads apps/web/src/i18n/locales/<code>/*.json into flat key → value maps. */
export function loadCatalogs(localesDir) {
  const catalogs = new Map();
  for (const code of readdirSync(localesDir)) {
    const dir = path.join(localesDir, code);
    if (!statSync(dir).isDirectory()) continue;
    const messages = {};
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
      Object.assign(messages, JSON.parse(readFileSync(path.join(dir, file), "utf8")));
    }
    catalogs.set(code, messages);
  }
  return catalogs;
}

/** Message text for a plain key, English when the language lacks it. Used to find buttons by their label. */
export function messageText(catalogs, lang, key) {
  const value = catalogs.get(lang)?.[key] ?? catalogs.get("en")?.[key];
  if (typeof value !== "string") throw new Error(`No plain message for ${key}`);
  return value;
}

function templates(value) {
  const forms = typeof value === "string" ? [value] : Object.values(value ?? {});
  return forms.filter((form) => typeof form === "string").map((form) => form.replace(/<\/?\w+>/g, ""));
}

function templatePattern(template) {
  const escaped = template
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\\\{count\\\}/g, "(\\d[\\d.,\\s]*)")
    .replace(/\\\{\w+\\\}/g, "(.+?)");
  return new RegExp(`^${escaped}$`, "s");
}

/**
 * Catalog keys whose text renders as `text` in `lang`: exact matches first, then templates with
 * {params}. Returns at most `limit` keys with the file each lives in.
 */
export function createKeyFinder(catalogs, localesDir, repoRoot) {
  const indexes = new Map();
  const indexFor = (lang) => {
    if (!indexes.has(lang)) {
      const exact = new Map();
      const patterns = [];
      for (const [key, value] of Object.entries(catalogs.get(lang) ?? {})) {
        for (const template of templates(value)) {
          if (/\{\w+\}/.test(template)) patterns.push({ key, pattern: templatePattern(template) });
          else exact.set(template.trim(), [...(exact.get(template.trim()) ?? []), key]);
        }
      }
      indexes.set(lang, { exact, patterns });
    }
    return indexes.get(lang);
  };
  const fileFor = (lang, key) => path.relative(repoRoot, path.join(localesDir, lang, key.startsWith("desktop.") ? "desktop.json" : "messages.json"));

  return (lang, text, limit = 3) => {
    const { exact, patterns } = indexFor(lang);
    const keys = [...(exact.get(text.trim()) ?? [])];
    // Templates only when nothing renders the text exactly: "{count} фигур" would match any text ending in "фигур".
    if (keys.length === 0) {
      for (const { key, pattern } of patterns) {
        if (keys.length >= limit) break;
        if (!keys.includes(key) && pattern.test(text.trim())) keys.push(key);
      }
    }
    return keys.slice(0, limit).map((key) => ({ key, file: fileFor(lang, key), en: templates(catalogs.get("en")?.[key])[0] ?? null }));
  };
}
