import { Fragment, createElement, type ReactNode } from "react";
import { formatMessage, interpolateMessage, selectMessageTemplate, type MessageParams } from "./format";
import { LocalizedError } from "./LocalizedError";
import { SOURCE_MESSAGES, localeCatalog, type Locale, type MessageKey } from "./locales";

export type RichParams = Record<string, string | number | ReactNode | ((chunks: ReactNode) => ReactNode)>;

export type Translator = {
  (key: MessageKey, params?: MessageParams): string;
  /** Like the call form, but `{name}` may be a React node and `<tag>…</tag>` is rendered by `params.tag(chunks)`. Tags do not nest. */
  rich: (key: MessageKey, params: RichParams) => ReactNode;
  locale: Locale;
};

const RICH_TOKEN_PATTERN = /<(\w+)>([\s\S]*?)<\/\1>|\{(\w+)\}/g;
const translatorsByLocale = new Map<Locale, Translator>();

function stringParams(params: RichParams): MessageParams {
  const result: MessageParams = {};
  for (const [name, value] of Object.entries(params)) {
    if (typeof value === "string" || typeof value === "number") result[name] = value;
  }
  return result;
}

/** Renders a selected template: `{name}` may be a node, `<tag>…</tag>` goes through `params.tag(chunks)`. */
export function renderRichTemplate(template: string, params: RichParams): ReactNode {
  const nodes: ReactNode[] = [];
  const plainParams = stringParams(params);
  let cursor = 0;
  for (const match of template.matchAll(RICH_TOKEN_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push(interpolateMessage(template.slice(cursor, index), plainParams));
    const [whole, tag, chunks, placeholder] = match;
    if (tag !== undefined) {
      const render = params[tag];
      const content = interpolateMessage(chunks, plainParams);
      nodes.push(typeof render === "function" ? render(content) : content);
    } else {
      nodes.push(placeholder in params ? (params[placeholder] as ReactNode) : whole);
    }
    cursor = index + whole.length;
  }
  if (cursor < template.length) nodes.push(interpolateMessage(template.slice(cursor), plainParams));
  return nodes.map((node, index) => createElement(Fragment, { key: index }, node));
}

export function createTranslator(locale: Locale): Translator {
  const cached = translatorsByLocale.get(locale);
  if (cached) return cached;
  const catalog = localeCatalog(locale);
  const lookup = (key: MessageKey) => {
    const localized = catalog[key];
    return localized !== undefined ? { value: localized, locale } : { value: SOURCE_MESSAGES[key], locale: "en" };
  };
  const translate = ((key: MessageKey, params?: MessageParams) => {
    const { value, locale: valueLocale } = lookup(key);
    return value === undefined ? key : formatMessage(value, valueLocale, params);
  }) as Translator;
  translate.rich = (key, params) => {
    const { value, locale: valueLocale } = lookup(key);
    if (value === undefined) return key;
    return renderRichTemplate(selectMessageTemplate(value, valueLocale, stringParams(params)), params);
  };
  translate.locale = locale;
  translatorsByLocale.set(locale, translate);
  return translate;
}

/**
 * Text for an error shown to the user: LocalizedError is translated, other errors keep their own
 * message (third-party libraries), anything else uses the fallback.
 */
export function errorText(t: Translator, error: unknown, fallbackKey: MessageKey, fallbackParams?: MessageParams): string {
  if (error instanceof LocalizedError) return t(error.key, error.params);
  if (error instanceof Error && error.message) return error.message;
  return t(fallbackKey, fallbackParams);
}
