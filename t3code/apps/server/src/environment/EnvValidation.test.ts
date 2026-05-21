import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";

import {
  validateServerEnv,
  runEnvValidation,
  type EnvValidationResult,
  type EnvValidationError,
} from "./EnvValidation.ts";

// ─── Helpers ────────────────────────────────────────────────────────────────

const withEnv = <A>(vars: Record<string, string | undefined>, effect: Effect.Effect<A>) =>
  Effect.sync(() => {
    const backup: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(vars)) {
      backup[key] = process.env[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    return backup;
  }).pipe(
    Effect.flatMap((backup) =>
      effect.pipe(
        Effect.onExit(() =>
          Effect.sync(() => {
            for (const [key, value] of Object.entries(backup)) {
              if (value === undefined) {
                delete process.env[key];
              } else {
                process.env[key] = value;
              }
            }
          })
        ),
      )
    ),
  );

// ─── Tests ──────────────────────────────────────────────────────────────────

it("should pass with valid environment variables", () =>
  Effect.gen(function* () {
    const result = yield* withEnv(
      {
        T3CODE_LOG_LEVEL: "debug",
        T3CODE_TRACE_TIMING_ENABLED: "true",
        T3CODE_MODE: "web",
        T3CODE_PORT: "3773",
      },
      validateServerEnv,
    );
    expect(result.errors).toHaveLength(0);
    expect(result.validCount).toBeGreaterThan(0);
  }));

it("should detect missing optional variables as valid", () =>
  Effect.gen(function* () {
    // Clear all T3CODE_ vars — they all have defaults
    const result = yield* withEnv(
      {},
      validateServerEnv,
    );
    expect(result.errors).toHaveLength(0);
  }));

it("should detect invalid boolean value", () =>
  Effect.gen(function* () {
    const result = yield* withEnv(
      { T3CODE_TRACE_TIMING_ENABLED: "not-a-boolean" },
      validateServerEnv,
    );
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    const badBoolean = result.errors.find(
      (e) => e.variable === "T3CODE_TRACE_TIMING_ENABLED",
    );
    expect(badBoolean).toBeDefined();
    expect(badBoolean!.issue).toContain("boolean");
  }));

it("should detect invalid log level", () =>
  Effect.gen(function* () {
    const result = yield* withEnv(
      { T3CODE_LOG_LEVEL: "super-verbose" },
      validateServerEnv,
    );
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    const badLevel = result.errors.find((e) => e.variable === "T3CODE_LOG_LEVEL");
    expect(badLevel).toBeDefined();
    expect(badLevel!.issue).toContain("LogLevel");
  }));

it("should detect invalid port (non-integer)", () =>
  Effect.gen(function* () {
    const result = yield* withEnv(
      { T3CODE_PORT: "not-a-port" },
      validateServerEnv,
    );
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    const badPort = result.errors.find((e) => e.variable === "T3CODE_PORT");
    expect(badPort).toBeDefined();
    expect(badPort!.issue).toContain("integer");
  }));

it("should handle all valid values correctly", () =>
  Effect.gen(function* () {
    const result = yield* withEnv(
      {
        T3CODE_LOG_LEVEL: "debug",
        T3CODE_TRACE_MIN_LEVEL: "info",
        T3CODE_TRACE_TIMING_ENABLED: "true",
        T3CODE_TRACE_MAX_BYTES: "20971520",
        T3CODE_TRACE_MAX_FILES: "5",
        T3CODE_TRACE_BATCH_WINDOW_MS: "500",
        T3CODE_OTLP_EXPORT_INTERVAL_MS: "15000",
        T3CODE_OTLP_SERVICE_NAME: "my-server",
        T3CODE_MODE: "desktop",
        T3CODE_PORT: "8080",
        T3CODE_HOST: "0.0.0.0",
        T3CODE_HOME: "/home/user/.t3",
        T3CODE_NO_BROWSER: "true",
        T3CODE_BOOTSTRAP_FD: "3",
        T3CODE_AUTO_BOOTSTRAP_PROJECT_FROM_CWD: "false",
        T3CODE_LOG_WS_EVENTS: "true",
        T3CODE_TAILSCALE_SERVE: "false",
        T3CODE_TAILSCALE_SERVE_PORT: "443",
      },
      validateServerEnv,
    );
    expect(result.errors).toHaveLength(0);
    expect(result.validCount).toBeGreaterThan(0);
  }));

it("runEnvValidation should return true with valid env", () =>
  Effect.gen(function* () {
    const passed = yield* withEnv(
      { T3CODE_LOG_LEVEL: "warning" },
      runEnvValidation,
    );
    expect(passed).toBe(true);
  }));

it("runEnvValidation should return false with invalid env", () =>
  Effect.gen(function* () {
    const passed = yield* withEnv(
      { T3CODE_PORT: "abc" },
      runEnvValidation,
    );
    expect(passed).toBe(false);
  }));
