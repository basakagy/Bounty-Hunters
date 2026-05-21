import assert from "node:assert/strict";
import { describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  ApiKey,
  HttpsUrl,
  validateApiKey,
  validateHttpsUrl,
  validateAll,
  validateProviderConfig,
  ProviderConfigError,
} from "./providerConfig.ts";

// ─── ApiKey Schema Tests ─────────────────────────────────────────
describe("ApiKey", () => {
  it.effect("accepts valid API key", () =>
    Effect.gen(function* () {
      const result = yield* Schema.decodeUnknownEffect(ApiKey)("sk-abc123def456ghi789");
      assert.strictEqual(result, "sk-abc123def456ghi789");
    }),
  );

  it.effect("accepts API key exactly 10 chars", () =>
    Effect.gen(function* () {
      const result = yield* Schema.decodeUnknownEffect(ApiKey)("1234567890");
      assert.strictEqual(result, "1234567890");
    }),
  );

  it.effect("rejects empty string", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(Schema.decodeUnknownEffect(ApiKey)(""));
      assert.ok(exit._tag === "Failure");
    }),
  );

  it.effect("rejects short string (less than 10 chars)", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(Schema.decodeUnknownEffect(ApiKey)("short"));
      assert.ok(exit._tag === "Failure");
    }),
  );

  it.effect("accepts long API key (512 chars)", () =>
    Effect.gen(function* () {
      const long = "k".repeat(512);
      const result = yield* Schema.decodeUnknownEffect(ApiKey)(long);
      assert.strictEqual(result, long);
    }),
  );
});

// ─── HttpsUrl Schema Tests ───────────────────────────────────────
describe("HttpsUrl", () => {
  it.effect("accepts valid HTTPS URL", () =>
    Effect.gen(function* () {
      const result = yield* Schema.decodeUnknownEffect(HttpsUrl)("https://api.openai.com/v1");
      assert.strictEqual(result, "https://api.openai.com/v1");
    }),
  );

  it.effect("accepts HTTPS URL with port", () =>
    Effect.gen(function* () {
      const result = yield* Schema.decodeUnknownEffect(HttpsUrl)("https://localhost:8443/api");
      assert.strictEqual(result, "https://localhost:8443/api");
    }),
  );

  it.effect("rejects HTTP URL", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(Schema.decodeUnknownEffect(HttpsUrl)("http://api.example.com"));
      assert.ok(exit._tag === "Failure");
    }),
  );

  it.effect("rejects empty string", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(Schema.decodeUnknownEffect(HttpsUrl)(""));
      assert.ok(exit._tag === "Failure");
    }),
  );

  it.effect("rejects malformed URL", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(Schema.decodeUnknownEffect(HttpsUrl)("not-a-url"));
      assert.ok(exit._tag === "Failure");
    }),
  );

  it.effect("rejects FTP URL", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(Schema.decodeUnknownEffect(HttpsUrl)("ftp://files.example.com"));
      assert.ok(exit._tag === "Failure");
    }),
  );
});

// ─── ProviderConfigError Tests ───────────────────────────────────
describe("ProviderConfigError", () => {
  it("is a tagged error with expected shape", () => {
    const err = new ProviderConfigError({
      field: "apiKey",
      value: "short",
      expected: "API key (min 10 chars)",
    });
    assert.strictEqual(err._tag, "ProviderConfigError");
    assert.strictEqual(err.field, "apiKey");
    assert.strictEqual(err.value, "short");
    assert.strictEqual(err.expected, "API key (min 10 chars)");
  });
});

// ─── validateApiKey Tests ────────────────────────────────────────
describe("validateApiKey", () => {
  it.effect("succeeds for valid key", () =>
    Effect.gen(function* () {
      const result = yield* validateApiKey("apiKey", "abcdef1234567890");
      assert.strictEqual(result, undefined);
    }),
  );

  it.effect("fails for short key", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(validateApiKey("apiKey", "short"));
      assert.ok(exit._tag === "Failure");
    }),
  );
});

// ─── validateHttpsUrl Tests ──────────────────────────────────────
describe("validateHttpsUrl", () => {
  it.effect("succeeds for valid HTTPS URL", () =>
    Effect.gen(function* () {
      const result = yield* validateHttpsUrl("endpoint", "https://api.example.com");
      assert.strictEqual(result, undefined);
    }),
  );

  it.effect("fails for HTTP URL", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(validateHttpsUrl("endpoint", "http://api.example.com"));
      assert.ok(exit._tag === "Failure");
    }),
  );
});

// ─── validateAll Tests ───────────────────────────────────────────
describe("validateAll", () => {
  it.effect("returns valid=true when all pass", () =>
    Effect.gen(function* () {
      const result = yield* validateAll([
        validateApiKey("key1", "abcdef1234567890"),
        validateHttpsUrl("url1", "https://example.com"),
      ]);
      assert.ok(result.valid);
      assert.strictEqual(result.errors.length, 0);
    }),
  );

  it.effect("collects multiple errors", () =>
    Effect.gen(function* () {
      const result = yield* validateAll([
        validateApiKey("key1", "short"),
        validateHttpsUrl("url1", "http://bad.com"),
        validateApiKey("key2", "ok123456789012345"),
      ]);
      assert.ok(!result.valid);
      assert.strictEqual(result.errors.length, 2);
      assert.strictEqual(result.errors[0].field, "key1");
      assert.strictEqual(result.errors[1].field, "url1");
    }),
  );

  it.effect("returns empty errors for no validations", () =>
    Effect.gen(function* () {
      const result = yield* validateAll([]);
      assert.ok(result.valid);
      assert.strictEqual(result.errors.length, 0);
    }),
  );
});

// ─── validateProviderConfig Tests ────────────────────────────────
describe("validateProviderConfig", () => {
  it.effect("passes valid config", () =>
    Effect.gen(function* () {
      const result = yield* validateProviderConfig({
        apiKey: "sk-abcdef1234567890",
        endpoint: "https://api.openai.com/v1",
      });
      assert.ok(result.valid);
    }),
  );

  it.effect("detects empty API key", () =>
    Effect.gen(function* () {
      const result = yield* validateProviderConfig({
        apiKey: "",
        endpoint: "https://api.example.com",
      });
      assert.ok(!result.valid);
      assert.ok(result.errors.some((e) => e.field === "apiKey"));
    }),
  );

  it.effect("detects HTTP URL", () =>
    Effect.gen(function* () {
      const result = yield* validateProviderConfig({
        apiKey: "abcdef1234567890",
        endpoint: "http://api.example.com",
      });
      assert.ok(!result.valid);
      assert.ok(result.errors.some((e) => e.field === "endpoint"));
    }),
  );

  it.effect("detects malformed URL", () =>
    Effect.gen(function* () {
      const result = yield* validateProviderConfig({
        apiKey: "abcdef1234567890",
        host: "not-a-url",
      });
      assert.ok(!result.valid);
      assert.ok(result.errors.some((e) => e.field === "host"));
    }),
  );

  it.effect("returns multiple errors at once", () =>
    Effect.gen(function* () {
      const result = yield* validateProviderConfig({
        apiKey: "",
        endpoint: "",
        host: "http://bad.com",
      });
      assert.ok(!result.valid);
      assert.ok(result.errors.length >= 2);
    }),
  );

  it.effect("passes config with no API/URL fields", () =>
    Effect.gen(function* () {
      const result = yield* validateProviderConfig({
        model: "gpt-4",
        temperature: "0.7",
      });
      assert.ok(result.valid);
    }),
  );

  it.effect("handles token field as API key", () =>
    Effect.gen(function* () {
      const result = yield* validateProviderConfig({
        accessToken: "abc",
        url: "https://example.com",
      });
      assert.ok(!result.valid);
      assert.ok(result.errors.some((e) => e.field === "accessToken"));
    }),
  );
});
