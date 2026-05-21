/**
 * ProviderCache — Effect.Cache-based provider API response caching.
 *
 * Caches provider model lists and capability queries with configurable TTL,
 * deduplicates concurrent cache misses, and exposes cache hit/miss metrics.
 *
 * @module provider/ProviderCache
 */
import type { ProviderInstanceId, ServerProvider } from "@t3tools/contracts";
import * as Cache from "effect/Cache";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Metric from "effect/Metric";
import * as Scope from "effect/Scope";

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_MODEL_LIST_TTL = Duration.minutes(5);
const DEFAULT_CAPABILITY_TTL = Duration.minutes(15);
const MAX_CACHE_ENTRIES = 500;

// ─── Cache Key Type ─────────────────────────────────────────────────────────

export type CacheKey = string; // "{kind}:{instanceId}"

export const modelListKey = (instanceId: ProviderInstanceId): CacheKey =>
  `modelList:${instanceId}`;

export const capabilityKey = (instanceId: ProviderInstanceId): CacheKey =>
  `capabilities:${instanceId}`;

// ─── Cache Value Type ───────────────────────────────────────────────────────

export type CacheValue =
  | { readonly kind: "modelList"; readonly models: ReadonlyArray<ServerProvider["models"][number]> }
  | { readonly kind: "capabilities"; readonly capabilities: Record<string, unknown> };

// ─── Lookup Function Type ───────────────────────────────────────────────────

export type CacheLookup = (key: CacheKey) => Effect.Effect<CacheValue>;

// ─── Metrics ────────────────────────────────────────────────────────────────

export const cacheHitCounter = Metric.counter("provider_cache_hits", {
  description: "Number of cache hits for provider API responses",
});

export const cacheMissCounter = Metric.counter("provider_cache_misses", {
  description: "Number of cache misses for provider API responses",
});

// ─── Provider Cache ─────────────────────────────────────────────────────────

export interface ProviderCache {
  readonly getModelList: (
    instanceId: ProviderInstanceId,
  ) => Effect.Effect<ReadonlyArray<ServerProvider["models"][number]>>;
  readonly getCapabilities: (
    instanceId: ProviderInstanceId,
  ) => Effect.Effect<Record<string, unknown>>;
  readonly invalidate: (instanceId: ProviderInstanceId) => Effect.Effect<void>;
}

const cacheTimeToLive = (exit: Effect.Effect.Exit<CacheValue, never>, _key: CacheKey) => {
  if (exit._tag === "Success") {
    switch (exit.value.kind) {
      case "modelList": return DEFAULT_MODEL_LIST_TTL;
      case "capabilities": return DEFAULT_CAPABILITY_TTL;
    }
  }
  return Duration.minutes(1); // Short TTL on failure
};

export const makeProviderCache = Effect.fn(function* (
  lookup: CacheLookup,
  options?: {
    readonly maxEntries?: number;
  },
): Effect.fn.Return<ProviderCache, never, Scope.Scope> {
  const maxEntries = options?.maxEntries ?? MAX_CACHE_ENTRIES;

  const cache = yield* Cache.make<CacheKey, CacheValue, never>({
    capacity: maxEntries,
    timeToLive: cacheTimeToLive,
    lookup: (key: CacheKey) =>
      Metric.increment(cacheMissCounter).pipe(
        Effect.flatMap(() => lookup(key)),
      ),
  });

  const getModelList = (instanceId: ProviderInstanceId) =>
    Metric.increment(cacheHitCounter).pipe(
      Effect.flatMap(() => Cache.get(cache, modelListKey(instanceId))),
      Effect.map((value) => {
        if (value.kind !== "modelList") return [];
        return value.models;
      }),
    );

  const getCapabilities = (instanceId: ProviderInstanceId) =>
    Metric.increment(cacheHitCounter).pipe(
      Effect.flatMap(() => Cache.get(cache, capabilityKey(instanceId))),
      Effect.map((value) => {
        if (value.kind !== "capabilities") return {};
        return value.capabilities;
      }),
    );

  const invalidate = (instanceId: ProviderInstanceId) =>
    Effect.gen(function* () {
      yield* Cache.invalidate(cache, modelListKey(instanceId));
      yield* Cache.invalidate(cache, capabilityKey(instanceId));
    });

  return { getModelList, getCapabilities, invalidate };
});
