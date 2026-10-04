import enErrors from "./locales/en/errors.json";
import { formatMessage, type MessageParams, type MessageValue } from "./format";

export type ErrorKey = keyof typeof enErrors & string;

const ERROR_MESSAGES: Record<ErrorKey, MessageValue> = enErrors;

/**
 * An error whose text comes from the `errors` catalog. `message` stays English (logs, tests,
 * MCP results); the UI translates `key` + `params` through `errorText`.
 * Imports only the English errors catalog so it is safe to use inside workers.
 */
export class LocalizedError extends Error {
  readonly key: ErrorKey;
  readonly params?: MessageParams;

  constructor(key: ErrorKey, params?: MessageParams) {
    super(formatMessage(ERROR_MESSAGES[key], "en", params));
    this.name = "LocalizedError";
    this.key = key;
    this.params = params;
  }
}

/** Plain-object form for postMessage: structured clone drops Error subclasses and their fields. */
export type LocalizedErrorPayload = { message: string; errorKey?: ErrorKey; errorParams?: MessageParams };

export function localizedErrorPayload(error: unknown): LocalizedErrorPayload {
  if (error instanceof LocalizedError) return { message: error.message, errorKey: error.key, errorParams: error.params };
  return { message: error instanceof Error ? error.message : String(error) };
}

export function errorFromPayload(payload: LocalizedErrorPayload): Error {
  if (payload.errorKey && payload.errorKey in ERROR_MESSAGES) return new LocalizedError(payload.errorKey, payload.errorParams);
  return new Error(payload.message);
}
