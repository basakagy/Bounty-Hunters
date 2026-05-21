import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
  makeProviderCache,
  type CacheKey,
  type CacheValue,
} from "./ProviderCache.ts";

// ─── Helpers ────────────────────────────────────────────────────────────────

const testLookup = (): {
  readonly lookup: (key: CacheKey) => Effect.Effect<CacheValue>;
  readonly callCount: Effect.Effect<number>;
} => {
  let count = 0;
  return {
    lookup: (key: CacheKey) =>
      Effect.sync(() => {
        count++;
        if (key.startsWith("modelList")) {
          return { kind: "modelList" as const, models: [] };
        }
        return { kind: "capabilities" as const, capabilities: {} };
      }),
    callCount: Effect.sync(() => count),
  };
};

const withCache = <A>(
  f: (cache: {
    readonly getModelList: (id: string) => Effect.Effect<readonly unknown[]>;
    readonly getCapabilities: (id: string) => Effect.Effect<Record<string, unknown>>;
    readonly invalidate: (id: string) => Effect.Effect<void>;
    readonly callCount: Effect.Effect<number>;
  }) => Effect.Effect<A>,
) =>
  Effect.gen(function* () {
    const { lookup, callCount } = testLookup();
    const cache = yield* makeProviderCache(lookup);
    return yield* f({
      getModelList: (id: string) => cache.getModelList(id as any),
      getCapabilities: (id: string) => cache.getCapabilities(id as any),
      invalidate: (id: string) => cache.invalidate(id as any),
      callCount,
    });
  }).pipe(Effect.scoped);

// ─── Tests ──────────────────────────────────────────────────────────────────

it("should serve model list from cache on repeated calls", () =>
  Effect.gen(function* () {
    const result = yield* withCache(({ getModelList, callCount }) =>
      Effect.gen(function* () {
        yield* getModelList("provider-a");
        yield* getModelList("provider-a");
        return yield* callCount;
      }),
    );
    expect(result).toBe(1);
  }));

it("should call lookup on cache miss", () =>
  Effect.gen(function* () {
    const result = yield* withCache(({ getModelList, callCount }) =>
      Effect.gen(function* () {
        yield* getModelList("provider-a");
        yield* getModelList("provider-b");
        return yield* callCount;
      }),
    );
    expect(result).toBe(2);
  }));

it("should invalidate cache entries", () =>
  Effect.gen(function* () {
    const result = yield* withCache(({ getModelList, invalidate, callCount }) =>
      Effect.gen(function* () {
        yield* getModelList("provider-a");
        yield* invalidate("provider-a");
        yield* getModelList("provider-a");
        return yield* callCount;
      }),
    );
    expect(result).toBe(2);
  }));

it("should serve capabilities from cache", () =>
  Effect.gen(function* () {
    const result = yield* withCache(({ getCapabilities, callCount }) =>
      Effect.gen(function* () {
        yield* getCapabilities("provider-a");
        yield* getCapabilities("provider-a");
        return yield* callCount;
      }),
    );
    expect(result).toBe(1);
  }));

it("should invalidate all entries for a provider", () =>
  Effect.gen(function* () {
    const result = yield* withCache(
      ({ getModelList, getCapabilities, invalidate, callCount }) =>
        Effect.gen(function* () {
          yield* getModelList("provider-a");
          yield* getCapabilities("provider-a");
          yield* invalidate("provider-a");
          yield* getModelList("provider-a");
          yield* getCapabilities("provider-a");
          return yield* callCount;
        }),
    );
    expect(result).toBe(4);
  }));
