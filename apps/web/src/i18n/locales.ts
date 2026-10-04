import en from "./locales/en";
import ru from "./locales/ru";
import type { MessageValue } from "./format";

/** English is the source catalog: every key must exist here, other locales fall back to it. */
export type MessageKey = keyof typeof en & string;
export type MessageCatalog = Partial<Record<MessageKey, MessageValue>>;

/** To add a language: copy locales/en to locales/<code>, translate the JSON files and register it here. */
export const LOCALES = [
  { code: "en", nativeName: "English", messages: en },
  { code: "ru", nativeName: "Русский", messages: ru },
] as const satisfies readonly { code: string; nativeName: string; messages: MessageCatalog }[];

export type Locale = (typeof LOCALES)[number]["code"];

export const DEFAULT_LOCALE: Locale = "en";
export const SOURCE_MESSAGES: Record<MessageKey, MessageValue> = en;

const catalogsByLocale = new Map<string, MessageCatalog>(LOCALES.map((locale) => [locale.code, locale.messages]));

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && catalogsByLocale.has(value);
}

export function localeCatalog(locale: Locale): MessageCatalog {
  return catalogsByLocale.get(locale) ?? SOURCE_MESSAGES;
}
