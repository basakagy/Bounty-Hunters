import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";

// Simple schemas only — literals, branded strings, and simple structs

// ─── baseSchemas ─────────────────────────────────────────────────────────────
import {
  TrimmedString, TrimmedNonEmptyString, NonNegativeInt, PositiveInt, PortSchema,
  IsoDateTime, ThreadId, ProjectId, EnvironmentId, CommandId, EventId,
  MessageId, TurnId, AuthSessionId, ProviderItemId, RuntimeSessionId,
  RuntimeItemId, RuntimeRequestId, RuntimeTaskId, ApprovalRequestId, CheckpointRef,
} from "./baseSchemas.ts";

// ─── auth (literals only) ────────────────────────────────────────────────────
import {
  ServerAuthPolicy, ServerAuthBootstrapMethod, AuthSessionRole,
  AuthClientMetadataDeviceType, ServerAuthSessionMethod,
} from "./auth.ts";

// ─── environment ─────────────────────────────────────────────────────────────
import {
  ExecutionEnvironmentPlatformOs, ExecutionEnvironmentPlatformArch,
  EnvironmentConnectionState,
} from "./environment.ts";

// ─── desktopBootstrap ────────────────────────────────────────────────────────
import { DesktopBackendBootstrap } from "./desktopBootstrap.ts";

// ─── remoteAccess ────────────────────────────────────────────────────────────
import {
  AdvertisedEndpointProviderKind, AdvertisedEndpointReachability,
  AdvertisedEndpointHostedHttpsCompatibility,
} from "./remoteAccess.ts";

// ─── model ───────────────────────────────────────────────────────────────────
import {
  ProviderOptionDescriptorType, ProviderOptionChoice,
} from "./model.ts";

// ─── vcs ─────────────────────────────────────────────────────────────────────
import {
  VcsDriverKind, VcsFreshnessSource,
} from "./vcs.ts";

// ─── sourceControl ───────────────────────────────────────────────────────────
import {
  SourceControlProviderKind, ChangeRequestState,
  SourceControlCloneProtocol,
} from "./sourceControl.ts";

// ─── editor ──────────────────────────────────────────────────────────────────
import { EditorLaunchStyle } from "./editor.ts";

// ─── ipc (desktop schemas) ───────────────────────────────────────────────────
import {
  DesktopUpdateStatusSchema, DesktopRuntimeArchSchema, DesktopThemeSchema,
  DesktopUpdateChannelSchema, DesktopServerExposureModeSchema,
} from "./ipc.ts";

// ─── terminal ────────────────────────────────────────────────────────────────
import { TerminalSessionStatus } from "./terminal.ts";

// ─── provider ────────────────────────────────────────────────────────────────
import { ProviderSession } from "./provider.ts";

function roundTrip<T>(schema: Schema.Schema<T>, value: T) {
  const decoded = Schema.decodeUnknownSync(schema)(value);
  const encoded = Schema.encodeSync(schema)(decoded);
  expect(encoded).toEqual(value);
}

function decodeFail<T>(schema: Schema.Schema<T>, value: unknown) {
  expect(() => Schema.decodeUnknownSync(schema)(value)).toThrow();
}

// ═══════════════════════════════════════════════════════════════════════════════
// baseSchemas — branded strings, constrained ints
// ═══════════════════════════════════════════════════════════════════════════════

describe("baseSchemas", () => {
  describe("TrimmedString", () => {
    it("round-trips and trims", () => {
      const decoded = Schema.decodeUnknownSync(TrimmedString)("  hello  ");
      expect(decoded).toBe("hello");
      expect(Schema.encodeSync(TrimmedString)(decoded)).toBe("hello");
    });
    it("round-trips empty", () => { roundTrip(TrimmedString, ""); });
    it("round-trips plain", () => { roundTrip(TrimmedString, "hello"); });
  });

  describe("TrimmedNonEmptyString", () => {
    it("rejects whitespace-only", () => {
      expect(() => Schema.decodeUnknownSync(TrimmedNonEmptyString)("  ")).toThrow();
    });
  });

  describe("NonNegativeInt", () => {
    it("round-trips 0", () => { roundTrip(NonNegativeInt, 0); });
    it("round-trips 42", () => { roundTrip(NonNegativeInt, 42); });
    it("rejects -1", () => { decodeFail(NonNegativeInt, -1); });
  });

  describe("PositiveInt", () => {
    it("round-trips 1", () => { roundTrip(PositiveInt, 1); });
    it("rejects 0", () => { decodeFail(PositiveInt, 0); });
    it("rejects -5", () => { decodeFail(PositiveInt, -5); });
  });

  describe("PortSchema", () => {
    it("round-trips 80", () => { roundTrip(PortSchema, 80); });
    it("round-trips 65535", () => { roundTrip(PortSchema, 65535); });
    it("rejects 0", () => { decodeFail(PortSchema, 0); });
    it("rejects >65535", () => { decodeFail(PortSchema, 70000); });
  });

  describe("IsoDateTime", () => {
    it("round-trips", () => { roundTrip(IsoDateTime, "2026-05-22T01:00:00Z"); });
    it("round-trips empty", () => { roundTrip(IsoDateTime, ""); });
  });

  describe("Branded IDs", () => {
    const cases: [string, Schema.Schema<string>, string][] = [
      ["ThreadId", ThreadId, "th-1"], ["ProjectId", ProjectId, "pj-1"],
      ["EnvironmentId", EnvironmentId, "env-1"], ["CommandId", CommandId, "cmd-1"],
      ["EventId", EventId, "evt-1"], ["MessageId", MessageId, "msg-1"],
      ["TurnId", TurnId, "turn-1"], ["AuthSessionId", AuthSessionId, "as-1"],
      ["ProviderItemId", ProviderItemId, "pi-1"], ["RuntimeSessionId", RuntimeSessionId, "rs-1"],
      ["RuntimeItemId", RuntimeItemId, "ri-1"], ["RuntimeRequestId", RuntimeRequestId, "rr-1"],
      ["RuntimeTaskId", RuntimeTaskId, "rt-1"], ["ApprovalRequestId", ApprovalRequestId, "ar-1"],
      ["CheckpointRef", CheckpointRef, "cp-1"],
    ];
    cases.forEach(([name, schema, valid]) => {
      describe(name, () => {
        it("round-trips", () => { roundTrip(schema, valid); });
        it("rejects empty", () => { decodeFail(schema, ""); });
      });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Literal schemas
// ═══════════════════════════════════════════════════════════════════════════════

function testLiteral(schema: Schema.Schema<string>, values: string[], description: string) {
  describe(description, () => {
    values.forEach((v) => {
      it(`round-trips ${v}`, () => { roundTrip(schema, v); });
    });
    it("rejects invalid", () => { decodeFail(schema, "bad-value"); });
  });
}

testLiteral(ServerAuthPolicy,
  ["desktop-managed-local", "loopback-browser", "remote-reachable", "unsafe-no-auth"],
  "ServerAuthPolicy");
testLiteral(ServerAuthBootstrapMethod, ["desktop-bootstrap", "one-time-token"], "ServerAuthBootstrapMethod");
testLiteral(ServerAuthSessionMethod, ["browser-session-cookie", "bearer-session-token"], "ServerAuthSessionMethod");
testLiteral(AuthSessionRole, ["owner", "client"], "AuthSessionRole");
testLiteral(AuthClientMetadataDeviceType, ["desktop", "mobile", "tablet", "bot", "unknown"], "AuthClientMetadataDeviceType");
testLiteral(ExecutionEnvironmentPlatformOs, ["darwin", "linux", "windows", "unknown"], "ExecutionEnvironmentPlatformOs");
testLiteral(ExecutionEnvironmentPlatformArch, ["arm64", "x64", "other"], "ExecutionEnvironmentPlatformArch");
testLiteral(EnvironmentConnectionState, ["connecting", "connected", "disconnected", "error"], "EnvironmentConnectionState");
testLiteral(AdvertisedEndpointProviderKind, ["core", "private-network", "tunnel", "manual"], "AdvertisedEndpointProviderKind");
testLiteral(AdvertisedEndpointReachability, ["loopback", "lan", "private-network", "public"], "AdvertisedEndpointReachability");
testLiteral(AdvertisedEndpointHostedHttpsCompatibility, ["compatible", "mixed-content-blocked", "requires-configuration", "unknown"], "AdvertisedEndpointHostedHttpsCompatibility");
testLiteral(ProviderOptionDescriptorType, ["select", "boolean"], "ProviderOptionDescriptorType");
testLiteral(VcsDriverKind, ["git", "jj", "unknown"], "VcsDriverKind");
testLiteral(SourceControlCloneProtocol, ["https", "ssh"], "SourceControlCloneProtocol");
testLiteral(EditorLaunchStyle, ["direct-path", "goto", "line-column"], "EditorLaunchStyle");
testLiteral(VcsFreshnessSource, ["live-local", "cached-local", "cached-remote", "explicit-remote"], "VcsFreshnessSource");
testLiteral(SourceControlProviderKind, ["github", "gitlab", "azure-devops", "bitbucket", "unknown"], "SourceControlProviderKind");
testLiteral(ChangeRequestState, ["open", "closed", "merged"], "ChangeRequestState");
testLiteral(DesktopUpdateStatusSchema, ["disabled", "idle", "checking", "up-to-date", "available", "downloading", "downloaded", "error"], "DesktopUpdateStatus");
testLiteral(DesktopRuntimeArchSchema, ["arm64", "x64", "other"], "DesktopRuntimeArch");
testLiteral(DesktopThemeSchema, ["system", "light", "dark"], "DesktopTheme");
testLiteral(DesktopUpdateChannelSchema, ["latest", "nightly"], "DesktopUpdateChannel");
testLiteral(DesktopServerExposureModeSchema, ["local-only", "network-accessible"], "DesktopServerExposureMode");

// ═══════════════════════════════════════════════════════════════════════════════
// Simple structs
// ═══════════════════════════════════════════════════════════════════════════════

describe("DesktopBackendBootstrap", () => {
  it("round-trips", () => {
    roundTrip(DesktopBackendBootstrap, {
      mode: "desktop", noBrowser: true, port: 3000, t3Home: "/home/user/.t3",
      host: "localhost", desktopBootstrapToken: "token123",
      tailscaleServeEnabled: false, tailscaleServePort: 8080,
    });
  });
  it("round-trips with otlp", () => {
    roundTrip(DesktopBackendBootstrap, {
      mode: "desktop", noBrowser: false, port: 9090, t3Home: "/tmp/t3",
      host: "0.0.0.0", desktopBootstrapToken: "tok456",
      tailscaleServeEnabled: true, tailscaleServePort: 9090,
      otlpTracesUrl: "http://otel:4318/v1/traces",
      otlpMetricsUrl: "http://otel:4318/v1/metrics",
    });
  });
});

describe("ProviderOptionChoice", () => {
  it("round-trips", () => {
    roundTrip(ProviderOptionChoice, { id: "gpt-4", label: "GPT-4", description: "Test" });
  });
});

describe("ProviderSession", () => {
  it("round-trips minimal", () => {
    roundTrip(ProviderSession, {
      provider: "codex", status: "ready", runtimeMode: "full-access",
      threadId: "th-1", createdAt: "2026-05-22T00:00:00Z", updatedAt: "2026-05-22T00:00:00Z",
    });
  });
});
