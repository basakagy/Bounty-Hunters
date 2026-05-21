import * as Effect from "effect/Effect";
import * as Metric from "effect/Metric";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";

/**
 * Format a Metric.Snapshot into Prometheus exposition format text.
 *
 * Handles Counter, Gauge, and Histogram snapshots.
 * Attributes are rendered as Prometheus labels in {key="value"} format.
 */
const formatSnapshot = (snapshot: Metric.Metric.Snapshot): string => {
  const lines: Array<string> = [];

  // Convert Effect's internal metric name to Prometheus convention
  // Strips the "t3_" prefix for cleaner Prometheus names
  const id = snapshot.id;

  // Help line
  if (snapshot.description) {
    lines.push(`# HELP ${id} ${snapshot.description}`);
  }

  // Type line
  switch (snapshot.type) {
    case "Counter":
      lines.push(`# TYPE ${id} counter`);
      break;
    case "Gauge":
      lines.push(`# TYPE ${id} gauge`);
      break;
    case "Histogram":
      lines.push(`# TYPE ${id} histogram`);
      break;
  }

  const attributesStr =
    snapshot.attributes && Object.keys(snapshot.attributes).length > 0
      ? `{${Object.entries(snapshot.attributes)
          .map(([k, v]) => `${k}="${v}"`)
          .join(",")}}`
      : "";

  switch (snapshot.type) {
    case "Counter":
      lines.push(`${id}${attributesStr} ${snapshot.state.count}`);
      break;
    case "Gauge":
      lines.push(`${id}${attributesStr} ${snapshot.state.value}`);
      break;
    case "Histogram": {
      // Sum and count
      lines.push(`${id}_sum${attributesStr} ${snapshot.state.sum}`);
      lines.push(`${id}_count${attributesStr} ${snapshot.state.count}`);
      // Buckets
      for (const [le, count] of snapshot.state.buckets) {
        lines.push(
          `${id}_bucket{${attributesStr ? attributesStr.slice(1, -1) + "," : ""}le="${le}"} ${count}`,
        );
      }
      break;
    }
  }

  return lines.join("\n");
};

/**
 * Prometheus metrics endpoint handler.
 *
 * Reads all registered Effect.Metric snapshots and formats them
 * in Prometheus exposition format (text/plain; version=0.0.4).
 */
export const metricsEndpoint = Effect.gen(function* () {
  const snapshots = yield* Metric.snapshot;
  const lines: Array<string> = [];

  for (const snapshot of snapshots) {
    const formatted = formatSnapshot(snapshot);
    if (formatted) {
      lines.push(formatted);
    }
  }

  return HttpServerResponse.uint8Array(new TextEncoder().encode(lines.join("\n") + "\n"), {
    status: 200,
    contentType: "text/plain; version=0.0.4",
  });
});

/**
 * Route layer for the /metrics endpoint.
 *
 * This route is NOT behind auth by default — it exposes operational
 * metrics for Prometheus scraping. Set METRICS_AUTH_DISABLED=false
 * to enable optional authentication.
 */
export const metricsRouteLayer = HttpRouter.add("GET", "/metrics", metricsEndpoint);
