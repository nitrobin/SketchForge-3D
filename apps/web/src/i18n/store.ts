import { useCallback, useSyncExternalStore } from "react";
import type { MessageParams } from "./format";
import { DEFAULT_LOCALE, LOCALES, isLocale, type Locale, type MessageKey } from "./locales";
import { createTranslator, type Translator } from "./translator";

export const LANGUAGE_STORAGE_KEY = "sketchForge.language";

export type LanguagePreference = "system" | Locale;

export const LANGUAGE_PREFERENCE_OPTIONS: readonly LanguagePreference[] = ["system", ...LOCALES.map((locale) => locale.code)];

/** Languages are listed by their own name so a user can find theirs whatever the current language. */
export function languagePreferenceLabel(t: Translator, preference: LanguagePreference): string {
  if (preference === "system") return t("common.language.system");
  return LOCALES.find((locale) => locale.code === preference)?.nativeName ?? preference;
}

export function normalizeLanguagePreference(value: unknown): LanguagePreference {
  return value === "system" || isLocale(value) ? value : "system";
}

/** First system language whose base subtag (`ru` in `ru-RU`) has a catalog, else English. */
export function resolveLocale(preference: LanguagePreference, systemLanguages: readonly string[]): Locale {
  if (preference !== "system") return preference;
  for (const language of systemLanguages) {
    const base = language.toLowerCase().split(/[-_]/)[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

export function readStoredLanguagePreference(storage: Pick<Storage, "getItem"> | null | undefined): LanguagePreference {
  if (!storage) return "system";
  try {
    return normalizeLanguagePreference(storage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function storeLanguagePreference(storage: Pick<Storage, "setItem"> | null | undefined, preference: LanguagePreference) {
  if (!storage) return;
  try {
    storage.setItem(LANGUAGE_STORAGE_KEY, preference);
  } catch {
    // The selected language still applies for this session when storage is unavailable.
  }
}

type LanguageState = { preference: LanguagePreference; locale: Locale };

const SERVER_STATE: LanguageState = { preference: "system", locale: DEFAULT_LOCALE };
let state: LanguageState = SERVER_STATE;
let systemLanguageListenerAttached = false;
const listeners = new Set<() => void>();

function systemLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

function applyLanguage(preference: LanguagePreference) {
  const locale = resolveLocale(preference, systemLanguages());
  if (state.preference === preference && state.locale === locale) return;
  const localeChanged = state.locale !== locale;
  state = { preference, locale };
  if (localeChanged) {
    if (typeof document !== "undefined") document.documentElement.lang = locale;
    if (typeof window !== "undefined") window.sketchforgeDesktop?.setLanguage(locale);
  }
  listeners.forEach((listener) => listener());
}

/** Reads the stored preference. Call once on the client before the first translated render. */
export function initLanguage() {
  if (typeof window === "undefined") return;
  if (!systemLanguageListenerAttached) {
    systemLanguageListenerAttached = true;
    window.addEventListener("languagechange", () => {
      if (state.preference === "system") applyLanguage("system");
    });
  }
  applyLanguage(readStoredLanguagePreference(window.localStorage));
  // Main process starts with the OS language; tell it the resolved one even when it did not change.
  window.sketchforgeDesktop?.setLanguage(state.locale);
}

export function setLanguagePreference(preference: LanguagePreference) {
  if (typeof window !== "undefined") storeLanguagePreference(window.localStorage, preference);
  applyLanguage(preference);
}

export function getLocale(): Locale {
  return state.locale;
}

/**
 * Locale for Intl date/number formatting: the system's regional variant when it is the UI language
 * (`en-GB` keeps "4 Oct" in English), otherwise the UI language itself.
 */
export function formattingLocale(locale: Locale): string {
  return systemLanguages().find((language) => language.toLowerCase().split(/[-_]/)[0] === locale) ?? locale;
}

/**
 * Translator for the locale at call time. For long-lived listeners, timers and effects whose deps must not
 * include `t` because re-running them on a language switch has side effects (worker restart, refetch, autosave).
 */
export function currentTranslator(): Translator {
  return createTranslator(state.locale);
}

/** For code outside React (event handlers in plain modules). Not reactive: read at call time. */
export function translate(key: MessageKey, params?: MessageParams): string {
  return createTranslator(state.locale)(key, params);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getState = () => state;
const getServerState = () => SERVER_STATE;

/** Translator for the current locale. Its identity changes with the locale, so list it in hook deps. */
export function useT(): Translator {
  const { locale } = useSyncExternalStore(subscribe, getState, getServerState);
  return createTranslator(locale);
}

export function useLanguagePreference(): [LanguagePreference, (preference: LanguagePreference) => void] {
  const { preference } = useSyncExternalStore(subscribe, getState, getServerState);
  return [preference, useCallback((next: LanguagePreference) => setLanguagePreference(next), [])];
}
