import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";

// ─── Refined schemas ─────────────────────────────────────────────

/**
 * An API key that must be at least 10 characters and non-empty.
 */
export const ApiKey = Schema.String
  .check(Schema.isNonEmpty())
  .check(Schema.isMaxLength(512))
  .check(Schema.isMinLength(10));
export type ApiKey = typeof ApiKey.Type;

/**
 * An HTTPS URL with a valid hostname.
 * Rejects empty strings, non-URL strings, and non-HTTPS protocols.
 */
export const HttpsUrl = Schema.String
  .check(Schema.isNonEmpty())
  .check(Schema.isPattern(/^https:\/\/[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*(:[0-9]+)?(\/.*)?$/));
export type HttpsUrl = typeof HttpsUrl.Type;

// ─── Error types ─────────────────────────────────────────────────

/**
 * Tagged error for provider configuration validation failures.
 */
export class ProviderConfigError extends Schema.TaggedErrorClass<ProviderConfigError>()("ProviderConfigError", {
  field: Schema.String,
  value: Schema.Unknown,
  expected: Schema.String,
}) {}

// ─── Validation helpers ──────────────────────────────────────────

export interface ValidationError {
  readonly field: string;
  readonly value: unknown;
  readonly expected: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: ReadonlyArray<ValidationError>;
}

/**
 * Validate that a value conforms to the `ApiKey` schema.
 */
export const validateApiKey = (
  field: string,
  value: string,
): Effect.Effect<void, ProviderConfigError> =>
  Effect.matchEffect(
    Schema.decodeUnknownEffect(ApiKey)(value),
    {
      onSuccess: () => Effect.succeed(undefined as void),
      onFailure: () =>
        Effect.fail(
          new ProviderConfigError({
            field: field,
            value: value,
            expected: "API key (non-empty, min 10 characters, max 512)",
          }),
        ),
    },
  );

/**
 * Validate that a value conforms to the `HttpsUrl` schema.
 */
export const validateHttpsUrl = (
  field: string,
  value: string,
): Effect.Effect<void, ProviderConfigError> =>
  Effect.matchEffect(
    Schema.decodeUnknownEffect(HttpsUrl)(value),
    {
      onSuccess: () => Effect.succeed(undefined as void),
      onFailure: () =>
        Effect.fail(
          new ProviderConfigError({
            field: field,
            value: value,
            expected: "Valid HTTPS URL (https://...)",
          }),
        ),
    },
  );

/**
 * Run multiple validations and collect all errors.
 * Returns a `ValidationResult` with all errors, not just the first one.
 */
export const validateAll = (
  validations: ReadonlyArray<Effect.Effect<void, ProviderConfigError>>,
): Effect.Effect<ValidationResult> =>
  Effect.forEach(validations, (v) =>
    Effect.matchEffect(v, {
      onSuccess: () => Effect.succeed(null as null),
      onFailure: (err) => Effect.succeed(err),
    }),
  ).pipe(
    Effect.map((results) => {
      const errors = results.filter(
        (r): r is ProviderConfigError => r !== null,
      );
      return {
        valid: errors.length === 0,
        errors: errors.map((e) => ({
          field: e.field,
          value: e.value,
          expected: e.expected,
        })),
      };
    }),
  );

/**
 * Validate a provider configuration with API keys and endpoint URLs.
 *
 * @param config - Object with field names as keys and values to validate.
 *   Fields starting with "api" or "key" or "token" are validated as API keys.
 *   Fields starting with "url" or "endpoint" or "host" are validated as HTTPS URLs.
 * @returns A `ValidationResult` with all errors collected.
 */
export const validateProviderConfig = (
  config: Record<string, string>,
): Effect.Effect<ValidationResult> => {
  const validations: Array<Effect.Effect<void, ProviderConfigError>> = [];

  for (const [field, value] of Object.entries(config)) {
    const lowerField = field.toLowerCase();
    if (
      lowerField.includes("api") ||
      lowerField.includes("key") ||
      lowerField.includes("token") ||
      lowerField.includes("secret")
    ) {
      validations.push(validateApiKey(field, value));
    }
    if (
      lowerField.includes("url") ||
      lowerField.includes("endpoint") ||
      lowerField.includes("host")
    ) {
      validations.push(validateHttpsUrl(field, value));
    }
  }

  return validateAll(validations);
};
