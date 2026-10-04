// Pure message formatting shared by the UI, workers and LocalizedError.
// Kept free of React so worker bundles stay small.

export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
export type MessageValue = string | PluralForms;
export type MessageParams = Record<string, string | number>;

const PLACEHOLDER_PATTERN = /\{(\w+)\}/g;
const pluralRulesByLocale = new Map<string, Intl.PluralRules>();

function pluralRules(locale: string) {
  let rules = pluralRulesByLocale.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRulesByLocale.set(locale, rules);
  }
  return rules;
}

/** Picks the plural form for `params.count`; plain strings pass through. */
export function selectMessageTemplate(value: MessageValue, locale: string, params?: MessageParams): string {
  if (typeof value === "string") return value;
  const count = params?.count;
  if (typeof count !== "number") return value.other;
  return value[pluralRules(locale).select(count)] ?? value.other;
}

/** Replaces `{name}` placeholders. Unknown placeholders are left visible so they are easy to spot. */
export function interpolateMessage(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(PLACEHOLDER_PATTERN, (match, name: string) => (name in params ? String(params[name]) : match));
}

export function formatMessage(value: MessageValue, locale: string, params?: MessageParams): string {
  return interpolateMessage(selectMessageTemplate(value, locale, params), params);
}

export function messagePlaceholders(value: MessageValue): string[] {
  const templates = typeof value === "string" ? [value] : Object.values(value).filter((form): form is string => typeof form === "string");
  const names = new Set<string>();
  for (const template of templates) {
    for (const match of template.matchAll(PLACEHOLDER_PATTERN)) names.add(match[1]);
  }
  return [...names].sort();
}
