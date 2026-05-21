import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Metric from "effect/Metric";

import { activeSessions, memoryUsageBytes } from "./observability/Metrics.ts";

describe("Prometheus metrics definitions", () => {
  it.effect("activeSessions is a gauge metric", () =>
    Effect.gen(function* () {
      // Update the gauge
      yield* Metric.update(activeSessions, 3);

      const snapshots = yield* Metric.snapshot;
      const snapshot = snapshots.find((s) => s.id === "active_sessions");
      assert.isDefined(snapshot, "active_sessions metric should exist");
      assert.strictEqual(snapshot!.type, "Gauge", "active_sessions should be a Gauge");
    }),
  );

  it.effect("memoryUsageBytes is a gauge metric", () =>
    Effect.gen(function* () {
      yield* Metric.update(memoryUsageBytes, 42_000_000);

      const snapshots = yield* Metric.snapshot;
      const snapshot = snapshots.find((s) => s.id === "memory_usage_bytes");
      assert.isDefined(snapshot, "memory_usage_bytes metric should exist");
      assert.strictEqual(snapshot!.type, "Gauge", "memory_usage_bytes should be a Gauge");
    }),
  );
});
