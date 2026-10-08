import enMessages from "./locales/en/messages.json";
import { formatMessage, type MessageParams, type MessageValue } from "./format";

export type ErrorKey = Extract<keyof typeof enMessages, `errors.${string}`>;

const ENGLISH_MESSAGES: Record<ErrorKey, MessageValue> = enMessages;

const isErrorKey = (key: string): key is ErrorKey => key.startsWith("errors.") && key in ENGLISH_MESSAGES;

/**
 * An error whose text comes from the `errors.*` messages. `message` stays English (logs, tests,
 * MCP results); the UI translates `key` + `params` through `errorText`.
 * Imports only the English catalog, no translator or React, so it is safe to use inside workers.
 */
export class LocalizedError extends Error {
  readonly key: ErrorKey;
  readonly params?: MessageParams;

  constructor(key: ErrorKey, params?: MessageParams) {
    super(formatMessage(ENGLISH_MESSAGES[key], "en", params));
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
  if (payload.errorKey && isErrorKey(payload.errorKey)) return new LocalizedError(payload.errorKey, payload.errorParams);
  return new Error(payload.message);
}

/** Error fields of an API response: `error` stays English (other clients, logs), the UI translates `errorKey`. */
export type ErrorResponseFields = { error: string; errorKey?: ErrorKey; errorParams?: MessageParams };

export function errorResponseFields(error: unknown): ErrorResponseFields {
  const { message, errorKey, errorParams } = localizedErrorPayload(error);
  return { error: message, errorKey, errorParams };
}

/** The error an API response body reports, or null when it reports none. */
export function errorFromResponse(body: Partial<ErrorResponseFields> | null | undefined): Error | null {
  if (!body?.error) return null;
  return errorFromPayload({ message: body.error, errorKey: body.errorKey, errorParams: body.errorParams });
}
