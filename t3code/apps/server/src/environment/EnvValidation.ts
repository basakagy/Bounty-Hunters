/**
 * EnvValidation - Schema-based environment variable validation.
 *
 * Validates all required environment variables at server startup using
 * Effect Schema, printing a formatted table of missing or invalid
 * variables before exiting with code 1.
 *
 * @module EnvValidation
 */
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

// ─── Required Env Var Schema ────────────────────────────────────────────────

/**
 * RequiredServerEnv - Schema for all optional server environment variables.
 * All fields accept undefined and have no strict type coercion at the Schema level;
 * actual type validation happens in validateEnvVar per variable.
 */
export class RequiredServerEnv extends Schema.Class<RequiredServerEnv>("RequiredServerEnv")({
  T3CODE_LOG_LEVEL: Schema.optional(Schema.String),
  T3CODE_TRACE_MIN_LEVEL: Schema.optional(Schema.String),
  T3CODE_TRACE_TIMING_ENABLED: Schema.optional(Schema.String),
  T3CODE_TRACE_MAX_BYTES: Schema.optional(Schema.String),
  T3CODE_TRACE_MAX_FILES: Schema.optional(Schema.String),
  T3CODE_TRACE_BATCH_WINDOW_MS: Schema.optional(Schema.String),
  T3CODE_OTLP_EXPORT_INTERVAL_MS: Schema.optional(Schema.String),
  T3CODE_OTLP_SERVICE_NAME: Schema.optional(Schema.String),
  T3CODE_MODE: Schema.optional(Schema.String),
  T3CODE_PORT: Schema.optional(Schema.String),
  T3CODE_HOST: Schema.optional(Schema.String),
  T3CODE_HOME: Schema.optional(Schema.String),
  VITE_DEV_SERVER_URL: Schema.optional(Schema.String),
  T3CODE_NO_BROWSER: Schema.optional(Schema.String),
  T3CODE_BOOTSTRAP_FD: Schema.optional(Schema.String),
  T3CODE_AUTO_BOOTSTRAP_PROJECT_FROM_CWD: Schema.optional(Schema.String),
  T3CODE_LOG_WS_EVENTS: Schema.optional(Schema.String),
  T3CODE_TAILSCALE_SERVE: Schema.optional(Schema.String),
  T3CODE_TAILSCALE_SERVE_PORT: Schema.optional(Schema.String),
}) {}

// ─── Validation Result ──────────────────────────────────────────────────────

export interface EnvValidationError {
  readonly variable: string;
  readonly issue: string;
  readonly received: string | undefined;
}

export interface EnvValidationResult {
  readonly errors: ReadonlyArray<EnvValidationError>;
  readonly validCount: number;
}

// ─── Parser for type-specific validation ────────────────────────────────────

const ENV_SCHEMA_DESCRIPTIONS: Record<string, { type: string; required: boolean }> = {
  T3CODE_LOG_LEVEL: { type: "LogLevel (string)", required: false },
  T3CODE_TRACE_MIN_LEVEL: { type: "LogLevel (string)", required: false },
  T3CODE_TRACE_TIMING_ENABLED: { type: "boolean (true/false)", required: false },
  T3CODE_TRACE_MAX_BYTES: { type: "integer (bytes)", required: false },
  T3CODE_TRACE_MAX_FILES: { type: "integer", required: false },
  T3CODE_TRACE_BATCH_WINDOW_MS: { type: "integer (ms)", required: false },
  T3CODE_OTLP_EXPORT_INTERVAL_MS: { type: "integer (ms)", required: false },
  T3CODE_OTLP_SERVICE_NAME: { type: "string", required: false },
  T3CODE_MODE: { type: '"web" | "desktop"', required: false },
  T3CODE_PORT: { type: "integer (port number)", required: false },
  T3CODE_HOST: { type: "string (IP or hostname)", required: false },
  T3CODE_HOME: { type: "string (directory path)", required: false },
  VITE_DEV_SERVER_URL: { type: "string (URL)", required: false },
  T3CODE_NO_BROWSER: { type: 'boolean ("true"|"false")', required: false },
  T3CODE_BOOTSTRAP_FD: { type: "integer (file descriptor)", required: false },
  T3CODE_AUTO_BOOTSTRAP_PROJECT_FROM_CWD: { type: 'boolean ("true"|"false")', required: false },
  T3CODE_LOG_WS_EVENTS: { type: 'boolean ("true"|"false")', required: false },
  T3CODE_TAILSCALE_SERVE: { type: 'boolean ("true"|"false")', required: false },
  T3CODE_TAILSCALE_SERVE_PORT: { type: "integer (port)", required: false },
};

const isBooleanLike = (value: string): boolean =>
  ["true", "false", "1", "0", "yes", "no"].includes(value.toLowerCase());

const isValidLogLevel = (value: string): boolean =>
  ["all", "debug", "info", "warning", "error", "fatal", "none"].includes(value.toLowerCase());

const isIntegerString = (value: string): boolean => {
  const n = Number(value);
  return Number.isInteger(n) && String(n) === value.trim();
};

/**
 * Validate a single environment variable value against its expected type.
 */
const validateEnvVar = (
  variable: string,
  value: string | undefined,
): EnvValidationError | null => {
  if (value === undefined || value.trim() === "") {
    return {
      variable,
      issue: "Missing (no value set)",
      received: undefined,
    };
  }

  const desc = ENV_SCHEMA_DESCRIPTIONS[variable];
  if (!desc) return null;

  const typeHint = desc.type;

  // Type-specific validation
  if (typeHint.includes("boolean")) {
    if (!isBooleanLike(value)) {
      return {
        variable,
        issue: `Expected boolean (${typeHint})`,
        received: value,
      };
    }
  } else if (typeHint.includes("integer")) {
    if (!isIntegerString(value)) {
      return {
        variable,
        issue: `Expected integer (${typeHint})`,
        received: value,
      };
    }
  } else if (typeHint.includes("LogLevel")) {
    if (!isValidLogLevel(value)) {
      return {
        variable,
        issue: `Expected log level (${typeHint})`,
        received: value,
      };
    }
  }

  return null;
};

// ─── Main Validation ────────────────────────────────────────────────────────

/**
 * Read all relevant environment variables and validate them.
 */
export const validateServerEnv = Effect.fn(function* (): Effect.fn.Return<EnvValidationResult, never> {
  const errors: Array<EnvValidationError> = [];
  let validCount = 0;

  for (const variable of Object.keys(ENV_SCHEMA_DESCRIPTIONS)) {
    const value = process.env[variable];
    const error = validateEnvVar(variable, value);
    if (error) {
      errors.push(error);
    } else {
      validCount++;
    }
  }

  return { errors, validCount };
});

// ─── Formatted Output ───────────────────────────────────────────────────────

const padEnd = (s: string, len: number): string => {
  if (s.length >= len) return s;
  return s + " ".repeat(len - s.length);
};

const SEPARATOR = "─".repeat(78);

/**
 * Print a formatted table of validation results.
 */
export const printValidationTable = (
  result: EnvValidationResult,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const { errors } = result;

    if (errors.length === 0) {
      yield* Console.log("✓ All environment variables are valid.");
      return;
    }

    yield* Console.log("");
    yield* Console.log(`  Environment Variable Validation Errors (${errors.length}):`);
    yield* Console.log(`  ${SEPARATOR}`);

    // Header
    yield* Console.log(
      `  ${padEnd("Variable", 38)} ${padEnd("Expected", 18)} ${padEnd("Received", 20)}`,
    );
    yield* Console.log(`  ${SEPARATOR}`);

    for (const err of errors) {
      const desc = ENV_SCHEMA_DESCRIPTIONS[err.variable];
      const expected = desc?.type ?? "string";
      const received = err.received ?? "(not set)";
      yield* Console.log(
        `  ${padEnd(err.variable, 38)} ${padEnd(expected, 18)} ${received}`,
      );
    }

    yield* Console.log(`  ${SEPARATOR}`);
    yield* Console.log(`  ${errors.length} variable(s) have issues. Fix them before starting the server.`);
    yield* Console.log("");
  });

// ─── Entry Point ────────────────────────────────────────────────────────────

/**
 * Run validation and exit if there are errors.
 * Returns true if validation passed, false otherwise.
 */
export const runEnvValidation = Effect.fn(function* (): Effect.fn.Return<boolean, never> {
  const result = yield* validateServerEnv;
  yield* printValidationTable(result);
  return result.errors.length === 0;
});

/**
 * Run validation and exit the process with code 1 on failure.
 * Used at server startup.
 * Returns nothing (may exit the process).
 */
export const validateAndExitOnFailure = Effect.fn(function* (): Effect.fn.Return<void, never> {
  const passed = yield* runEnvValidation;
  if (!passed) {
    yield* Console.log("Server startup aborted due to environment variable errors.");
    yield* Effect.sync(() => process.exit(1));
  }
});
